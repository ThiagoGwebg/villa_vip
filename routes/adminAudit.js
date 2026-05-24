const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const audit = require('../services/auditService');

router.use(authMiddleware, adminMiddleware);

router.get('/', async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10)  || 30, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    res.json(await audit.list({
      actorEmail: req.query.actor,
      targetType: req.query.target_type,
      action: req.query.action,
      limit, offset,
    }));
  } catch (err) {
    console.error('[admin/audit] list:', err);
    res.status(500).json({ message: 'Erro ao listar auditoria' });
  }
});

module.exports = router;
