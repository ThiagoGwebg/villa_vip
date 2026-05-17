const supabase = require('../config/supabase');

/**
 * Verifica no banco se o e-mail pertence a um administrador.
 *
 * Consulta a coluna booleana `admin` da tabela `profiles`, casando pelo e-mail
 * de forma case-insensitive (`ilike`). A tabela `profiles` deve estar
 * sincronizada com `auth.users`.
 *
 * Deny-by-default: e-mail vazio, erro de consulta ou usuário inexistente
 * resultam em `false`.
 *
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function isAdminEmail(email) {
  const normalized = (email || '').trim();
  if (!normalized) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('admin')
    .ilike('email', normalized)
    .maybeSingle();

  if (error) {
    console.error('[admin] Erro ao consultar status de admin no banco:', error);
    return false;
  }

  return data?.admin === true;
}

module.exports = { isAdminEmail };
  