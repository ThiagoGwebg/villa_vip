const supabase = require('../config/supabase');

/**
 * Acesso à tabela `stores`. Multi-loja desde o schema: toda query aceita
 * filtrar por id/slug, e os helpers expõem a primeira loja ativa como
 * "default" enquanto a UI não tem seletor.
 */

const DB_TO_API = (row) => ({
  id: row.id,
  slug: row.slug,
  nome: row.nome,
  enderecoLinha1: row.endereco_linha1,
  cidade: row.cidade,
  uf: row.uf,
  cep: row.cep,
  telefone: row.telefone,
  whatsapp: row.whatsapp,
  email: row.email,
  lat: row.lat == null ? null : Number(row.lat),
  lng: row.lng == null ? null : Number(row.lng),
  mapsUrl: row.maps_url,
  horario: row.horario || {},
  fotoFachada: row.foto_fachada,
  ativo: !!row.ativo,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const API_TO_DB = (p) => ({
  slug: p.slug != null ? String(p.slug).trim() : undefined,
  nome: p.nome != null ? String(p.nome).trim() : undefined,
  endereco_linha1: p.enderecoLinha1 != null ? String(p.enderecoLinha1).trim() : undefined,
  cidade: p.cidade != null ? String(p.cidade).trim() : undefined,
  uf: p.uf != null ? String(p.uf).toUpperCase().slice(0, 2) : undefined,
  cep: p.cep != null ? String(p.cep).trim() : undefined,
  telefone: p.telefone != null ? String(p.telefone).trim() : undefined,
  whatsapp: p.whatsapp != null ? String(p.whatsapp).replace(/\D/g, '') : undefined,
  email: p.email != null ? String(p.email).trim() : undefined,
  lat: p.lat != null ? Number(p.lat) : undefined,
  lng: p.lng != null ? Number(p.lng) : undefined,
  maps_url: p.mapsUrl != null ? String(p.mapsUrl).trim() : undefined,
  horario: p.horario != null ? p.horario : undefined,
  foto_fachada: p.fotoFachada !== undefined ? p.fotoFachada : undefined,
  ativo: p.ativo != null ? Boolean(p.ativo) : undefined,
});

function cleanUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

async function listAll({ onlyActive = false } = {}) {
  let q = supabase.from('stores').select('*').order('nome', { ascending: true });
  if (onlyActive) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(DB_TO_API);
}

async function getById(id) {
  const { data, error } = await supabase
    .from('stores').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

async function getDefault() {
  const { data, error } = await supabase
    .from('stores').select('*').eq('ativo', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

async function update(id, patch) {
  const row = cleanUndefined(API_TO_DB(patch));
  if (!Object.keys(row).length) return await getById(id);
  const { data, error } = await supabase
    .from('stores').update(row).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

/**
 * Decide se a loja está aberta agora considerando timezone America/Sao_Paulo
 * e a estrutura jsonb `horario.{dia}: [["HH:MM","HH:MM"], ...]`.
 * Retorna { open, label, nextOpen }.
 */
function isOpenNow(store, now = new Date()) {
  // Pega "weekday" e "HH:MM" no fuso da loja (TZ America/Sao_Paulo).
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const wd = (parts.find((p) => p.type === 'weekday')?.value || '').toLowerCase();
  const hh = parts.find((p) => p.type === 'hour')?.value || '00';
  const mm = parts.find((p) => p.type === 'minute')?.value || '00';
  const hhmm = `${hh}:${mm}`;

  // pt-BR weekday short vem com "dom.", "seg.", "ter." — normaliza pros 3 chars que usamos no jsonb.
  const dayKey = wd.replace('.', '').slice(0, 3);

  const today = (store?.horario || {})[dayKey] || [];
  for (const [from, to] of today) {
    if (hhmm >= from && hhmm < to) {
      return { open: true, label: `Aberta agora · Fecha ${to}` };
    }
  }

  // Procura próxima abertura nos próximos 7 dias
  const order = ['dom','seg','ter','qua','qui','sex','sab'];
  const todayIdx = order.indexOf(dayKey);
  for (let offset = 0; offset < 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const key = order[idx];
    const faixas = (store?.horario || {})[key] || [];
    for (const [from] of faixas) {
      if (offset === 0 && from <= hhmm) continue;
      const labelDay = offset === 0 ? 'hoje'
                     : offset === 1 ? 'amanhã'
                     : ({dom:'domingo',seg:'segunda',ter:'terça',qua:'quarta',qui:'quinta',sex:'sexta',sab:'sábado'})[key];
      return { open: false, label: `Fechada · Abre ${labelDay} ${from}` };
    }
  }
  return { open: false, label: 'Fechada' };
}

module.exports = { listAll, getById, getDefault, update, isOpenNow };
