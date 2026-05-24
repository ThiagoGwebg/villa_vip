const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { writeLimiter } = require('../middlewares/rateLimits');
const alerts = require('../services/alertsService');

router.use(authMiddleware, adminMiddleware);

router.get('/', async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    res.json(await alerts.list({
      unreadOnly: req.query.unread === 'true' || req.query.unread === '1',
      limit, offset,
    }));
  } catch (err) {
    console.error('[admin/alerts] list:', err);
    res.status(500).json({ message: 'Erro ao listar alertas' });
  }
});

router.get('/unread-count', async (_req, res) => {
  try {
    res.json({ count: await alerts.countUnread() });
  } catch {
    // Tabela pode não existir ainda — não derruba o sino, devolve 0.
    res.json({ count: 0 });
  }
});

router.patch('/:id/read', writeLimiter, async (req, res) => {
  try {
    const updated = await alerts.markRead(req.params.id);
    if (!updated) return res.status(404).json({ message: 'Alerta não encontrado' });
    res.json(updated);
  } catch (err) {
    console.error('[admin/alerts] markRead:', err);
    res.status(500).json({ message: 'Erro ao marcar como lido' });
  }
});

router.post('/mark-all-read', writeLimiter, async (_req, res) => {
  try {
    await alerts.markAllRead();
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/alerts] markAllRead:', err);
    res.status(500).json({ message: 'Erro ao marcar tudo como lido' });
  }
});

router.post('/regenerate', writeLimiter, async (_req, res) => {
  try {
    await alerts.regenerate();
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/alerts] regenerate:', err);
    res.status(500).json({ message: 'Erro ao recalcular alertas' });
  }
});

module.exports = router;
