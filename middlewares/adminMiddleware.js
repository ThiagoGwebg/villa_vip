/**
 * Autorização de administrador para o painel de BI.
 *
 * Roda DEPOIS do authMiddleware (que valida a sessão Supabase e popula
 * req.user). Consulta a coluna `admin` da tabela `users` no banco, casando
 * pelo e-mail de req.user — não usa mais a allowlist ADMIN_EMAILS do .env.
 *
 * Deny-by-default: e-mail ausente, usuário não encontrado ou admin=false → 403.
 */
const { isAdminEmail } = require('../services/adminService');

const adminMiddleware = async (req, res, next) => {
  try {
    if (await isAdminEmail(req.user?.email)) return next();

    return res.status(403).json({
      code: 'NOT_ADMIN',
      message: 'Acesso restrito a administradores.',
    });
  } catch (err) {
    console.error('Admin middleware error:', err);
    return res.status(500).json({ message: 'Erro ao validar permissão de admin' });
  }
};

module.exports = adminMiddleware;
