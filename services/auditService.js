const supabase = require('../config/supabase');

/**
 * Registra um evento de auditoria. Best-effort: nunca derruba a request
 * principal — só loga em console se falhar (ex: tabela ainda não criada).
 */
async function log({ actor, action, targetType, targetId, diff, req }) {
  try {
    await supabase.from('audit_log').insert({
      actor_id: actor?.id || null,
      actor_email: actor?.email || null,
      action,
      target_type: targetType,
      target_id: targetId != null ? String(targetId) : null,
      diff: diff || null,
      ip: req?.ip || null,
      user_agent: (req?.headers?.['user-agent'] || '').slice(0, 500) || null,
    });
  } catch (err) {
    console.error('[audit] falha ao registrar:', err.message);
  }
}

async function list({ actorEmail, targetType, action, limit = 30, offset = 0 } = {}) {
  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (actorEmail) query = query.ilike('actor_email', `%${actorEmail}%`);
  if (targetType) query = query.eq('target_type', targetType);
  if (action)     query = query.ilike('action', `%${action}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { total: count ?? 0, limit, offset, items: data || [] };
}

module.exports = { log, list };
