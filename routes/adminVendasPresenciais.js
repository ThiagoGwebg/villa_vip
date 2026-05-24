const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { writeLimiter } = require('../middlewares/rateLimits');
const vendas = require('../services/vendasPresenciaisService');

router.use(authMiddleware, adminMiddleware);

router.get('/', async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const result = await vendas.list({
      storeId: req.query.store_id,
      from: req.query.from,
      to: req.query.to,
      pagamento: req.query.pagamento,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    console.error('[admin/vendas] list:', err);
    res.status(500).json({ message: 'Erro ao listar vendas' });
  }
});

router.get('/summary', async (req, res) => {
  if (!req.query.store_id) {
    return res.status(400).json({ message: 'store_id é obrigatório.' });
  }
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const result = await vendas.summary({ storeId: req.query.store_id, days });
    res.json(result);
  } catch (err) {
    console.error('[admin/vendas] summary:', err);
    res.status(500).json({ message: 'Erro ao calcular resumo' });
  }
});

router.post('/', writeLimiter, async (req, res) => {
  try {
    const venda = await vendas.create(req.body || {}, req.user);
    res.status(201).json(venda);
  } catch (err) {
    if (err.code === 'INVALID_ITEMS' || err.code === 'INVALID_PAGAMENTO') {
      return res.status(400).json({ message: err.message });
    }
    console.error('[admin/vendas] create:', err);
    res.status(500).json({ message: 'Erro ao registrar venda' });
  }
});

module.exports = router;
