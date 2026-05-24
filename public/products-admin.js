/* ============================================================================
   Villa Vip Country Store — Editor de Produtos (admin)
   CRUD completo contra /api/admin/products. Zero dependências. Sync Services.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
// Helpers vêm de shared.js (VV.*). Aliases mantêm o restante curto.
const brl = VV.brl;
const authFetch = VV.authFetch;

// Prefixo de ID por categoria (sugestão automática)
const CAT_PREFIX = {
  botas: "BT",
  chapeus: "CH",
  camisas: "CM",
  "jeans-fem": "JF",
  masculino: "LM",
  acessorios: "AC",
};

// Estado
let storeData = null;
let editingId = null;      // null = novo, string = editando
let currentTamanhos = [];  // tamanhos do formulário aberto
let currentImages = [];    // URLs das fotos atuais no formulário (índice 0 = capa)
const MAX_IMAGES = 5;

// Paginação server-side
const page = {
  items: [],
  total: 0,
  limit: 20,
  offset: 0,
  q: '',
  cat: '',
};
let searchTimer;

/* ---------- Inicialização ---------------------------------------------- */
async function init() {
  setState("loading");
  try {
    const storeRes = await fetch("/api/store");
    if (!storeRes.ok) throw new Error("HTTP " + storeRes.status);
    storeData = await storeRes.json();
    populateCatFilter();
    await loadPage();
  } catch (err) {
    if (err?.message === "Sessão expirada") return;
    $("errorMsg").textContent = "Não foi possível carregar (" + err.message + ").";
    setState("error");
  }
}

async function loadPage() {
  const params = new URLSearchParams({ limit: page.limit, offset: page.offset });
  if (page.q)   params.set("q", page.q);
  if (page.cat) params.set("categoria", page.cat);

  try {
    let denied = false;
    const res = await authFetch(`/api/admin/products?${params}`, {
      onForbidden: () => (denied = true),
    });
    if (denied) return setState("deny");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    page.items = data.items;
    page.total = data.total;
    renderTable();
    setState("ready");
  } catch (err) {
    if (err?.message === "Sessão expirada") return;
    $("errorMsg").textContent = "Não foi possível carregar (" + err.message + ").";
    setState("error");
  }
}

function setState(s) {
  $("loadingState").hidden = s !== "loading";
  $("errorState").hidden   = s !== "error";
  $("denyState").hidden    = s !== "deny";
  $("pageContent").hidden  = s !== "ready";
  $("dashMain").setAttribute("aria-busy", s === "loading" ? "true" : "false");
  if (s === "ready") updateStamp();
}

function updateStamp() {
  $("stamp").textContent = `${page.total} produto(s) no catálogo`;
}

/* ---------- Filtros ----------------------------------------------------- */
function populateCatFilter() {
  const cats = (storeData.categorias || []).filter((c) => c.id !== "todos");
  $("catFilter").innerHTML =
    `<option value="">Todas as categorias</option>` +
    cats.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("");
}

function catNome(id) {
  const c = (storeData?.categorias || []).find((x) => x.id === id);
  return c ? c.nome : id;
}

/* ---------- Tabela ------------------------------------------------------ */
function renderTable() {
  const rows = page.items;
  const current = Math.floor(page.offset / page.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
  $("productCount").textContent =
    `${page.total} produto(s) · página ${current} de ${totalPages}`;
  $("emptyMsg").hidden = rows.length > 0;

  $("productsBody").innerHTML = rows
    .map(
      (p) => `
      <tr>
        <td><code class="pe-ref">${p.id}</code></td>
        <td><span class="t-name">${p.nome}</span></td>
        <td><span class="pe-badge">${catNome(p.categoria)}</span></td>
        <td>${p.marca}</td>
        <td class="num">${brl(p.preco)}</td>
        <td class="num">${p.precoDe ? `<span class="t-was">${brl(p.precoDe)}</span>` : "—"}</td>
        <td>${p.tag ? `<span class="pill pe-pill-tag">${p.tag}</span>` : "—"}</td>
        <td class="tc">${p.destaque ? `<span class="pe-check" title="Em destaque">✓</span>` : "—"}</td>
        <td class="pe-actions">
          <button class="pe-act edit" data-id="${p.id}">Editar</button>
          <button class="pe-act del"  data-id="${p.id}" data-nome="${p.nome}">Excluir</button>
        </td>
      </tr>`
    )
    .join("");

  $("productsBody").querySelectorAll(".pe-act.edit").forEach((b) =>
    b.addEventListener("click", () => openEdit(b.dataset.id))
  );
  $("productsBody").querySelectorAll(".pe-act.del").forEach((b) =>
    b.addEventListener("click", () => openDelete(b.dataset.id, b.dataset.nome))
  );

  renderPager();
}

function renderPager() {
  if (!$("pager")) return;
  const current = Math.floor(page.offset / page.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
  $("pager").hidden = page.total <= page.limit;
  $("pgInfo").textContent = `Página ${current} de ${totalPages}`;
  $("pgPrev").disabled = current <= 1;
  $("pgNext").disabled = current >= totalPages;
}

/* ---------- Tag input de tamanhos -------------------------------------- */
function renderTagChips() {
  $("tagsContainer").querySelectorAll(".pe-tag-chip").forEach((e) => e.remove());
  currentTamanhos.forEach((t, i) => {
    const chip = document.createElement("span");
    chip.className = "pe-tag-chip";
    chip.innerHTML = `${t} <button type="button" aria-label="Remover ${t}" data-i="${i}">×</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      currentTamanhos.splice(i, 1);
      renderTagChips();
    });
    $("tagsContainer").insertBefore(chip, $("tagsInput"));
  });
}

function addTamanho(raw) {
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((t) => {
      if (!currentTamanhos.includes(t)) currentTamanhos.push(t);
    });
  renderTagChips();
}

/* ---------- Formulário -------------------------------------------------- */
function populateFormSelects() {
  const cats = (storeData.categorias || []).filter((c) => c.id !== "todos");
  $("fCategoria").innerHTML =
    `<option value="">Selecionar…</option>` +
    cats.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("");
  $("fMarca").innerHTML =
    `<option value="">Selecionar…</option>` +
    (storeData.marcas || []).map((m) => `<option value="${m}">${m}</option>`).join("");
}

/* ---------- Galeria de fotos -------------------------------------------- */
function setImages(urls) {
  currentImages = (Array.isArray(urls) ? urls : []).filter(Boolean).slice(0, MAX_IMAGES);
  renderGallery();
  $("imgStatus").hidden = true;
}

function renderGallery() {
  const grid = $("galleryGrid");
  const drop = $("imgDrop");
  if (!grid) return;
  const slots = currentImages.map((url, i) => `
    <div class="pe-thumb${i === 0 ? " is-cover" : ""}" data-i="${i}">
      <img src="${url}" alt="Foto ${i + 1}" loading="lazy">
      ${i === 0 ? '<span class="pe-thumb-badge">Capa</span>' : ""}
      <div class="pe-thumb-actions">
        ${i > 0 ? `<button type="button" class="pe-thumb-btn" data-cover="${i}" title="Definir como capa">★</button>` : ""}
        ${i > 0 ? `<button type="button" class="pe-thumb-btn" data-move="${i}:-1" title="Mover para a esquerda">←</button>` : ""}
        ${i < currentImages.length - 1 ? `<button type="button" class="pe-thumb-btn" data-move="${i}:1" title="Mover para a direita">→</button>` : ""}
        <button type="button" class="pe-thumb-btn danger" data-remove="${i}" title="Remover">×</button>
      </div>
    </div>`).join("");
  grid.innerHTML = slots;
  grid.hidden = currentImages.length === 0;
  if (drop) {
    drop.classList.toggle("pe-img-drop--compact", currentImages.length > 0);
    drop.querySelector("span").textContent = currentImages.length === 0
      ? "Arraste fotos ou clique para escolher"
      : `Adicionar mais (${MAX_IMAGES - currentImages.length} restante${MAX_IMAGES - currentImages.length === 1 ? "" : "s"})`;
  }

  grid.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => removeImage(+b.dataset.remove))
  );
  grid.querySelectorAll("[data-cover]").forEach((b) =>
    b.addEventListener("click", () => setCover(+b.dataset.cover))
  );
  grid.querySelectorAll("[data-move]").forEach((b) =>
    b.addEventListener("click", () => {
      const [iStr, dirStr] = b.dataset.move.split(":");
      moveImage(+iStr, +dirStr);
    })
  );
}

function addImage(url) {
  if (!url) return;
  if (currentImages.length >= MAX_IMAGES) {
    imgStatusMsg(`Limite de ${MAX_IMAGES} fotos atingido.`, "error");
    return;
  }
  if (currentImages.includes(url)) {
    imgStatusMsg("Essa foto já está na galeria.", "info");
    return;
  }
  currentImages.push(url);
  renderGallery();
}

function removeImage(i) {
  if (i < 0 || i >= currentImages.length) return;
  currentImages.splice(i, 1);
  renderGallery();
}

function setCover(i) {
  if (i <= 0 || i >= currentImages.length) return;
  const [picked] = currentImages.splice(i, 1);
  currentImages.unshift(picked);
  renderGallery();
}

function moveImage(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= currentImages.length) return;
  [currentImages[i], currentImages[j]] = [currentImages[j], currentImages[i]];
  renderGallery();
}

function imgStatusMsg(text, kind) {
  const el = $("imgStatus");
  el.className = "pe-img-status " + (kind || "info");
  el.textContent = text;
  el.hidden = false;
}

/**
 * Downscale client-side: reduz fotos de celular (3–5 MB) para ~300–600 KB
 * antes de enviar. Resolve o risco de estourar o timeout de 10s da Vercel
 * em conexões móveis e libera espaço no Supabase Storage.
 */
async function downscaleImage(file, { maxSide = 1600, quality = 0.85 } = {}) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  // Arquivos já pequenos não precisam ser reprocessados.
  if (file.size <= 600 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) { bitmap.close?.(); return file; }

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;       // sem ganho
    const baseName = file.name.replace(/\.[^.]+$/, "") || "imagem";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch (err) {
    console.warn("[downscale] falhou, enviando original:", err);
    return file;
  }
}

/** Sobe uma foto pro Storage e devolve a URL. Erros viram null + status visual. */
async function uploadOne(file) {
  const optimized = await downscaleImage(file);
  const form = new FormData();
  form.append("imagem", optimized);
  try {
    const res = await authFetch("/api/admin/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      imgStatusMsg(data.message || "Erro no upload.", "error");
      return null;
    }
    return data.url;
  } catch {
    imgStatusMsg("Falha na conexão. Tente novamente.", "error");
    return null;
  }
}

/** Sobe vários arquivos respeitando o limite, em sequência (rate-limit-safe). */
async function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const slots = MAX_IMAGES - currentImages.length;
  if (slots <= 0) {
    imgStatusMsg(`Limite de ${MAX_IMAGES} fotos atingido. Remova alguma antes.`, "error");
    return;
  }
  const toUpload = files.slice(0, slots);
  const ignored = files.length - toUpload.length;

  let done = 0;
  for (const f of toUpload) {
    done++;
    imgStatusMsg(`Enviando ${done}/${toUpload.length}…`, "info");
    const url = await uploadOne(f);
    if (url) {
      currentImages.push(url);
      renderGallery();
    }
  }
  imgStatusMsg(
    ignored > 0
      ? `Pronto. ${toUpload.length} foto(s) enviada(s). ${ignored} ignorada(s) pelo limite de ${MAX_IMAGES}.`
      : `Pronto. ${toUpload.length} foto(s) enviada(s).`,
    "ok"
  );
  $("fImagem").value = "";
}

// Upload de arquivo(s) ao servidor
$("fImagem").addEventListener("change", () => {
  uploadFiles($("fImagem").files);
});

// URL colada manualmente: adiciona à galeria ao confirmar (Enter / botão)
function handleAddUrl() {
  const input = $("fImagemUrl");
  const url = input.value.trim();
  if (!url) return;
  addImage(url);
  input.value = "";
}
$("fImagemUrl").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); handleAddUrl(); }
});
$("fImagemUrlAdd").addEventListener("click", handleAddUrl);

// Drag & drop (aceita múltiplos arquivos)
$("imgDrop").addEventListener("dragover", (e) => { e.preventDefault(); $("imgDrop").classList.add("drag-over"); });
$("imgDrop").addEventListener("dragleave", () => $("imgDrop").classList.remove("drag-over"));
$("imgDrop").addEventListener("drop", (e) => {
  e.preventDefault();
  $("imgDrop").classList.remove("drag-over");
  const files = e.dataTransfer?.files;
  if (files && files.length) uploadFiles(files);
});

function resetForm() {
  $("fId").value = "";
  $("fNome").value = "";
  $("fCategoria").value = "";
  $("fMarca").value = "";
  $("fPreco").value = "";
  $("fPrecoDe").value = "";
  $("fDescricao").value = "";
  $("fTag").value = "";
  $("fDestaque").checked = false;
  $("formMsg").hidden = true;
  currentTamanhos = [];
  currentImages = [];
  setImages([]);
  renderTagChips();
}

function openCreate() {
  editingId = null;
  resetForm();
  $("fId").readOnly = false;
  $("formTitle").textContent = "Novo Produto";
  $("formSubmit").textContent = "Criar produto";
  populateFormSelects();
  openOverlay("formOverlay");
  $("fNome").focus();
}

function openEdit(id) {
  const p = page.items.find((x) => x.id === id);
  if (!p) return;
  editingId = id;
  currentTamanhos = [...(p.tamanhos || [])];

  $("fId").value = p.id;
  $("fId").readOnly = true;
  $("fNome").value = p.nome;
  $("fPreco").value = p.preco;
  $("fPrecoDe").value = p.precoDe || "";
  $("fDescricao").value = p.descricao || "";
  $("fTag").value = p.tag || "";
  $("fDestaque").checked = Boolean(p.destaque);
  $("formMsg").hidden = true;

  populateFormSelects();
  $("fCategoria").value = p.categoria;
  $("fMarca").value = p.marca;

  // Compat: produtos antigos só tinham `imagem`; novos têm `imagens[]`.
  const galeria = Array.isArray(p.imagens) && p.imagens.length
    ? p.imagens
    : (p.imagem ? [p.imagem] : []);
  setImages(galeria);
  renderTagChips();
  $("formTitle").textContent = "Editar Produto";
  $("formSubmit").textContent = "Salvar alterações";
  openOverlay("formOverlay");
  $("fNome").focus();
}

async function openDelete(id, nome) {
  const ok = await VV.confirm({
    title: "Excluir produto",
    body: `Tem certeza que deseja excluir “${nome}” (${id})? Esta ação não pode ser desfeita.`,
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await authFetch(`/api/admin/products/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      VV.toast(data.message || "Erro ao excluir.", { kind: "error" });
      return;
    }
    VV.toast(`“${nome}” excluído.`, { kind: "success" });
    await reloadProducts();
  } catch {
    VV.toast("Falha na conexão.", { kind: "error" });
  }
}

/* ---------- Overlay helpers -------------------------------------------- */
function openOverlay(id) {
  $(id).hidden = false;
  document.body.style.overflow = "hidden";
}

function closeOverlay(id) {
  $(id).hidden = true;
  document.body.style.overflow = "";
}

/* ---------- Mensagem de erro no form ----------------------------------- */
function showFormMsg(text, kind) {
  const el = $("formMsg");
  el.className = "pe-form-msg " + (kind || "error");
  el.textContent = text;
  el.hidden = false;
}

/* ---------- Auto-sugestão de ID ao trocar categoria --------------------
   Usa apenas a página visível como amostra; em prod, devs podem rodar
   ?all=1 ou conferir manualmente. É só uma sugestão — o backend valida
   colisão antes de criar (server.js: products.exists).
   --------------------------------------------------------------------- */
$("fCategoria").addEventListener("change", () => {
  if (editingId) return;
  const prefix = CAT_PREFIX[$("fCategoria").value];
  if (!prefix) return;
  const existing = page.items
    .filter((p) => p.id.startsWith(prefix + "-"))
    .map((p) => parseInt(p.id.split("-")[1]))
    .filter((n) => !isNaN(n));
  const next = existing.length ? Math.max(...existing) + 1 : 101;
  $("fId").value = `${prefix}-${next}`;
});

/* ---------- Tag input events ------------------------------------------- */
$("tagsInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    const val = $("tagsInput").value.trim();
    if (val) { addTamanho(val); $("tagsInput").value = ""; }
  } else if (e.key === "Backspace" && !$("tagsInput").value && currentTamanhos.length) {
    currentTamanhos.pop();
    renderTagChips();
  }
});
$("tagsInput").addEventListener("blur", () => {
  const val = $("tagsInput").value.trim();
  if (val) { addTamanho(val); $("tagsInput").value = ""; }
});
$("tagsContainer").addEventListener("click", () => $("tagsInput").focus());

/* ---------- Submit do formulário --------------------------------------- */
$("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("formMsg").hidden = true;

  const id       = $("fId").value.trim();
  const nome     = $("fNome").value.trim();
  const categoria = $("fCategoria").value;
  const marca    = $("fMarca").value;
  const preco    = parseFloat($("fPreco").value);
  const precoDe  = $("fPrecoDe").value ? parseFloat($("fPrecoDe").value) : null;

  if (!id || !nome || !categoria || !marca || isNaN(preco) || preco <= 0) {
    showFormMsg("Preencha os campos obrigatórios: referência, nome, categoria, marca e preço.", "error");
    return;
  }
  if (precoDe && precoDe <= preco) {
    showFormMsg("O preço \"de\" precisa ser maior que o preço atual.", "error");
    return;
  }

  const body = {
    id,
    nome,
    categoria,
    marca,
    preco,
    precoDe,
    descricao: $("fDescricao").value.trim(),
    tamanhos: currentTamanhos,
    tag: $("fTag").value || null,
    destaque: $("fDestaque").checked,
    imagens: currentImages.slice(),
    imagem: currentImages[0] || null,
  };

  const btn = $("formSubmit");
  const wasEditing = !!editingId;
  VV.setBusy(btn, true, "Salvando…");

  try {
    const url    = editingId ? `/api/admin/products/${editingId}` : "/api/admin/products";
    const method = editingId ? "PUT" : "POST";
    const res    = await authFetch(url, { method, body: JSON.stringify(body) });
    const data   = await res.json();
    if (!res.ok) { showFormMsg(data.message || "Erro ao salvar.", "error"); return; }
    closeOverlay("formOverlay");
    VV.toast(wasEditing ? "Produto atualizado." : "Produto criado.", { kind: "success" });
    await reloadProducts();
  } catch {
    showFormMsg("Falha na conexão. Tente novamente.", "error");
  } finally {
    VV.setBusy(btn, false);
  }
});

/* ---------- Recarregar lista ------------------------------------------- */
async function reloadProducts() {
  await loadPage();
}

/* ---------- Eventos globais -------------------------------------------- */
$("btnNewProduct").addEventListener("click", openCreate);
$("btnLogout").addEventListener("click", () => VV.logout());
$("btnDenyLogout").addEventListener("click", () => VV.logout());
$("btnRetry").addEventListener("click", init);

$("formClose").addEventListener("click", () => closeOverlay("formOverlay"));
$("formCancel").addEventListener("click", () => closeOverlay("formOverlay"));
$("formOverlay").addEventListener("click", (e) => {
  if (e.target.id === "formOverlay") closeOverlay("formOverlay");
});

if ($("btnExport")) {
  $("btnExport").addEventListener("click", () =>
    VV.downloadFile("/api/admin/reports/produtos.csv")
  );
}

$("searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.q = e.target.value.trim();
    page.offset = 0;
    loadPage();
  }, 300);
});
$("catFilter").addEventListener("change", (e) => {
  page.cat = e.target.value;
  page.offset = 0;
  loadPage();
});

if ($("pgPrev")) {
  $("pgPrev").addEventListener("click", () => {
    if (page.offset === 0) return;
    page.offset = Math.max(0, page.offset - page.limit);
    loadPage();
  });
}
if ($("pgNext")) {
  $("pgNext").addEventListener("click", () => {
    if (page.offset + page.limit >= page.total) return;
    page.offset += page.limit;
    loadPage();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOverlay("formOverlay");
});

/* ---------- Boot -------------------------------------------------------- */
if (VV.guard({ requireAdmin: true })) init();
