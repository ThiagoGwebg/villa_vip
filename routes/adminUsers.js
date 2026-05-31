const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { writeLimiter } = require('../middlewares/rateLimits');
const auditAction = require('../middlewares/auditMiddleware');
const adminUsers = require('../services/adminUsersService');

router.use(authMiddleware, adminMiddleware);

router.get('/', async (_req, res) => {
  try {
    const admins = await adminUsers.listAdmins();
    res.json({ total: admins.length, admins });
  } catch (err) {
    console.error('[admin/users] list:', err);
    res.status(500).json({ message: 'Erro ao listar admins' });
  }
});

router.post('/promote', writeLimiter,
  auditAction('admin.promote', 'profile', (req) => req.body?.email || null),
  async (req, res) => {
    try {
      const updated = await adminUsers.promote(req.body?.email);
      if (!updated) {
        return res.status(404).json({
          message: 'Esse e-mail não está cadastrado. Peça pra pessoa criar conta em /register primeiro.',
        });
      }
      res.json(updated);
    } catch (err) {
      if (err.code === 'INVALID_EMAIL') return res.status(400).json({ message: err.message });
      console.error('[admin/users] promote:', err);
      res.status(500).json({ message: 'Erro ao promover admin' });
    }
  }
);

router.post('/revoke', writeLimiter,
  auditAction('admin.revoke', 'profile', (req) => req.body?.email || null),
  async (req, res) => {
    const target = (req.body?.email || '').trim().toLowerCase();
    // Bloqueio crítico: não permite o admin remover ele mesmo (auto-lockout).
    if (target && target === (req.user?.email || '').toLowerCase()) {
      return res.status(400).json({
        message: 'Você não pode remover o próprio acesso de admin. Peça pra outro admin fazer isso.',
      });
    }
    try {
      const updated = await adminUsers.revoke(req.body?.email);
      if (!updated) {
        return res.status(404).json({ message: 'E-mail não encontrado.' });
      }
      res.json(updated);
    } catch (err) {
      if (err.code === 'INVALID_EMAIL') return res.status(400).json({ message: err.message });
      console.error('[admin/users] revoke:', err);
      res.status(500).json({ message: 'Erro ao remover admin' });
    }
  }
);

module.exports = router;
