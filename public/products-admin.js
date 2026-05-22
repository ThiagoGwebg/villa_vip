/* ============================================================================
   Villa Vip Country Store — Editor de Produtos (admin)
   CRUD completo contra /api/admin/products. Zero dependências. Sync Services.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const getToken = () => localStorage.getItem("token");

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
let allProducts = [];
let storeData = null;
let editingId = null;      // null = novo, string = editando
let deleteTarget = null;   // { id, nome }
let currentTamanhos = [];  // tamanhos do formulário aberto
let currentImage = null;   // URL da imagem atual no formulário

/* ---------- Guarda de acesso ------------------------------------------- */
function safeUser() {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
}

function ensureAdmin() {
  if (!getToken()) { window.location.replace("/login.html"); return false; }
  const u = safeUser();
  if (!u || u.isAdmin !== true) { window.location.replace("/"); return false; }
  return true;
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.replace("/login.html");
}

/* ---------- Fetch autenticado ------------------------------------------ */
async function authFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken(),
      ...(opts.headers || {}),
    },
  });
}

/* ---------- Inicialização ---------------------------------------------- */
async function init() {
  setState("loading");
  try {
    const [storeRes, productsRes] = await Promise.all([
      fetch("/api/store"),
      authFetch("/api/admin/products"),
    ]);
    if (productsRes.status === 401) return logout();
    if (productsRes.status === 403) return setState("deny");
    if (!storeRes.ok || !productsRes.ok) throw new Error("HTTP " + productsRes.status);

    storeData = await storeRes.json();
    allProducts = await productsRes.json();

    populateCatFilter();
    renderTable();
    setState("ready");
  } catch (err) {
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
  $("stamp").textContent = `${allProducts.length} produto(s) no catálogo`;
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

function filteredProducts() {
  const q = $("searchInput").value.trim().toLowerCase();
  const cat = $("catFilter").value;
  return allProducts.filter((p) => {
    const matchQ =
      !q ||
      [p.nome, p.marca, p.id, p.descricao].some((s) =>
        (s || "").toLowerCase().includes(q)
      );
    const matchCat = !cat || p.categoria === cat;
    return matchQ && matchCat;
  });
}

/* ---------- Tabela ------------------------------------------------------ */
function renderTable() {
  const rows = filteredProducts();
  $("productCount").textContent = `${rows.length} de ${allProducts.length} produto(s)`;
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

/* ---------- Imagem ------------------------------------------------------ */
function setImage(url) {
  currentImage = url || null;
  const hasImg = !!currentImage;
  $("imgPreviewWrap").hidden = !hasImg;
  $("imgDrop").hidden = hasImg;
  if (hasImg) {
    $("imgPreview").src = currentImage;
    $("fImagemUrl").value = currentImage;
  } else {
    $("fImagemUrl").value = "";
    $("fImagem").value = "";
  }
  $("imgStatus").hidden = true;
}

function imgStatusMsg(text, kind) {
  const el = $("imgStatus");
  el.className = "pe-img-status " + (kind || "info");
  el.textContent = text;
  el.hidden = false;
}

// Upload de arquivo ao servidor
$("fImagem").addEventListener("change", async () => {
  const file = $("fImagem").files[0];
  if (!file) return;
  imgStatusMsg("Enviando imagem…", "info");
  const form = new FormData();
  form.append("imagem", file);
  try {
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + getToken() },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) { imgStatusMsg(data.message || "Erro no upload.", "error"); return; }
    setImage(data.url);
    imgStatusMsg("Imagem carregada com sucesso.", "ok");
  } catch {
    imgStatusMsg("Falha na conexão. Tente novamente.", "error");
  }
});

// URL colada manualmente
$("fImagemUrl").addEventListener("change", () => {
  const url = $("fImagemUrl").value.trim();
  if (url) setImage(url);
});

$("imgRemove").addEventListener("click", () => setImage(null));

// Drag & drop
$("imgDrop").addEventListener("dragover", (e) => { e.preventDefault(); $("imgDrop").classList.add("drag-over"); });
$("imgDrop").addEventListener("dragleave", () => $("imgDrop").classList.remove("drag-over"));
$("imgDrop").addEventListener("drop", (e) => {
  e.preventDefault();
  $("imgDrop").classList.remove("drag-over");
  const file = e.dataTransfer?.files[0];
  if (file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    $("fImagem").files = dt.files;
    $("fImagem").dispatchEvent(new Event("change"));
  }
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
  currentImage = null;
  setImage(null);
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
  const p = allProducts.find((x) => x.id === id);
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

  setImage(p.imagem || null);
  renderTagChips();
  $("formTitle").textContent = "Editar Produto";
  $("formSubmit").textContent = "Salvar alterações";
  openOverlay("formOverlay");
  $("fNome").focus();
}

function openDelete(id, nome) {
  deleteTarget = { id, nome };
  $("deleteName").textContent = nome;
  openOverlay("deleteOverlay");
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

/* ---------- Auto-sugestão de ID ao trocar categoria -------------------- */
$("fCategoria").addEventListener("change", () => {
  if (editingId) return;
  const prefix = CAT_PREFIX[$("fCategoria").value];
  if (!prefix) return;
  const existing = allProducts
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
    imagem: currentImage || null,
  };

  const btn = $("formSubmit");
  btn.disabled = true;
  btn.textContent = "Salvando…";

  try {
    const url    = editingId ? `/api/admin/products/${editingId}` : "/api/admin/products";
    const method = editingId ? "PUT" : "POST";
    const res    = await authFetch(url, { method, body: JSON.stringify(body) });
    const data   = await res.json();
    if (!res.ok) { showFormMsg(data.message || "Erro ao salvar.", "error"); return; }
    closeOverlay("formOverlay");
    await reloadProducts();
  } catch {
    showFormMsg("Falha na conexão. Tente novamente.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? "Salvar alterações" : "Criar produto";
  }
});

/* ---------- Confirmar exclusão ----------------------------------------- */
$("deleteConfirmBtn").addEventListener("click", async () => {
  if (!deleteTarget) return;
  const btn = $("deleteConfirmBtn");
  btn.disabled = true;
  btn.textContent = "Excluindo…";
  try {
    const res = await authFetch(`/api/admin/products/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) { alert("Erro ao excluir. Tente novamente."); return; }
    closeOverlay("deleteOverlay");
    deleteTarget = null;
    await reloadProducts();
  } catch {
    alert("Falha na conexão.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Excluir";
  }
});

/* ---------- Recarregar lista ------------------------------------------- */
async function reloadProducts() {
  const res = await authFetch("/api/admin/products");
  if (res.ok) {
    allProducts = await res.json();
    renderTable();
    updateStamp();
  }
}

/* ---------- Eventos globais -------------------------------------------- */
$("btnNewProduct").addEventListener("click", openCreate);
$("btnLogout").addEventListener("click", logout);
$("btnDenyLogout").addEventListener("click", logout);
$("btnRetry").addEventListener("click", init);

$("formClose").addEventListener("click", () => closeOverlay("formOverlay"));
$("formCancel").addEventListener("click", () => closeOverlay("formOverlay"));
$("formOverlay").addEventListener("click", (e) => {
  if (e.target.id === "formOverlay") closeOverlay("formOverlay");
});

$("deleteClose").addEventListener("click", () => closeOverlay("deleteOverlay"));
$("deleteCancelBtn").addEventListener("click", () => closeOverlay("deleteOverlay"));
$("deleteOverlay").addEventListener("click", (e) => {
  if (e.target.id === "deleteOverlay") closeOverlay("deleteOverlay");
});

$("searchInput").addEventListener("input", renderTable);
$("catFilter").addEventListener("change", renderTable);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeOverlay("formOverlay");
    closeOverlay("deleteOverlay");
  }
});

/* ---------- Boot -------------------------------------------------------- */
if (ensureAdmin()) init();
