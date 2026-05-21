
/**
 * Catálogo Web Dinâmico — Villa Vip Country Store
 * Backend full-stack em Node.js (Express). Sync Services.
 *
 * - Serve a vitrine estática (public/)
 * - API REST de catálogo com filtro por categoria, marca e busca textual
 * - Endpoint de metadados da loja (WhatsApp, marcas, categorias)
 *
 * O "gancho de conversão" (link dinâmico do WhatsApp) é montado no front,
 * mas o número e o template ficam centralizados aqui via /api/store.
 */

require('dotenv').config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const authRoutes = require("./routes/auth");
const orderRoutes = require("./routes/orders");
const userDataRoutes = require("./routes/userData");
const authMiddleware = require("./middlewares/authMiddleware");
const adminMiddleware = require("./middlewares/adminMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");

/** Lê um JSON do diretório /data com cache simples em memória. */
const cache = {};
function loadJSON(file) {
  if (cache[file]) return cache[file];
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
  const parsed = JSON.parse(raw);
  cache[file] = parsed;
  return parsed;
}

/** Grava products.json e invalida o cache. */
function saveProducts(data) {
  fs.writeFileSync(path.join(DATA_DIR, "products.json"), JSON.stringify(data, null, 2), "utf-8");
  delete cache["products.json"];
}

/** Upload de imagens de produto — salvo em public/assets/products/. */
const imgUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(PUBLIC_DIR, "assets", "products"),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, Date.now() + "-" + Math.random().toString(36).slice(2, 7) + ext);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

/** Normaliza texto para busca (sem acento, minúsculo). */
function normalize(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/user-data', userDataRoutes);

// Compressão leve via headers + cache de assets estáticos (catálogo "leve e rápido")
app.use(
  express.static(PUBLIC_DIR, {
    // Sem cache durante a fase de demo/iteração (evita CSS/JS preso no navegador).
    // Em produção, trocar para maxAge: "1h".
    maxAge: 0,
    etag: true,
    setHeaders(res) {
      res.setHeader("X-Powered-By", "Sync Services");
      res.setHeader("Cache-Control", "no-cache");
    },
  })
);

/** Metadados da loja: consumidos pelo front para montar o link do WhatsApp. */
app.get("/api/store", (_req, res) => {
  res.json(loadJSON("store.json"));
});

/**
 * Catálogo com filtros opcionais:
 *   ?categoria=botas
 *   ?marca=Eldorado,TX Farm
 *   ?q=texana
 *   ?ordenar=preco-asc|preco-desc|destaque
 */
app.get("/api/products", (req, res) => {
  let produtos = loadJSON("products.json");
  const { categoria, marca, q, ordenar } = req.query;

  if (categoria && categoria !== "todos") {
    produtos = produtos.filter((p) => p.categoria === categoria);
  }

  if (marca) {
    const marcas = String(marca)
      .split(",")
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
    case "preco-asc":
      produtos = [...produtos].sort((a, b) => a.preco - b.preco);
      break;
    case "preco-desc":
      produtos = [...produtos].sort((a, b) => b.preco - a.preco);
      break;
    case "destaque":
      produtos = [...produtos].sort(
        (a, b) => Number(b.destaque) - Number(a.destaque)
      );
      break;
  }

  res.json({ total: produtos.length, produtos });
});

/** Produto único por ID (página de detalhe / deep-link). */
app.get("/api/products/:id", (req, res) => {
  const produto = loadJSON("products.json").find(
    (p) => p.id.toLowerCase() === String(req.params.id).toLowerCase()
  );
  if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });
  res.json(produto);
});

/**
 * Business Intelligence do catálogo.
 *
 * 100% derivado de products.json + store.json — nada simulado. Toda a
 * matemática vive aqui (fonte única de verdade) e o front só renderiza.
 */
function buildAnalytics() {
  const produtos = loadJSON("products.json");
  const store = loadJSON("store.json");

  // id -> nome amigável da categoria ("todos" é filtro de UI, não categoria real).
  const catNome = {};
  for (const c of store.categorias || []) {
    if (c.id !== "todos") catNome[c.id] = c.nome;
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

  // Agrupamento genérico por chave.
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

  // Histograma de preços (faixas fixas em BRL).
  const faixasDef = [
    [0, 100, "Até R$ 100"],
    [100, 200, "R$ 100–200"],
    [200, 300, "R$ 200–300"],
    [300, 400, "R$ 300–400"],
    [400, 600, "R$ 400–600"],
    [600, Infinity, "R$ 600+"],
  ];
  const faixasPreco = faixasDef.map(([min, max, label]) => ({
    label,
    qtd: produtos.filter((p) => p.preco >= min && p.preco < max).length,
  }));

  // Distribuição por tag de merchandising.
  const tagMap = new Map();
  for (const p of produtos) {
    const t = p.tag || "Sem etiqueta";
    tagMap.set(t, (tagMap.get(t) || 0) + 1);
  }
  const tags = [...tagMap.entries()]
    .map(([tag, qtd]) => ({ tag, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  // Matriz marca × categoria (contagem) para heatmap.
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

  return {
    loja: store.nome,
    geradoEm: new Date().toISOString(),
    resumo: {
      totalProdutos: produtos.length,
      totalCategorias: porCategoria.length,
      totalMarcas: porMarca.length,
      precoMedio: round(precos.reduce((s, n) => s + n, 0) / precos.length),
      precoMin: Math.min(...precos),
      precoMax: Math.max(...precos),
      valorCatalogo: round(precos.reduce((s, n) => s + n, 0)),
      emPromocao: promo.length,
      pctPromocao: round((promo.length / produtos.length) * 100),
      descontoMedioPct: round(descontoMedio),
      economiaTotal: round(economiaTotal),
      emDestaque: produtos.filter((p) => p.destaque).length,
      pctDestaque: round(
        (produtos.filter((p) => p.destaque).length / produtos.length) * 100
      ),
      variacoesTamanho: totalTamanhos,
      mediaTamanhos: round(totalTamanhos / produtos.length),
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

// Protegido: sessão Supabase válida (authMiddleware) + e-mail na allowlist
// de administradores (adminMiddleware). Bearer token no header Authorization.
app.get("/api/analytics", authMiddleware, adminMiddleware, (_req, res) => {
  res.json(buildAnalytics());
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* -----------------------------------------------------------------------
   Upload de imagem de produto — salva arquivo e devolve a URL pública.
----------------------------------------------------------------------- */
app.post("/api/admin/upload", authMiddleware, adminMiddleware, imgUpload.single("imagem"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Arquivo inválido ou maior que 8 MB." });
  res.json({ url: "/assets/products/" + req.file.filename });
});

/* -----------------------------------------------------------------------
   CRUD de produtos — protegido por sessão válida + perfil admin.
   Todas as rotas exigem Bearer token e coluna admin=true no Supabase.
----------------------------------------------------------------------- */

app.get("/api/admin/products", authMiddleware, adminMiddleware, (_req, res) => {
  res.json(loadJSON("products.json"));
});

app.post("/api/admin/products", authMiddleware, adminMiddleware, (req, res) => {
  const produtos = loadJSON("products.json");
  const p = req.body;
  if (!p.id || !p.nome || !p.categoria || !p.marca || p.preco == null) {
    return res.status(400).json({ message: "Campos obrigatórios: id, nome, categoria, marca, preco" });
  }
  if (produtos.find((x) => x.id === String(p.id).trim())) {
    return res.status(409).json({ message: "Já existe um produto com esse ID." });
  }
  const novo = {
    id: String(p.id).trim(),
    nome: String(p.nome).trim(),
    categoria: String(p.categoria).trim(),
    marca: String(p.marca).trim(),
    preco: Number(p.preco),
    precoDe: p.precoDe ? Number(p.precoDe) : null,
    descricao: String(p.descricao || "").trim(),
    tamanhos: Array.isArray(p.tamanhos) ? p.tamanhos.map(String) : [],
    tag: p.tag || null,
    destaque: Boolean(p.destaque),
    imagem: p.imagem ? String(p.imagem).trim() : null,
  };
  produtos.push(novo);
  saveProducts(produtos);
  res.status(201).json(novo);
});

app.put("/api/admin/products/:id", authMiddleware, adminMiddleware, (req, res) => {
  const produtos = loadJSON("products.json");
  const idx = produtos.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Produto não encontrado." });
  const p = req.body;
  if (!p.nome || !p.categoria || !p.marca || p.preco == null) {
    return res.status(400).json({ message: "Campos obrigatórios: nome, categoria, marca, preco" });
  }
  produtos[idx] = {
    id: produtos[idx].id,
    nome: String(p.nome).trim(),
    categoria: String(p.categoria).trim(),
    marca: String(p.marca).trim(),
    preco: Number(p.preco),
    precoDe: p.precoDe ? Number(p.precoDe) : null,
    descricao: String(p.descricao || "").trim(),
    tamanhos: Array.isArray(p.tamanhos) ? p.tamanhos.map(String) : [],
    tag: p.tag || null,
    destaque: Boolean(p.destaque),
    imagem: p.imagem ? String(p.imagem).trim() : null,
  };
  saveProducts(produtos);
  res.json(produtos[idx]);
});

app.delete("/api/admin/products/:id", authMiddleware, adminMiddleware, (req, res) => {
  const produtos = loadJSON("products.json");
  const idx = produtos.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Produto não encontrado." });
  const [removed] = produtos.splice(idx, 1);
  saveProducts(produtos);
  res.json({ ok: true, removed });
});

// Painel administrativo (BI) — protegido por login no front (padrão do projeto).
app.get(["/admin", "/dashboard"], (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

// Editor de produtos — mesma proteção client-side do painel BI.
app.get(["/admin/produtos", "/editor-produtos"], (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "products-admin.html"));
});

// SPA fallback — qualquer rota não-API entrega o catálogo
app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(
    `\n  🤠  Catálogo Villa Vip rodando em  http://localhost:${PORT}\n` +
    `      (desenvolvido pela Sync Services)\n`
  );
});
