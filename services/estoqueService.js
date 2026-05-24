const supabase = require('../config/supabase');

/**
 * Estoque por (product_id, store_id). Lê os dados de produto via JOIN
 * implícito do PostgREST (`products(nome,marca,categoria,imagem)`) para
 * a UI mostrar nome/marca sem N+1 do lado do app.
 */

const PRODUCT_FIELDS = 'nome, marca, categoria, imagem, preco, preco_de';

const DB_TO_API = (row) => ({
  productId: row.product_id,
  storeId: row.store_id,
  quantidade: row.quantidade,
  minimo: row.minimo,
  atualizadoEm: row.atualizado_em,
  produto: row.products ? {
    nome: row.products.nome,
    marca: row.products.marca,
    categoria: row.products.categoria,
    imagem: row.products.imagem,
    preco: row.products.preco == null ? null : Number(row.products.preco),
    precoDe: row.products.preco_de == null ? null : Number(row.products.preco_de),
  } : null,
});

async function list({
  storeId,
  lowOnly = false,
  q,
  limit = 50,
  offset = 0,
} = {}) {
  if (!storeId) throw new Error('storeId obrigatório');

  let query = supabase
    .from('estoque')
    .select(`product_id, store_id, quantidade, minimo, atualizado_em,
             products!inner(${PRODUCT_FIELDS})`, { count: 'exact' })
    .eq('store_id', storeId)
    .order('atualizado_em', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    // Filtra pelo nome/ID do produto via embed
    query = query.or(
      `nome.ilike.${term},id.ilike.${term},marca.ilike.${term}`,
      { foreignTable: 'products' }
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  let items = (data || []).map(DB_TO_API);
  if (lowOnly) items = items.filter((it) => it.quantidade <= it.minimo);

  return {
    total: lowOnly ? items.length : (count ?? items.length),
    limit, offset,
    items,
  };
}

async function listLow(storeId, max = 5) {
  if (!storeId) return [];
  const { data, error } = await supabase
    .from('estoque')
    .select(`product_id, store_id, quantidade, minimo, atualizado_em,
             products!inner(${PRODUCT_FIELDS})`)
    .eq('store_id', storeId)
    .order('quantidade', { ascending: true })
    .limit(max * 4);
  if (error) throw error;
  return (data || [])
    .filter((r) => r.quantidade <= r.minimo)
    .slice(0, max)
    .map(DB_TO_API);
}

async function upsert({ productId, storeId, quantidade, minimo }) {
  if (!productId || !storeId) {
    throw new Error('productId e storeId são obrigatórios');
  }
  const row = {
    product_id: productId,
    store_id: storeId,
    quantidade: Math.max(0, parseInt(quantidade, 10) || 0),
    minimo: Math.max(0, parseInt(minimo, 10) || 0),
    atualizado_em: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('estoque')
    .upsert(row, { onConflict: 'product_id,store_id' })
    .select(`product_id, store_id, quantidade, minimo, atualizado_em,
             products(${PRODUCT_FIELDS})`)
    .maybeSingle();
  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

/**
 * Conta SKUs em ruptura nesta loja. PostgREST não compara duas colunas,
 * então a contagem é feita no app (uma loja típica tem dezenas/centenas
 * de SKUs cadastrados — payload pequeno e barato).
 */
async function countLow(storeId) {
  if (!storeId) return 0;
  const { data, error } = await supabase
    .from('estoque')
    .select('quantidade, minimo')
    .eq('store_id', storeId);
  if (error) throw error;
  return (data || []).filter((r) => r.quantidade <= r.minimo).length;
}

module.exports = { list, listLow, upsert, countLow };
