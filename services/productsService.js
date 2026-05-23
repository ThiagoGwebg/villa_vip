const supabase = require('../config/supabase');

/**
 * Acesso à tabela `products` do Supabase, devolvendo objetos no mesmo shape
 * que o catálogo legado servia via data/products.json. Mantém compatibilidade
 * com o front (campos `precoDe` etc.) — o mapeamento DB ↔ API vive aqui.
 */

const DB_TO_API = (row) => ({
  id: row.id,
  nome: row.nome,
  categoria: row.categoria,
  marca: row.marca,
  preco: Number(row.preco),
  precoDe: row.preco_de == null ? null : Number(row.preco_de),
  descricao: row.descricao || '',
  tamanhos: row.tamanhos || [],
  tag: row.tag,
  destaque: !!row.destaque,
  imagem: row.imagem,
});

const API_TO_DB = (p) => ({
  id: String(p.id).trim(),
  nome: String(p.nome).trim(),
  categoria: String(p.categoria).trim(),
  marca: String(p.marca).trim(),
  preco: Number(p.preco),
  preco_de: p.precoDe == null ? null : Number(p.precoDe),
  descricao: String(p.descricao || '').trim(),
  tamanhos: Array.isArray(p.tamanhos) ? p.tamanhos.map(String) : [],
  tag: p.tag || null,
  destaque: Boolean(p.destaque),
  imagem: p.imagem ? String(p.imagem).trim() : null,
});

async function listAll() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(DB_TO_API);
}

async function getById(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .ilike('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

async function exists(id) {
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function create(payload) {
  const row = API_TO_DB(payload);
  const { data, error } = await supabase
    .from('products')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return DB_TO_API(data);
}

async function update(id, payload) {
  const row = API_TO_DB({ ...payload, id });
  delete row.id;

  const { data, error } = await supabase
    .from('products')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

async function remove(id) {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

module.exports = { listAll, getById, exists, create, update, remove };
