const { createOrder, listOrders } = require('../services/orderService');

/** GET /api/orders — histórico de pedidos do usuário logado (30 dias). */
const list = async (req, res) => {
  try {
    const pedidos = await listOrders(req.token, req.user.id);
    res.json({ total: pedidos.length, pedidos });
  } catch (err) {
    console.error('Order list error:', err);
    res.status(500).json({ message: err.message || 'Erro ao carregar pedidos' });
  }
};

/** POST /api/orders — grava um pedido finalizado pelo WhatsApp. */
const create = async (req, res) => {
  const { itens } = req.body;

  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ message: 'Pedido sem itens.' });
  }

  // Total sempre recalculado no servidor (não confia no valor do cliente).
  const total = itens.reduce(
    (s, i) => s + Number(i.preco || 0) * Number(i.qty || 0),
    0
  );

  // Snapshot enxuto: só o que a aba "Meus Pedidos" precisa renderizar.
  const limpos = itens.map((i) => ({
    id: i.id,
    nome: i.nome,
    marca: i.marca,
    categoria: i.categoria ?? null,
    size: i.size ?? null,
    preco: Number(i.preco || 0),
    qty: Number(i.qty || 0),
  }));

  try {
    const pedido = await createOrder(
      req.token,
      req.user.id,
      limpos,
      Math.round(total * 100) / 100
    );
    res.status(201).json({ pedido });
  } catch (err) {
    console.error('Order create error:', err);
    res.status(500).json({ message: err.message || 'Erro ao salvar pedido' });
  }
};

module.exports = { list, create };
