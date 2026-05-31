/**
 * Catálogo Web Dinâmico — Villa Vip Country Store
 * Backend full-stack em Node.js (Express). Sync Services.
 *
 * - Serve a vitrine estática (public/) — apenas em dev local
 * - API REST de catálogo (Supabase) com filtro por categoria, marca e busca textual
 * - Endpoint de metadados da loja (WhatsApp, marcas, categorias)
 *
 * Persistência: Supabase (Postgres + Storage). Produção: serverless na Vercel.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');

// require() do JSON garante que o arquivo é incluído pelo bundler da Vercel.
const storeData = require('./data/store.json');

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const userDataRoutes = require('./routes/userData');
const adminOrdersRoutes = require('./routes/adminOrders');
const adminStoresRoutes = require('./routes/adminStores');
const adminEstoqueRoutes = require('./routes/adminEstoque');
const adminVendasRoutes = require('./routes/adminVendasPresenciais');
const adminReportsRoutes = require('./routes/adminReports');
const adminAuditRoutes = require('./routes/adminAudit');
const adminAlertsRoutes = require('./routes/adminAlerts');
const adminUsersRoutes = require('./routes/adminUsers');
const storesService = require('./services/storesService');
const estoqueService = require('./services/estoqueService');
const vendasService = require('./services/vendasPresenciaisService');
const authMiddleware = require('./middlewares/authMiddleware');
const adminMiddleware = require('./middlewares/adminMiddleware');
const {
  loginLimiter,
  writeLimiter,
  uploadLimiter,
  analyticsLimiter,
} = require('./middlewares/rateLimits');
const auditAction = require('./middlewares/auditMiddleware');
const products = require('./services/productsService');
const { uploadProductImage } = require('./services/storageService');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_SERVERLESS = !!process.env.VERCEL;

const PUBLIC_DIR = path.join(__dirname, 'public');

/** store.json é read-only e raramente muda — já carregado via require(). */
function loadStore() {
  return storeData;
}

/** Upload em memória — escrita em disco não funciona em serverless. */
const imgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

/** Normaliza texto para busca (sem acento, minúsculo). */
function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

app.use(express.json());
// Confia no proxy da Vercel para que rate-limit veja o IP real do cliente.
app.set('trust proxy', 1);
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/user-data', userDataRoutes);
app.use('/api/admin/orders', adminOrdersRoutes);
app.use('/api/admin/stores', adminStoresRoutes);
app.use('/api/admin/estoque', adminEstoqueRoutes);
app.use('/api/admin/vendas-presenciais', adminVendasRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/admin/audit', adminAuditRoutes);
app.use('/api/admin/alerts', adminAlertsRoutes);
app.use('/api/admin/users', adminUsersRoutes);

// Em produção (Vercel) os assets passam por aqui também — vercel.json
// roteia todas as requisições para esta função; o Cache-Control abaixo
// permite que a CDN da Vercel cache os estáticos no edge.
app.use(
  express.static(PUBLIC_DIR, {
    maxAge: IS_SERVERLESS ? '1h' : 0,
    etag: true,
    setHeaders(res) {
      res.setHeader('X-Powered-By', 'Sync Services');
      if (!IS_SERVERLESS) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

/** Metadados da loja: consumidos pelo front para montar o link do WhatsApp. */
app.get('/api/store', (_req, res) => {
  res.json(loadStore());
});

/**
 * Catálogo com filtros opcionais:
 *   ?categoria=botas
 *   ?marca=Eldorado,TX Farm
 *   ?q=texana
 *   ?ordenar=preco-asc|preco-desc|destaque
 */
app.get('/api/products', async (req, res) => {
  try {
    let produtos = await products.listAll();
    const { categoria, marca, q, ordenar } = req.query;

    if (categoria && categoria !== 'todos') {
      produtos = produtos.filter((p) => p.categoria === categoria);
    }

    if (marca) {
      const marcas = String(marca)
        .split(',')
        .map((m) => normalize(m))
        .filter(Boolean);
      if (marcas.length) {
        produtos = produtos.filter((p) => marcas.includes(normalize(p.marca)));
      }
    }

    if (q) {
      const termo = normalize(q);
      produtos = produtos.filter(
        (p) =>
          normalize(p.nome).includes(termo) ||
          normalize(p.marca).includes(termo) ||
          normalize(p.descricao).includes(termo)
      );
    }

    switch (ordenar) {
      case 'preco-asc':
        produtos.sort((a, b) => a.preco - b.preco);
        break;
      case 'preco-desc':
        produtos.sort((a, b) => b.preco - a.preco);
        break;
      case 'destaque':
        produtos.sort((a, b) => Number(b.destaque) - Number(a.destaque));
        break;
    }

    res.json({ total: produtos.length, produtos });
  } catch (err) {
    console.error('[products] list error:', err);
    res.status(500).json({ message: 'Erro ao listar produtos' });
  }
});

/** Produto único por ID (página de detalhe / deep-link). */
app.get('/api/products/:id', async (req, res) => {
  try {
    const produto = await products.getById(req.params.id);
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(produto);
  } catch (err) {
    console.error('[products] get error:', err);
    res.status(500).json({ message: 'Erro ao buscar produto' });
  }
});

/**
 * Bloco "Lojas Físicas" da dashboard.
 *
 * Para cada loja ativa, anexa o resumo de vendas presenciais dos últimos
 * 30 dias, top SKUs, contagem de SKUs em ruptura e flag aberto/fechado.
 * Falhas individuais (ex.: estoque sem cadastro) são silenciosas para não
 * derrubar a dashboard inteira.
 */
async function buildLojasBlock() {
  let lojas;
  try {
    lojas = await storesService.listAll({ onlyActive: true });
  } catch (err) {
    console.error('[analytics/lojas] falhou ao listar lojas:', err);
    return [];
  }

  const enriched = await Promise.all(
    lojas.map(async (loja) => {
      const safe = (p) => p.catch((err) => {
        console.error(`[analytics/lojas] ${loja.slug}:`, err);
        return null;
      });
      const [summary, top, ruptura] = await Promise.all([
        safe(vendasService.summary({ storeId: loja.id, days: 30 })),
        safe(vendasService.topProducts({ storeId: loja.id, days: 30, limit: 5 })),
        safe(estoqueService.countLow(loja.id)),
      ]);
      return {
        ...loja,
        status: storesService.isOpenNow(loja),
        vendas30d: summary || { qtd: 0, faturamento: 0, ticketMedio: 0, hoje: { qtd: 0, faturamento: 0 }, mixPagamento: [] },
        topSkus: top || [],
        rupturaCount: ruptura || 0,
      };
    })
  );
  return enriched;
}

/**
 * Business Intelligence do catálogo.
 *
 * 100% derivado de products + store.json — nada simulado. Toda a matemática
 * vive aqui (fonte única de verdade) e o front só renderiza.
 */
async function buildAnalytics() {
  const produtos = await products.listAll();
  const store = loadStore();

  // id -> nome amigável da categoria ("todos" é filtro de UI, não categoria real).
  const catNome = {};
  for (const c of store.categorias || []) {
    if (c.id !== 'todos') catNome[c.id] = c.nome;
  }

  const round = (n) => Math.round(n * 100) / 100;
  const precos = produtos.map((p) => p.preco);
  const promo = produtos.filter((p) => p.precoDe && p.precoDe > p.preco);
  const descontoPct = (p) => ((p.precoDe - p.preco) / p.precoDe) * 100;

  const economiaTotal = promo.reduce((s, p) => s + (p.precoDe - p.preco), 0);
  const descontoMedio = promo.length
    ? promo.reduce((s, p) => s + descontoPct(p), 0) / promo.length
    : 0;
  const totalTamanhos = produtos.reduce(
    (s, p) => s + (p.tamanhos?.length || 0),
    0
  );

  const agrupar = (chave) => {
    const m = new Map();
    for (const p of produtos) {
      const k = chave(p);
      const g = m.get(k) || { qtd: 0, soma: 0, promo: 0, tam: 0 };
      g.qtd++;
      g.soma += p.preco;
      g.tam += p.tamanhos?.length || 0;
      if (p.precoDe && p.precoDe > p.preco) g.promo++;
      m.set(k, g);
    }
    return m;
  };

  const catMap = agrupar((p) => p.categoria);
  const porCategoria = [...catMap.entries()]
    .map(([id, g]) => ({
      id,
      nome: catNome[id] || id,
      qtd: g.qtd,
      precoMedio: round(g.soma / g.qtd),
      valorTotal: round(g.soma),
      mediaTamanhos: round(g.tam / g.qtd),
      emPromocao: g.promo,
    }))
    .sort((a, b) => b.qtd - a.qtd);

  const marcaMap = agrupar((p) => p.marca);
  const porMarca = [...marcaMap.entries()]
    .map(([marca, g]) => ({
      marca,
      qtd: g.qtd,
      precoMedio: round(g.soma / g.qtd),
      valorTotal: round(g.soma),
      emPromocao: g.promo,
    }))
    .sort((a, b) => b.qtd - a.qtd);

  const faixasDef = [
    [0, 100, 'Até R$ 100'],
    [100, 200, 'R$ 100–200'],
    [200, 300, 'R$ 200–300'],
    [300, 400, 'R$ 300–400'],
    [400, 600, 'R$ 400–600'],
    [600, Infinity, 'R$ 600+'],
  ];
  const faixasPreco = faixasDef.map(([min, max, label]) => ({
    label,
    qtd: produtos.filter((p) => p.preco >= min && p.preco < max).length,
  }));

  const tagMap = new Map();
  for (const p of produtos) {
    const t = p.tag || 'Sem etiqueta';
    tagMap.set(t, (tagMap.get(t) || 0) + 1);
  }
  const tags = [...tagMap.entries()]
    .map(([tag, qtd]) => ({ tag, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  const categoriasMatriz = porCategoria.map((c) => ({ id: c.id, nome: c.nome }));
  const marcasMatriz = porMarca.map((m) => m.marca);
  const grid = marcasMatriz.map((marca) =>
    categoriasMatriz.map(
      (c) =>
        produtos.filter((p) => p.marca === marca && p.categoria === c.id).length
    )
  );

  const ordenarPreco = [...produtos].sort((a, b) => b.preco - a.preco);
  const topCaros = ordenarPreco.slice(0, 5).map((p) => ({
    id: p.id,
    nome: p.nome,
    marca: p.marca,
    preco: p.preco,
  }));

  const topDescontos = [...promo]
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      marca: p.marca,
      preco: p.preco,
      precoDe: p.precoDe,
      descontoPct: round(descontoPct(p)),
      economia: round(p.precoDe - p.preco),
    }))
    .sort((a, b) => b.descontoPct - a.descontoPct)
    .slice(0, 5);

  const destaques = produtos
    .filter((p) => p.destaque)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      marca: p.marca,
      categoria: catNome[p.categoria] || p.categoria,
      preco: p.preco,
      precoDe: p.precoDe,
      tag: p.tag,
    }));

  const lojas = await buildLojasBlock();

  return {
    loja: store.nome,
    lojas,
    geradoEm: new Date().toISOString(),
    resumo: {
      totalProdutos: produtos.length,
      totalCategorias: porCategoria.length,
      totalMarcas: porMarca.length,
      precoMedio: produtos.length
        ? round(precos.reduce((s, n) => s + n, 0) / precos.length)
        : 0,
      precoMin: precos.length ? Math.min(...precos) : 0,
      precoMax: precos.length ? Math.max(...precos) : 0,
      valorCatalogo: round(precos.reduce((s, n) => s + n, 0)),
      emPromocao: promo.length,
      pctPromocao: produtos.length
        ? round((promo.length / produtos.length) * 100)
        : 0,
      descontoMedioPct: round(descontoMedio),
      economiaTotal: round(economiaTotal),
      emDestaque: produtos.filter((p) => p.destaque).length,
      pctDestaque: produtos.length
        ? round(
            (produtos.filter((p) => p.destaque).length / produtos.length) * 100
          )
        : 0,
      variacoesTamanho: totalTamanhos,
      mediaTamanhos: produtos.length ? round(totalTamanhos / produtos.length) : 0,
    },
    porCategoria,
    porMarca,
    faixasPreco,
    tags,
    matriz: { categorias: categoriasMatriz, marcas: marcasMatriz, grid },
    topCaros,
    topDescontos,
    destaques,
  };
}

// Protegido: sessão Supabase válida (authMiddleware) + admin (adminMiddleware).
app.get('/api/analytics', authMiddleware, adminMiddleware, analyticsLimiter, async (_req, res) => {
  try {
    res.json(await buildAnalytics());
  } catch (err) {
    console.error('[analytics] error:', err);
    res.status(500).json({ message: 'Erro ao gerar analytics' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* -----------------------------------------------------------------------
   Upload de imagem de produto — Supabase Storage.
----------------------------------------------------------------------- */
app.post(
  '/api/admin/upload',
  authMiddleware,
  adminMiddleware,
  uploadLimiter,
  auditAction('product.image_upload', 'product_image', () => null),
  imgUpload.single('imagem'),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: 'Arquivo inválido ou maior que 8 MB.' });
    }
    try {
      const url = await uploadProductImage(req.file);
      res.json({ url });
    } catch (err) {
      console.error('[upload] error:', err);
      res.status(500).json({ message: 'Falha ao enviar imagem.' });
    }
  }
);

/* -----------------------------------------------------------------------
   CRUD de produtos — sessão válida + perfil admin.
----------------------------------------------------------------------- */
app.get('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Modo legado: sem query (ou ?all=1) devolve tudo — preserva clientes existentes.
    if (req.query.all === '1' || Object.keys(req.query).length === 0) {
      return res.json(await products.listAll());
    }
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10)  || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    res.json(await products.listPaginated({
      limit,
      offset,
      q: req.query.q,
      categoria: req.query.categoria,
      marca: req.query.marca,
      sort: req.query.sort,
    }));
  } catch (err) {
    console.error('[admin/products] list error:', err);
    res.status(500).json({ message: 'Erro ao listar produtos' });
  }
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, writeLimiter,
  auditAction('product.create', 'product', (req) => req.body?.id),
  async (req, res) => {
  const p = req.body;
  if (!p.id || !p.nome || !p.categoria || !p.marca || p.preco == null) {
    return res
      .status(400)
      .json({ message: 'Campos obrigatórios: id, nome, categoria, marca, preco' });
  }
  try {
    if (await products.exists(String(p.id).trim())) {
      return res.status(409).json({ message: 'Já existe um produto com esse ID.' });
    }
    const novo = await products.create(p);
    res.status(201).json(novo);
  } catch (err) {
    console.error('[admin/products] create error:', err);
    res.status(500).json({ message: 'Erro ao criar produto' });
  }
});

app.put('/api/admin/products/:id', authMiddleware, adminMiddleware, writeLimiter,
  auditAction('product.update', 'product'),
  async (req, res) => {
  const p = req.body;
  if (!p.nome || !p.categoria || !p.marca || p.preco == null) {
    return res
      .status(400)
      .json({ message: 'Campos obrigatórios: nome, categoria, marca, preco' });
  }
  try {
    const atualizado = await products.update(req.params.id, p);
    if (!atualizado) return res.status(404).json({ message: 'Produto não encontrado.' });
    res.json(atualizado);
  } catch (err) {
    console.error('[admin/products] update error:', err);
    res.status(500).json({ message: 'Erro ao atualizar produto' });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, writeLimiter,
  auditAction('product.delete', 'product'),
  async (req, res) => {
  try {
    const removido = await products.remove(req.params.id);
    if (!removido) return res.status(404).json({ message: 'Produto não encontrado.' });
    res.json({ ok: true, removed: removido });
  } catch (err) {
    console.error('[admin/products] delete error:', err);
    res.status(500).json({ message: 'Erro ao remover produto' });
  }
});

/* -----------------------------------------------------------------------
   Rotas HTML para os painéis. Como o vercel.json roteia tudo pra esta
   função, precisamos servir o HTML diretamente aqui em prod e em dev.
----------------------------------------------------------------------- */
const ADMIN_DIR = path.join(PUBLIC_DIR, 'pages', 'admin');
const PAGES_DIR = path.join(PUBLIC_DIR, 'pages');

app.get(['/login'], (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, 'login.html'));
});

app.get(['/register', '/cadastro'], (_req, res) => {
  res.sendFile(path.join(PAGES_DIR, 'register.html'));
});

app.get(['/admin', '/dashboard'], (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'admin.html'));
});

app.get(['/admin/produtos', '/editor-produtos'], (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'products-admin.html'));
});

app.get(['/admin/pedidos'], (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'pedidos-admin.html'));
});

app.get(['/admin/loja', '/admin/loja/:tab'], (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'loja-admin.html'));
});

app.get(['/admin/auditoria'], (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'auditoria-admin.html'));
});

app.get(['/admin/equipe'], (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'equipe-admin.html'));
});

// SPA fallback — qualquer rota não-API entrega o catálogo.
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Listener apenas quando rodado diretamente (npm start / npm run dev).
// Em serverless, o handler exporta o `app`.
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(
      `\n  🤠  Catálogo Villa Vip rodando em  http://localhost:${PORT}\n` +
        `      (desenvolvido pela Sync Services)\n`
    );
  });
}

module.exports = app;
