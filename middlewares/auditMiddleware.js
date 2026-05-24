const audit = require('../services/auditService');

/**
 * Middleware factory: registra a request em audit_log quando ela termina
 * com sucesso (2xx). Calcular diff completo é caro e exige um GET prévio;
 * preferimos guardar o `req.body` como `after` (e o caller — controller —
 * pode injetar `res.locals.auditBefore` quando souber o estado anterior).
 *
 * Uso:
 *   router.patch('/:id', writeLimiter, auditAction('order.status_change', 'order'), handler)
 *
 * O `targetId` é capturado de `req.params.id` por padrão; passe uma função
 * `(req,res)=>id` para personalizar.
 */
function auditAction(action, targetType, getTargetId) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const targetId = typeof getTargetId === 'function'
        ? getTargetId(req, res)
        : (req.params?.id ?? null);
      const diff = {
        before: res.locals?.auditBefore ?? null,
        after:  res.locals?.auditAfter  ?? req.body ?? null,
      };
      audit.log({
        actor: req.user,
        action,
        targetType,
        targetId,
        diff,
        req,
      }).catch(() => { /* já loga internamente */ });
    });
    next();
  };
}

module.exports = auditAction;
