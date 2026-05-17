const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { list, create } = require('../controllers/orderController');

// Todo o histórico de pedidos exige sessão válida.
router.get('/', authMiddleware, list);
router.post('/', authMiddleware, create);

module.exports = router;
