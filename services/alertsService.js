const supabase = require('../config/supabase');

/**
 * Alertas operacionais (estoque baixo, pedido parado).
 *
 * A geração roda via pg_cron. O backend só lê / marca como lido / dispara
 * geração on-demand (fallback caso pg_cron não esteja habilitado).
 */

async function list({ unreadOnly = false, limit = 50, offset = 0 } = {}) {
  let q = supabase
    .from('alerts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (unreadOnly) q = q.is('lido_em', null);

  const { data, error, count } = await q;
  if (error) throw error;
  return { total: count ?? 0, items: data || [], limit, offset };
}

async function countUnread() {
  const { count, error } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .is('lido_em', null);
  if (error) throw error;
  return count || 0;
}

async function markRead(id) {
  const { data, error } = await supabase
    .from('alerts')
    .update({ lido_em: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function markAllRead() {
  const { error } = await supabase
    .from('alerts')
    .update({ lido_em: new Date().toISOString() })
    .is('lido_em', null);
  if (error) throw error;
}

/** Dispara `public.gerar_alertas()` no Postgres. */
async function regenerate() {
  const { error } = await supabase.rpc('gerar_alertas');
  if (error) throw error;
}

module.exports = { list, countUnread, markRead, markAllRead, regenerate };
