const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const RETENTION_DAYS = 30;

/**
 * Client Supabase com escopo do próprio usuário (Authorization: Bearer token).
 *
 * Garante que a RLS da tabela `pedidos` enxergue `auth.uid()` mesmo quando a
 * chave do projeto for a `anon`. Se a chave for service-role, a query continua
 * filtrada por `user_id` na mão — defesa nas duas camadas.
 */
function userClient(token) {
  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Data-limite ISO: pedidos anteriores a isto são considerados expirados. */
function cutoffISO() {
  return new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
}

/**
 * Faxina preguiçosa: remove os pedidos do próprio usuário com mais de 30 dias.
 * Roda a cada listagem como rede de segurança caso o pg_cron não esteja ativo.
 * Best-effort — uma falha aqui nunca derruba a listagem.
 */
async function purgeExpired(db, userId) {
  try {
    await db
      .from('pedidos')
      .delete()
      .eq('user_id', userId)
      .lt('created_at', cutoffISO());
  } catch (err) {
    console.error('[orders] Falha na faxina de pedidos expirados:', err);
  }
}

/** Grava um pedido finalizado (snapshot dos itens + total). */
async function createOrder(token, user, itens, total) {
  const db = userClient(token);
  const nome = user?.user_metadata?.nome
    || (user?.email ? user.email.split('@')[0] : null);
  const { data, error } = await db
    .from('pedidos')
    .insert({
      user_id: user.id,
      user_email: user.email || null,
      user_nome: nome,
      itens,
      total,
    })
    .select('id, itens, total, status, created_at')
    .single();

  if (error) {
    console.error('[orders] Erro ao gravar pedido:', error);
    throw new Error('Não foi possível salvar o pedido');
  }
  return data;
}

/** Lista os pedidos do usuário dos últimos 30 dias (mais recentes primeiro). */
async function listOrders(token, userId) {
  const db = userClient(token);
  await purgeExpired(db, userId);

  const { data, error } = await db
    .from('pedidos')
    .select('id, itens, total, status, created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoffISO())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[orders] Erro ao listar pedidos:', error);
    throw new Error('Não foi possível carregar os pedidos');
  }
  return data || [];
}

module.exports = { createOrder, listOrders, RETENTION_DAYS };
