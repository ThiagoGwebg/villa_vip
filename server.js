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

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

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

/** Normaliza texto para busca (sem acento, minúsculo). */
function normalize(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

app.use(express.json());

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

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// SPA fallback — qualquer rota não-API entrega o catálogo
app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(
    `\n  🤠  Catálogo Villa Vip rodando em  http://localhost:${PORT}\n` +
      `      (desenvolvido pela Sync Services)\n`
  );
});
