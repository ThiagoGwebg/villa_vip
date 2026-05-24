const supabase = require('../config/supabase');

const ORDER_STATUSES = ['enviado', 'em_andamento', 'concluido', 'cancelado'];

/** Lista pedidos para o admin com filtros e paginação. */
async function listOrders({ status, q, from, to, limit = 20, offset = 0 } = {}) {
  let query = supabase
    .from('pedidos')
    .select('id, user_id, user_email, user_nome, itens, total, status, created_at',
            { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && ORDER_STATUSES.includes(status)) {
    query = query.eq('status', status);
  }
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `user_email.ilike.${term},user_nome.ilike.${term},id.ilike.${term}`
    );
  }
  if (from) query = query.gte('created_at', from);
  if (to)   query = query.lte('created_at', to);

  const { data, error, count } = await query;
  if (error) {
    console.error('[admin/orders] list error:', error);
    throw new Error('Não foi possível listar os pedidos');
  }
  return { total: count ?? 0, pedidos: data || [], limit, offset };
}

/** Atualiza apenas o status de um pedido. */
async function updateStatus(id, status) {
  if (!ORDER_STATUSES.includes(status)) {
    const err = new Error('Status inválido');
    err.code = 'INVALID_STATUS';
    throw err;
  }
  const { data, error } = await supabase
    .from('pedidos')
    .update({ status })
    .eq('id', id)
    .select('id, status, user_id, user_email, user_nome, total, created_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;     // não encontrado
    console.error('[admin/orders] update error:', error);
    throw new Error('Não foi possível atualizar o pedido');
  }
  return data;
}

/** Agregados por status nos últimos N dias. */
async function statsByStatus(days = 30) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('pedidos')
    .select('status, total, created_at')
    .gte('created_at', cutoff);

  if (error) {
    console.error('[admin/orders] stats error:', error);
    throw new Error('Não foi possível calcular estatísticas');
  }

  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, { qtd: 0, total: 0 }]));
  for (const p of data || []) {
    if (!byStatus[p.status]) byStatus[p.status] = { qtd: 0, total: 0 };
    byStatus[p.status].qtd += 1;
    byStatus[p.status].total += Number(p.total || 0);
  }
  const totalGeral = (data || []).reduce((s, p) => s + Number(p.total || 0), 0);
  return { days, total: data?.length || 0, faturamento: Math.round(totalGeral * 100) / 100, byStatus };
}

module.exports = { listOrders, updateStatus, statsByStatus, ORDER_STATUSES };
