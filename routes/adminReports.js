const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const products = require('../services/productsService');
const adminOrders = require('../services/adminOrdersService');
const vendas = require('../services/vendasPresenciaisService');
const estoque = require('../services/estoqueService');
const { toCSV, sendCSV } = require('../services/exportService');

router.use(authMiddleware, adminMiddleware);

/* ---------- Catálogo completo --------------------------------------- */
router.get('/produtos.csv', async (_req, res) => {
  try {
    const items = await products.listAll();
    const csv = toCSV([
      { header: 'ID',         get: (r) => r.id },
      { header: 'Nome',       get: (r) => r.nome },
      { header: 'Categoria',  get: (r) => r.categoria },
      { header: 'Marca',      get: (r) => r.marca },
      { header: 'Preço',      get: (r) => r.preco?.toFixed(2) ?? '' },
      { header: 'Preço De',   get: (r) => r.precoDe == null ? '' : r.precoDe.toFixed(2) },
      { header: 'Desconto %', get: (r) => r.precoDe && r.precoDe > r.preco
            ? (((r.precoDe - r.preco) / r.precoDe) * 100).toFixed(1) : '' },
      { header: 'Tag',        get: (r) => r.tag || '' },
      { header: 'Destaque',   get: (r) => r.destaque ? 'sim' : 'não' },
      { header: 'Tamanhos',   get: (r) => (r.tamanhos || []).join('|') },
      { header: 'Imagem',     get: (r) => r.imagem || '' },
    ], items);
    sendCSV(res, 'catalogo', csv);
  } catch (err) {
    console.error('[reports/produtos] error:', err);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

/* ---------- Pedidos do site (snapshot) ------------------------------- */
router.get('/pedidos.csv', async (req, res) => {
  try {
    // Limite maior para relatório — usuário admin gera sob demanda.
    const { pedidos } = await adminOrders.listOrders({
      status: req.query.status,
      q: req.query.q,
      from: req.query.from,
      to: req.query.to,
      limit: 1000,
      offset: 0,
    });
    const csv = toCSV([
      { header: 'ID',           get: (r) => r.id },
      { header: 'Quando',       get: (r) => r.created_at },
      { header: 'Cliente',      get: (r) => r.user_nome || '' },
      { header: 'E-mail',       get: (r) => r.user_email || '' },
      { header: 'Itens',        get: (r) => (r.itens || []).length },
      { header: 'Resumo',       get: (r) => (r.itens || [])
            .map((i) => `${i.qty}x ${i.nome}${i.size ? ' ('+i.size+')' : ''}`).join(' | ') },
      { header: 'Total',        get: (r) => Number(r.total || 0).toFixed(2) },
      { header: 'Status',       get: (r) => r.status },
    ], pedidos);
    sendCSV(res, 'pedidos', csv);
  } catch (err) {
    console.error('[reports/pedidos] error:', err);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

/* ---------- Vendas presenciais ---------------------------------------- */
router.get('/vendas-presenciais.csv', async (req, res) => {
  try {
    const { items } = await vendas.list({
      storeId: req.query.store_id,
      from: req.query.from,
      to: req.query.to,
      pagamento: req.query.pagamento,
      limit: 1000,
      offset: 0,
    });
    const csv = toCSV([
      { header: 'ID',            get: (r) => r.id },
      { header: 'Quando',        get: (r) => r.createdAt },
      { header: 'Loja ID',       get: (r) => r.storeId },
      { header: 'Vendedor',      get: (r) => r.vendedorNome || '' },
      { header: 'Cliente',       get: (r) => r.clienteNome || '' },
      { header: 'Telefone',      get: (r) => r.clienteTelefone || '' },
      { header: 'Itens',         get: (r) => (r.itens || [])
            .map((i) => `${i.qty}x ${i.nome}${i.size ? ' ('+i.size+')' : ''} @ ${Number(i.preco_unit||0).toFixed(2)}`).join(' | ') },
      { header: 'Subtotal',      get: (r) => r.subtotal.toFixed(2) },
      { header: 'Desconto',      get: (r) => r.desconto.toFixed(2) },
      { header: 'Total',         get: (r) => r.total.toFixed(2) },
      { header: 'Pagamento',     get: (r) => r.pagamento },
      { header: 'Observação',    get: (r) => r.observacao || '' },
    ], items);
    sendCSV(res, 'vendas-presenciais', csv);
  } catch (err) {
    console.error('[reports/vendas-presenciais] error:', err);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

/* ---------- Ruptura de estoque --------------------------------------- */
router.get('/ruptura.csv', async (req, res) => {
  if (!req.query.store_id) {
    return res.status(400).json({ message: 'store_id é obrigatório.' });
  }
  try {
    const { items } = await estoque.list({
      storeId: req.query.store_id,
      lowOnly: true,
      limit: 1000,
      offset: 0,
    });
    const csv = toCSV([
      { header: 'Ref.',         get: (r) => r.productId },
      { header: 'Produto',      get: (r) => r.produto?.nome || '' },
      { header: 'Marca',        get: (r) => r.produto?.marca || '' },
      { header: 'Categoria',    get: (r) => r.produto?.categoria || '' },
      { header: 'Quantidade',   get: (r) => r.quantidade },
      { header: 'Mínimo',       get: (r) => r.minimo },
      { header: 'Diferença',    get: (r) => r.quantidade - r.minimo },
      { header: 'Atualizado',   get: (r) => r.atualizadoEm },
    ], items);
    sendCSV(res, 'ruptura', csv);
  } catch (err) {
    console.error('[reports/ruptura] error:', err);
    res.status(500).json({ message: 'Erro ao gerar relatório' });
  }
});

module.exports = router;
