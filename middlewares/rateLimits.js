/**
 * Rate limiters por contexto.
 *
 * Defesa de primeira linha contra brute force e abuso. Os limites são
 * deliberadamente generosos para nunca atrapalhar o uso legítimo (cliente
 * do catálogo, admin no painel) e estritos o suficiente para conter
 * scripts simples.
 *
 * Limitação conhecida (Vercel serverless): o MemoryStore padrão é
 * recriado a cada cold start, então um atacante distribuído consegue
 * driblar. A camada do edge da Vercel já mitiga DDoS volumétrico — a
 * Fase 3 deste plano substitui o store por algo persistente (Supabase
 * ou Upstash) quando isso virar gargalo real.
 */
const rateLimit = require('express-rate-limit');

const baseHeaders = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
};

// Identidade do cliente: e-mail (login) > usuário autenticado > IP.
const identify = (req) =>
  (req.body && typeof req.body.email === 'string' && req.body.email.toLowerCase()) ||
  req.user?.id ||
  req.ip;

const message = (msg) => ({
  message: msg,
  code: 'RATE_LIMITED',
});

/**
 * Login / registro: até 10 tentativas por IP+email em 15 min. Estreito de
 * propósito — protege contra brute force de senha.
 */
const loginLimiter = rateLimit({
  ...baseHeaders,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: identify,
  message: message('Muitas tentativas. Aguarde alguns minutos e tente novamente.'),
});

/**
 * Mutações de admin (POST/PUT/DELETE): 60 req/min por usuário. Confortável
 * para CRUD humano, derruba scripts maliciosos.
 */
const writeLimiter = rateLimit({
  ...baseHeaders,
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: identify,
  message: message('Você está fazendo alterações rápido demais. Aguarde um momento.'),
});

/**
 * Upload de imagem: 20 por minuto por usuário. Cada upload é caro (até
 * 8 MB em memória + chamada ao Supabase Storage); 20/min é mais que
 * suficiente para um lojista mexendo no catálogo.
 */
const uploadLimiter = rateLimit({
  ...baseHeaders,
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: identify,
  message: message('Limite de uploads atingido. Tente novamente em um minuto.'),
});

/**
 * Analytics: 30 req/min por usuário. Endpoint pesado (recalcula tudo do
 * zero hoje); cap evita loop acidental de polling derrubar o backend.
 */
const analyticsLimiter = rateLimit({
  ...baseHeaders,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: identify,
  message: message('Muitas atualizações da dashboard. Aguarde um momento.'),
});

module.exports = {
  loginLimiter,
  writeLimiter,
  uploadLimiter,
  analyticsLimiter,
};
