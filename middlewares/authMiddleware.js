const supabase = require('../config/supabase');

/**
 * Valida a sessão a partir do access_token do Supabase Auth.
 *
 * O login agora emite `session.access_token` (Supabase), que NÃO é assinado
 * com JWT_SECRET — por isso a verificação é feita contra o próprio Supabase
 * via `auth.getUser(token)`, e não com jsonwebtoken.
 */
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token não fornecido' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      // 401: falha de autenticação (sessão inválida/expirada).
      // 403 fica reservado para "autenticado, porém sem permissão" (admin).
      return res.status(401).json({ message: 'Sessão inválida ou expirada' });
    }

    req.user = data.user;
    // Token cru: usado para criar um client Supabase com escopo do próprio
    // usuário (ex.: auth.updateUser no /api/auth/profile).
    req.token = token;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ message: 'Erro ao validar a sessão' });
  }
};

module.exports = authMiddleware;
