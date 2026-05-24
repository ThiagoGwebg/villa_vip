const supabase = require('../config/supabase');

/**
 * Gestão de admins da loja.
 *
 * Lê e atualiza a flag `profiles.admin`. O usuário precisa já existir
 * (cadastrado via /register.html → linha em `auth.users` espelhada em
 * `profiles` pelo trigger handle_new_user).
 */

const DB_TO_API = (row) => ({
  id: row.id,
  email: row.email,
  nome: row.nome,
  admin: !!row.admin,
  createdAt: row.created_at,
});

async function listAdmins() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, nome, admin, created_at')
    .eq('admin', true)
    .order('email', { ascending: true });
  if (error) throw error;
  return (data || []).map(DB_TO_API);
}

/** Promove um e-mail a admin. Retorna `null` se o e-mail não está cadastrado. */
async function promote(email) {
  const normalized = (email || '').trim();
  if (!normalized) {
    const err = new Error('E-mail é obrigatório.');
    err.code = 'INVALID_EMAIL';
    throw err;
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ admin: true })
    .ilike('email', normalized)
    .select('id, email, nome, admin, created_at')
    .maybeSingle();
  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

/** Revoga admin. Retorna `null` se o e-mail não está cadastrado. */
async function revoke(email) {
  const normalized = (email || '').trim();
  if (!normalized) {
    const err = new Error('E-mail é obrigatório.');
    err.code = 'INVALID_EMAIL';
    throw err;
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ admin: false })
    .ilike('email', normalized)
    .select('id, email, nome, admin, created_at')
    .maybeSingle();
  if (error) throw error;
  return data ? DB_TO_API(data) : null;
}

module.exports = { listAdmins, promote, revoke };
