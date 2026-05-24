const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { writeLimiter } = require('../middlewares/rateLimits');
const estoque = require('../services/estoqueService');

router.use(authMiddleware, adminMiddleware);

router.get('/', async (req, res) => {
  if (!req.query.store_id) {
    return res.status(400).json({ message: 'store_id é obrigatório.' });
  }
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const result = await estoque.list({
      storeId: req.query.store_id,
      lowOnly: req.query.low_only === 'true' || req.query.low_only === '1',
      q: req.query.q,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) {
    console.error('[admin/estoque] list:', err);
    res.status(500).json({ message: 'Erro ao listar estoque' });
  }
});

router.patch('/:product_id', writeLimiter, async (req, res) => {
  const { store_id, quantidade, minimo } = req.body || {};
  if (!store_id) return res.status(400).json({ message: 'store_id é obrigatório.' });
  try {
    const updated = await estoque.upsert({
      productId: req.params.product_id,
      storeId: store_id,
      quantidade,
      minimo,
    });
    res.json(updated);
  } catch (err) {
    console.error('[admin/estoque] upsert:', err);
    res.status(500).json({ message: 'Erro ao atualizar estoque' });
  }
});

module.exports = router;
