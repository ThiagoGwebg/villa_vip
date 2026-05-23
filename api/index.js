// Entry point serverless para a Vercel.
// Importa o app Express do server.js (que NÃO chama listen quando carregado
// como módulo). A Vercel transforma esta função em um handler HTTP.
module.exports = require('../server');
