const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { writeLimiter } = require('../middlewares/rateLimits');
const {
  listOrders,
  updateStatus,
  statsByStatus,
  ORDER_STATUSES,
} = require('../services/adminOrdersService');

router.use(authMiddleware, adminMiddleware);

router.get('/', async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10)  || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const result = await listOrders({
      status: req.query.status,
      q: req.query.q,
      from: req.query.from,
      to: req.query.to,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erro ao listar pedidos' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    res.json(await statsByStatus(days));
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erro ao calcular estatísticas' });
  }
});

router.patch('/:id', writeLimiter, async (req, res) => {
  const { status } = req.body || {};
  try {
    const updated = await updateStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ message: 'Pedido não encontrado.' });
    res.json({ pedido: updated });
  } catch (err) {
    if (err.code === 'INVALID_STATUS') {
      return res.status(400).json({
        message: `Status inválido. Use um de: ${ORDER_STATUSES.join(', ')}.`,
      });
    }
    res.status(500).json({ message: err.message || 'Erro ao atualizar pedido' });
  }
});

module.exports = router;
