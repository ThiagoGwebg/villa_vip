/**
 * Autorização de administrador para o painel de BI.
 *
 * Roda DEPOIS do authMiddleware (que valida a sessão Supabase e popula
 * req.user). Compara req.user.email com a allowlist ADMIN_EMAILS do .env
 * (e-mails separados por vírgula).
 *
 * Deny-by-default: sem allowlist configurada, ninguém entra.
 */
const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (adminEmails.length === 0) {
  console.warn(
    "[admin] ADMIN_EMAILS não configurado — o painel /admin está bloqueado " +
      "para todos. Defina no .env, ex.: ADMIN_EMAILS=dono@villavip.com,gerente@villavip.com"
  );
}

const adminMiddleware = (req, res, next) => {
  const email = (req.user?.email || "").trim().toLowerCase();

  if (email && adminEmails.includes(email)) return next();

  return res.status(403).json({
    code: "NOT_ADMIN",
    message: "Acesso restrito a administradores.",
  });
};

module.exports = adminMiddleware;
