const supabase = require('../config/supabase');

const PAGAMENTOS = ['dinheiro', 'pix', 'credito', 'debito', 'crediario', 'outro'];

const DB_TO_API = (row) => ({
  id: row.id,
  storeId: row.store_id,
  itens: row.itens || [],
  subtotal: Number(row.subtotal || 0),
  desconto: Number(row.desconto || 0),
  total: Number(row.total || 0),
  pagamento: row.pagamento,
  vendedorId: row.vendedor_id,
  vendedorNome: row.vendedor_nome,
  clienteNome: row.cliente_nome,
  clienteTelefone: row.cliente_telefone,
  observacao: row.observacao,
  createdAt: row.created_at,
});

function sanitizeItens(itens) {
  if (!Array.isArray(itens) || !itens.length) {
    const err = new Error('Pedido sem itens.');
    err.code = 'INVALID_ITEMS';
    throw err;
  }
  return itens.map((i) => ({
    product_id: String(i.productId || i.product_id || '').trim(),
    nome: String(i.nome || ''),
    size: i.size != null ? String(i.size) : null,
    qty: Math.max(1, parseInt(i.qty, 10) || 1),
    preco_unit: Number(i.precoUnit ?? i.preco_unit ?? i.preco ?? 0),
  }));
}

async function create(payload, actor) {
  if (!payload?.storeId) throw new Error('storeId obrigatório');
  if (!PAGAMENTOS.includes(payload.pagamento)) {
    const err = new Error('Forma de pagamento inválida.');
    err.code = 'INVALID_PAGAMENTO';
    throw err;
  }

  const itens = sanitizeItens(payload.itens);
  const subtotal = itens.reduce((s, i) => s + i.preco_unit * i.qty, 0);
  const desconto = Math.max(0, Number(payload.desconto || 0));
  const total = Math.max(0, Math.round((subtotal - desconto) * 100) / 100);

  const row = {
    store_id: payload.storeId,
    itens,
    subtotal: Math.round(subtotal * 100) / 100,
    desconto: Math.round(desconto * 100) / 100,
    total,
    pagamento: payload.pagamento,
    vendedor_id: actor?.id || null,
    vendedor_nome: actor?.user_metadata?.nome
      || (actor?.email ? actor.email.split('@')[0] : null),
    cliente_nome: payload.clienteNome ? String(payload.clienteNome).trim() : null,
    cliente_telefone: payload.clienteTelefone
      ? String(payload.clienteTelefone).replace(/\D/g, '') : null,
    observacao: payload.observacao ? String(payload.observacao).trim() : null,
  };

  const { data, error } = await supabase
    .from('vendas_presenciais')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return DB_TO_API(data);
}

async function list({
  storeId,
  from,
  to,
  pagamento,
  limit = 20,
  offset = 0,
} = {}) {
  let query = supabase
    .from('vendas_presenciais')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (storeId)   query = query.eq('store_id', storeId);
  if (pagamento) query = query.eq('pagamento', pagamento);
  if (from)      query = query.gte('created_at', from);
  if (to)        query = query.lte('created_at', to);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    total: count ?? 0,
    limit, offset,
    items: (data || []).map(DB_TO_API),
  };
}

/**
 * Resumo dos últimos N dias: faturamento, qtd vendas, ticket médio,
 * mix por pagamento. Usado pelo widget "Loja Física" da dashboard.
 */
async function summary({ storeId, days = 30 } = {}) {
  if (!storeId) return null;
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const startDay = new Date(); startDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('vendas_presenciais')
    .select('total, pagamento, created_at, itens')
    .eq('store_id', storeId)
    .gte('created_at', cutoff);
  if (error) throw error;

  const rows = data || [];
  const totalPeriodo = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalHoje    = rows
    .filter((r) => new Date(r.created_at) >= startDay)
    .reduce((s, r) => s + Number(r.total || 0), 0);
  const qtdHoje      = rows.filter((r) => new Date(r.created_at) >= startDay).length;

  const mix = {};
  for (const r of rows) {
    const k = r.pagamento || 'outro';
    mix[k] = (mix[k] || 0) + Number(r.total || 0);
  }

  return {
    days,
    qtd: rows.length,
    faturamento: round(totalPeriodo),
    ticketMedio: rows.length ? round(totalPeriodo / rows.length) : 0,
    hoje: {
      qtd: qtdHoje,
      faturamento: round(totalHoje),
    },
    mixPagamento: Object.entries(mix).map(([pagamento, valor]) => ({
      pagamento, valor: round(valor),
    })).sort((a, b) => b.valor - a.valor),
  };
}

/**
 * Top SKUs vendidos no balcão nos últimos N dias.
 */
async function topProducts({ storeId, days = 30, limit = 5 } = {}) {
  if (!storeId) return [];
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('vendas_presenciais')
    .select('itens')
    .eq('store_id', storeId)
    .gte('created_at', cutoff);
  if (error) throw error;

  const counter = new Map();
  for (const venda of data || []) {
    for (const item of (venda.itens || [])) {
      const id = item.product_id;
      if (!id) continue;
      const cur = counter.get(id) || { productId: id, nome: item.nome, qty: 0, valor: 0 };
      cur.qty   += Number(item.qty || 0);
      cur.valor += Number(item.qty || 0) * Number(item.preco_unit || 0);
      cur.nome   = cur.nome || item.nome;
      counter.set(id, cur);
    }
  }
  return [...counter.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit)
    .map((t) => ({ ...t, valor: round(t.valor) }));
}

function round(n) { return Math.round(Number(n || 0) * 100) / 100; }

module.exports = { create, list, summary, topProducts, PAGAMENTOS };
