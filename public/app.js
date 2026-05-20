/* ============================================================================
   Villa Vip Country Store — Catálogo Digital (front-end)
   Vitrine leve em JS puro. O "gancho de conversão" monta o link dinâmico
   do WhatsApp com a mensagem pronta a partir do produto + tamanho escolhidos.
   Sync Services.
   ========================================================================== */

const API = {
  store: "/api/store",
  products: (qs) => "/api/products" + (qs ? "?" + qs : ""),
  orders: "/api/orders",
  profile: "/api/auth/profile",
};

const state = {
  categoria: "todos",
  marcas: new Set(),
  q: "",
  ordenar: "destaque",
  store: null,
  current: null, // produto aberto no modal
  size: null,
  qty: 1,
  cart: loadCart(),
  user: loadUser(),
};

/** Lê usuário logado */
function loadUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Lê a sacola do localStorage de forma resiliente (dado corrompido não quebra o app). */
function loadCart() {
  try {
    const raw = localStorage.getItem("vv_cart");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem("vv_cart");
    return [];
  }
}

const brl = (n) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const $ = (id) => document.getElementById(id);

/* ---------- Ícones SVG por categoria (placeholder premium) ---------- */
const ICONS = {
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  boot: '<svg viewBox="0 0 24 24"><path d="M8 3h3v9c0 1 .4 2 1.4 2.8L17 18c1.4 1 2 2 2 3.5H7c-1.7 0-3-1.3-3-3V3h4Z"/><path d="M8 12h3"/><path d="M4 18h3"/></svg>',
  hat: '<svg viewBox="0 0 24 24"><path d="M7 14c-3 .6-5 1.6-5 2.8C2 18.6 6.5 20 12 20s10-1.4 10-3.2c0-1.2-2-2.2-5-2.8"/><path d="M8 14 9.5 5.5C9.8 4 10.7 3 12 3s2.2 1 2.5 2.5L16 14"/></svg>',
  shirt: '<svg viewBox="0 0 24 24"><path d="M9 3 6 5 3 8l2.5 2.5L7 9v12h10V9l1.5 1.5L21 8l-3-3-3-2c0 1.7-1.3 3-3 3S9 4.7 9 3Z"/></svg>',
  jeans: '<svg viewBox="0 0 24 24"><path d="M6 3h12l-.5 5L17 21h-4l-1-11-1 11H7L6.5 8 6 3Z"/><path d="M6 6h12"/></svg>',
  man: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.5"/><path d="M7 21v-7l-2-2 2-4h10l2 4-2 2v7"/><path d="M12 9v12"/></svg>',
  belt: '<svg viewBox="0 0 24 24"><path d="M3 9h18v6H3z"/><rect x="9.5" y="7" width="5" height="10" rx="1"/><path d="M14.5 12H20"/></svg>',
};
const BULL =
  '<svg viewBox="0 0 240 200"><path d="M120 80C104 82 80 80 58 72C38 64 22 50 14 36C26 46 48 52 70 52C92 52 110 60 120 78C130 60 148 52 170 52C192 52 214 46 226 36C218 50 202 64 182 72C160 80 136 82 120 80Z"/><path d="M78 84 L120 170 L162 84 L139 84 L120 126 L101 84 Z"/></svg>';
const IG_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.3"/></svg>';

/** Renderiza N estrelas cheias + vazias a partir da nota (0–5). */
function stars(n) {
  const full = Math.round(Number(n) || 0);
  return (
    '<span class="on">' + "★".repeat(Math.min(5, full)) + "</span>" +
    '<span class="off">' + "★".repeat(Math.max(0, 5 - full)) + "</span>"
  );
}
const escapeHTML = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

const catIcon = (cat) => ICONS[catIconKey(cat)] || ICONS.grid;
function catIconKey(cat) {
  return { camisas: "shirt", "jeans-fem": "jeans", masculino: "man", acessorios: "belt", botas: "boot", chapeus: "hat" }[cat] || "grid";
}

/* ---------- Mídia (foto real ou placeholder ilustrado por categoria) ---------- */
function mediaHTML(p, tagInside) {
  const tagHTML = tagInside && p.tag
    ? `<span class="tag ${p.tag === "Novo" ? "novo" : ""}">${p.tag}</span>`
    : "";
  if (p.imagem) {
    return `
      <div class="card-media m-${p.categoria} has-img">
        ${tagHTML}
        <img class="card-img" src="${escapeHTML(p.imagem)}" alt="${escapeHTML(p.nome)}"
          onerror="this.closest('.card-media').classList.remove('has-img')">
        <span class="wm" aria-hidden="true">${BULL}</span>
        <span class="cat-ico" aria-hidden="true">${catIcon(p.categoria)}</span>
        <span class="m-brand">${p.marca}</span>
      </div>`;
  }
  return `
    <div class="card-media m-${p.categoria}">
      ${tagHTML}
      <span class="wm" aria-hidden="true">${BULL}</span>
      <span class="cat-ico" aria-hidden="true">${catIcon(p.categoria)}</span>
      <span class="m-brand">${p.marca}</span>
    </div>`;
}

/* ---------- Boot ---------- */
async function init() {
  state.store = await fetch(API.store).then((r) => r.json());
  renderChrome();
  bindEvents();
  await loadProducts();
  updateCartBadge();
}

function renderChrome() {
  const s = state.store;

  // Categorias
  $("categories").innerHTML = s.categorias
    .map(
      (c) =>
        `<button class="cat-pill ${c.id === "todos" ? "active" : ""}" data-cat="${c.id}">
           ${ICONS[c.icone] || ICONS.grid}<span>${c.nome}</span>
         </button>`
    )
    .join("");

  // Marcas
  $("brandChips").innerHTML = s.marcas
    .map((m) => `<button class="brand-chip" data-marca="${m}">${m}</button>`)
    .join("");

  // WhatsApp flutuante
  const oi = encodeURIComponent(
    `Olá, ${s.nome}! 🤠 Vi o catálogo digital e gostaria de mais informações.`
  );
  $("waFloat").href = `https://wa.me/${s.whatsapp}?text=${oi}`;

  // Footer
  $("footAddr").textContent = `${s.endereco} · CEP ${s.cep}`;
  $("footCredit").innerHTML = `${s.creditoRodape.replace(
    "Sync Services",
    "<b>Sync Services</b>"
  )} · © ${new Date().getFullYear()}`;
  $("footerInfo").innerHTML = `
    <div class="foot-col">
      <h4>Atendimento</h4>
      <a href="https://wa.me/${s.whatsapp}" target="_blank" rel="noopener">WhatsApp ${s.whatsappDisplay}</a>
      <p>Fixo ${s.telefoneFixo}</p>
      <p>${s.horario}</p>
    </div>
    <div class="foot-col">
      <h4>Encontre-nos</h4>
      <a href="${s.instagramUrl}" target="_blank" rel="noopener">Instagram @${s.instagram}</a>
      <a href="${s.facebook}" target="_blank" rel="noopener">Facebook /${s.instagram}</a>
      <a href="${s.mapsUrl}" target="_blank" rel="noopener">Ver no mapa</a>
    </div>`;

  // Prova social: avaliações do Google + clientes + Instagram
  renderSocialProof();

  // Autenticação
  renderAuth();
}

/* ---------- Prova social: avaliações Google + Instagram ---------- */
function renderSocialProof() {
  const box = $("socialProof");
  const sp = state.store.social;
  if (!box || !sp) {
    if (box) box.hidden = true;
    return;
  }

  const g = sp.google || {};
  const ig = sp.instagram || {};
  const cli = sp.clientes || {};
  const nota = g.nota ? Number(g.nota).toFixed(1).replace(".", ",") : null;
  const reviews = Array.isArray(g.avaliacoes) ? g.avaliacoes : [];
  const embeds = Array.isArray(ig.embeds) ? ig.embeds : [];

  // Faixa de números (prova social rápida)
  const statsHTML = `
    <div class="stats-band">
      ${nota
        ? `<a class="stat" href="${g.url || "#"}" target="_blank" rel="noopener">
             <b>${nota}<i>★</i></b><span>nota no Google</span>
           </a>`
        : ""}
      ${cli.numero
        ? `<div class="stat">
             <b>${escapeHTML(cli.numero)}</b><span>${escapeHTML(cli.rotulo || "clientes")}</span>
           </div>`
        : ""}
      ${ig.handle
        ? `<a class="stat" href="${ig.url || "#"}" target="_blank" rel="noopener">
             <b>@${escapeHTML(ig.handle)}</b><span>no Instagram</span>
           </a>`
        : ""}
    </div>`;

  // Avaliações reais do Google — carrossel contínuo (marquee)
  const revCard = (r, dup) => `
    <article class="rev-card"${dup ? ' aria-hidden="true"' : ""}>
      <div class="rev-top">
        <span class="rev-avatar">${escapeHTML((r.autor || "?").charAt(0).toUpperCase())}</span>
        <div class="rev-id">
          <b>${escapeHTML(r.autor || "Cliente")}</b>
          <small>${escapeHTML(r.quando || "")}</small>
        </div>
        <span class="rev-g" aria-label="via Google">G</span>
      </div>
      <div class="rev-stars">${stars(r.nota || 5)}</div>
      <p class="rev-text">${escapeHTML(r.texto || "")}</p>
    </article>`;

  // Velocidade proporcional à quantidade (≈6s por card, mínimo 30s)
  const revDur = Math.max(30, reviews.length * 6);

  const reviewsHTML = reviews.length
    ? `
    <div class="reviews">
      <div class="sec-head">
        <h2>O que dizem nossos clientes</h2>
        <a class="rev-google" href="${g.url || "#"}" target="_blank" rel="noopener">
          ${nota ? `<strong>${nota}</strong>` : ""}
          <span class="rev-google-stars">${stars(g.nota || 5)}</span>
          ${g.total ? `<em>${g.total} avaliações</em>` : ""}
          <span class="rev-google-cta">Ver no Google →</span>
        </a>
      </div>
      <div class="rev-marquee" aria-label="Avaliações de clientes">
        <div class="rev-track" data-dur="${revDur}">
          ${reviews.map((r) => revCard(r, false)).join("")}
          ${reviews.map((r) => revCard(r, true)).join("")}
        </div>
      </div>
    </div>`
    : "";

  // Instagram — siga + grade de posts
  const instaHTML = ig.handle
    ? `
    <div class="insta">
      <div class="sec-head">
        <h2>${IG_ICON} @${escapeHTML(ig.handle)} no Instagram</h2>
        <a class="btn-insta" href="${ig.url || "#"}" target="_blank" rel="noopener">Seguir</a>
      </div>
      ${ig.chamada ? `<p class="insta-sub">${escapeHTML(ig.chamada)}</p>` : ""}
      ${embeds.length
        ? `<div class="insta-embeds">
             ${embeds
               .map(
                 (url) => `
             <blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14">
               <a href="${url}" target="_blank" rel="noopener">Ver post no Instagram</a>
             </blockquote>`
               )
               .join("")}
           </div>`
        : `<p class="insta-sub">Siga <a href="${ig.url}" target="_blank" rel="noopener">@${escapeHTML(ig.handle)}</a> no Instagram.</p>`}
    </div>`
    : "";

  box.hidden = false;
  box.innerHTML = `<div class="wrap">${statsHTML}${reviewsHTML}${instaHTML}</div>`;

  startReviewMarquee();
  loadInstagramEmbeds();
}

/* ---------- Embed oficial do Instagram ---------- */
function loadInstagramEmbeds() {
  if (!document.querySelector(".instagram-media")) return;
  // Já carregado: só reprocessa os novos blockquotes
  if (window.instgrm && window.instgrm.Embeds) {
    window.instgrm.Embeds.process();
    return;
  }
  if (document.getElementById("ig-embed-js")) return; // já está baixando
  const s = document.createElement("script");
  s.id = "ig-embed-js";
  s.async = true;
  s.src = "https://www.instagram.com/embed.js";
  document.body.appendChild(s);
}

/* ---------- Carrossel de avaliações (motor em JS, roda sozinho) ---------- */
let reviewRAF = 0;
function startReviewMarquee() {
  cancelAnimationFrame(reviewRAF);
  const marquee = document.querySelector(".rev-marquee");
  const track = marquee && marquee.querySelector(".rev-track");
  if (!track) return;

  const dur = Math.max(20, Number(track.dataset.dur) || 40); // segundos por volta
  const firstDup = track.querySelector('[aria-hidden="true"]');
  let loopW = 0; // largura de 1 conjunto = ponto de reinício sem emenda
  let x = 0;
  let last = performance.now();
  let paused = false;

  function measure() {
    const prev = track.style.transform;
    track.style.transform = "none";
    loopW = firstDup
      ? firstDup.getBoundingClientRect().left - track.getBoundingClientRect().left
      : track.scrollWidth / 2;
    track.style.transform = prev;
  }
  measure();
  window.addEventListener("resize", measure);

  // Pausa ao interagir; retoma sozinho ao sair
  marquee.addEventListener("mouseenter", () => (paused = true));
  marquee.addEventListener("mouseleave", () => (paused = false));
  marquee.addEventListener("focusin", () => (paused = true));
  marquee.addEventListener("focusout", () => (paused = false));

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // clamp p/ abas em 2º plano
    last = now;
    if (!paused && loopW > 0 && !document.hidden) {
      x += (loopW / dur) * dt;
      if (x >= loopW) x -= loopW;
      track.style.transform = `translate3d(${-x}px,0,0)`;
    }
    reviewRAF = requestAnimationFrame(frame);
  }
  reviewRAF = requestAnimationFrame(frame);
}

/* ---------- Autenticação UI ---------- */
function renderAuth() {
  const btnLogin = $("btnLogin");
  const userProfile = $("userProfile");
  
  if (state.user) {
    btnLogin.hidden = true;
    userProfile.hidden = false;
    $("userNameLabel").textContent = state.user.nome.split(" ")[0]; // Primeiro nome
    $("ddUserName").textContent = state.user.nome;
    $("ddUserEmail").textContent = state.user.email;
    
    const btnAdminPanel = $("btnAdminPanel");
    if (btnAdminPanel) {
      btnAdminPanel.hidden = !state.user.isAdmin;
    }
    
    // Configura avatar com inicial do nome se não houver foto
    if (!state.user.avatar) {
      const init = state.user.nome.charAt(0).toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2a1d10"/><text x="50" y="66" font-family="Inter, sans-serif" font-size="45" font-weight="600" fill="#fff" text-anchor="middle">${init}</text></svg>`;
      $("userAvatarImg").src = `data:image/svg+xml;base64,${btoa(svg)}`;
    }
  } else {
    btnLogin.hidden = false;
    userProfile.hidden = true;
  }
}

function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const menu = $("userDropdown");
  menu.hidden = !menu.hidden;
}

function handleLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  state.user = null;
  $("userDropdown").hidden = true;
  renderAuth();
  flash("Você saiu da conta.");
}

/* ---------- Fetch autenticado (Bearer) ---------- */
function getToken() {
  return localStorage.getItem("token");
}

/**
 * fetch com Authorization. Se a sessão expirou (401), limpa o login e
 * devolve null — quem chamou decide a mensagem amigável.
 */
async function authFetch(url, opts = {}) {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    handleLogout();
    flash("Sua sessão expirou. Entre novamente.");
    return null;
  }
  return res;
}

/* ---------- Persistência do pedido (Meus Pedidos) ---------- */
/** Grava no Supabase o pedido finalizado pelo WhatsApp (só se logado). */
async function recordOrder(itens) {
  if (!state.user || !getToken() || !itens.length) return;
  try {
    await authFetch(API.orders, {
      method: "POST",
      body: JSON.stringify({ itens }),
    });
  } catch (err) {
    // Não bloqueia a conversão no WhatsApp se o registro falhar.
    console.error("Falha ao registrar pedido:", err);
  }
}

/* ---------- Meus Pedidos ---------- */
const fmtData = (iso) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const STATUS_LABEL = {
  enviado: "Enviado ao WhatsApp",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

async function openOrders() {
  $("userDropdown").hidden = true;
  const body = $("ordersBody");
  body.innerHTML = `<p class="cart-empty">Carregando…</p>`;
  openOverlay("ordersOverlay");

  const res = await authFetch(API.orders);
  if (!res) {
    closeOverlay("ordersOverlay");
    return;
  }
  if (!res.ok) {
    body.innerHTML = `<p class="cart-empty">Não foi possível carregar seus pedidos.</p>`;
    return;
  }

  const { pedidos } = await res.json();
  if (!pedidos.length) {
    body.innerHTML = `<p class="cart-empty">Você ainda não fez pedidos.<br>Finalize uma compra pelo WhatsApp e ela aparecerá aqui.</p>`;
    return;
  }

  body.innerHTML = pedidos
    .map((o) => {
      const itens = (o.itens || [])
        .map(
          (i) => `
        <div class="ord-line">
          <span class="ord-thumb m-${i.categoria || "todos"}">${catIcon(
            i.categoria
          )}</span>
          <div class="ord-line-info">
            <b>${escapeHTML(i.nome)}</b>
            <small>${escapeHTML(i.marca || "")}${
            i.size ? " · Tam " + escapeHTML(i.size) : ""
          } · Qtd ${i.qty}</small>
          </div>
          <span class="ord-line-price">${brl(i.preco * i.qty)}</span>
        </div>`
        )
        .join("");
      const st = STATUS_LABEL[o.status] || o.status;
      return `
      <article class="order-card">
        <header class="order-head">
          <div>
            <b>${fmtData(o.created_at)}</b>
            <span class="order-status st-${o.status}">${st}</span>
          </div>
          <strong class="order-total">${brl(o.total)}</strong>
        </header>
        <div class="order-items">${itens}</div>
      </article>`;
    })
    .join("");
}

/* ---------- Editar Perfil ---------- */
function profileMsg(text, kind) {
  const box = $("profileMsg");
  box.className = "auth-msg " + (kind || "error");
  box.textContent = text;
  box.hidden = false;
}

function openProfile() {
  $("userDropdown").hidden = true;
  if (!state.user) return;
  $("pfNome").value = state.user.nome || "";
  $("pfEmail").value = state.user.email || "";
  $("pfSenha").value = "";
  $("pfSenha2").value = "";
  $("profileMsg").hidden = true;
  openOverlay("profileOverlay");
}

async function submitProfile(e) {
  e.preventDefault();
  const nome = $("pfNome").value.trim();
  const senha = $("pfSenha").value;
  const senha2 = $("pfSenha2").value;
  const btn = $("pfSubmit");

  if (!nome) return profileMsg("O nome não pode ficar vazio.");
  if (senha || senha2) {
    if (senha.length < 6)
      return profileMsg("A nova senha precisa ter ao menos 6 caracteres.");
    if (senha !== senha2) return profileMsg("As senhas não são iguais.");
  }

  btn.disabled = true;
  btn.textContent = "Salvando…";
  $("profileMsg").hidden = true;

  const res = await authFetch(API.profile, {
    method: "PUT",
    body: JSON.stringify({ nome, senha: senha || undefined }),
  });

  btn.disabled = false;
  btn.textContent = "Salvar alterações";

  if (!res) {
    closeOverlay("profileOverlay");
    return;
  }
  const data = await res.json();
  if (!res.ok) {
    return profileMsg(data.message || "Não foi possível salvar.");
  }

  state.user = data.user;
  localStorage.setItem("user", JSON.stringify(data.user));
  renderAuth();
  profileMsg("Perfil atualizado com sucesso!", "success");
  setTimeout(() => closeOverlay("profileOverlay"), 1200);
}

/* ---------- Carregar / renderizar produtos ---------- */
async function loadProducts() {
  const qs = new URLSearchParams();
  if (state.categoria !== "todos") qs.set("categoria", state.categoria);
  if (state.marcas.size) qs.set("marca", [...state.marcas].join(","));
  if (state.q) qs.set("q", state.q);
  qs.set("ordenar", state.ordenar);

  const { total, produtos } = await fetch(API.products(qs.toString())).then(
    (r) => r.json()
  );

  const grid = $("grid");
  $("resultsCount").textContent =
    total === 0 ? "Nenhum produto" : `${total} produto${total > 1 ? "s" : ""}`;
  const filtering =
    state.categoria !== "todos" || state.marcas.size || state.q;
  $("clearFilters").hidden = !filtering;

  if (total === 0) {
    grid.innerHTML = "";
    $("emptyState").hidden = false;
    return;
  }
  $("emptyState").hidden = true;

  grid.innerHTML = produtos
    .map(
      (p) => `
      <article class="card" data-id="${p.id}">
        ${mediaHTML(p, true)}
        <div class="card-body">
          <span class="c-brand">${p.marca}</span>
          <h3 class="c-name">${p.nome}</h3>
          <div class="c-price">
            <span class="now">${brl(p.preco)}</span>
            ${p.precoDe ? `<span class="old">${brl(p.precoDe)}</span>` : ""}
          </div>
          <button class="c-cta">Ver e pedir</button>
        </div>
      </article>`
    )
    .join("");

  grid.querySelectorAll(".card").forEach((el) =>
    el.addEventListener("click", () => openSheet(el.dataset.id, produtos))
  );
}

/* ---------- Modal de produto ---------- */
function openSheet(id, produtos) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;
  state.current = p;
  state.size = null;
  state.qty = 1;

  $("sheetMedia").className = "sheet-media m-" + p.categoria + (p.imagem ? " has-img" : "");
  $("sheetMedia").innerHTML = p.imagem
    ? `<img class="sheet-img" src="${escapeHTML(p.imagem)}" alt="${escapeHTML(p.nome)}"
         onerror="this.closest('.sheet-media').classList.remove('has-img')">
       <span class="wm" aria-hidden="true">${BULL}</span>
       <span class="cat-ico" aria-hidden="true">${catIcon(p.categoria)}</span>
       <span class="m-brand">${p.marca}</span>`
    : `<span class="wm" aria-hidden="true">${BULL}</span>
       <span class="cat-ico" aria-hidden="true">${catIcon(p.categoria)}</span>
       <span class="m-brand">${p.marca}</span>`;
  $("sheetBrand").textContent = p.marca;
  $("sheetName").textContent = p.nome;
  $("sheetDesc").textContent = p.descricao;
  $("sheetPrice").innerHTML = `
    <span class="now">${brl(p.preco)}</span>
    ${p.precoDe
      ? `<span class="old">${brl(p.precoDe)}</span>
           <span class="off">-${Math.round((1 - p.preco / p.precoDe) * 100)}%</span>`
      : ""
    }`;
  $("sizeReq").textContent = "— selecione";
  $("sizeReq").classList.remove("ok");
  $("sizeGrid").innerHTML = p.tamanhos
    .map((t) => `<button class="size-btn" data-size="${t}">${t}</button>`)
    .join("");
  $("sizeGrid")
    .querySelectorAll(".size-btn")
    .forEach((b) =>
      b.addEventListener("click", () => {
        state.size = b.dataset.size;
        $("sizeGrid")
          .querySelectorAll(".size-btn")
          .forEach((x) => x.classList.toggle("active", x === b));
        $("sizeReq").textContent = "✓ tamanho " + b.dataset.size;
        $("sizeReq").classList.add("ok");
      })
    );
  $("qtyValue").textContent = "1";
  openOverlay("sheetOverlay");
}

/* ---------- Geração do link dinâmico do WhatsApp ---------- */
function waLink(text) {
  return `https://wa.me/${state.store.whatsapp}?text=${encodeURIComponent(text)}`;
}

function msgProduto(p, size, qty) {
  return (
    `Olá, ${state.store.nome}! 🤠 Vi no catálogo digital e quero este produto:\n\n` +
    `• *${p.nome}*\n` +
    `• Marca: ${p.marca}\n` +
    `• Tamanho: ${size}\n` +
    `• Qtd: ${qty}\n` +
    `• Valor: ${brl(p.preco)}\n` +
    `• Ref: #${p.id}\n\n` +
    `Está disponível? Como faço pra garantir o meu? 👢`
  );
}

function buyNow() {
  const p = state.current;
  if (!state.size) {
    flash("Escolha um tamanho primeiro 👆");
    pulseSizes();
    return;
  }
  recordOrder([
    {
      id: p.id,
      nome: p.nome,
      marca: p.marca,
      categoria: p.categoria,
      size: state.size,
      preco: p.preco,
      qty: state.qty,
    },
  ]);
  window.open(waLink(msgProduto(p, state.size, state.qty)), "_blank");
}

/* ---------- Sacola ---------- */
function saveCart() {
  localStorage.setItem("vv_cart", JSON.stringify(state.cart));
  updateCartBadge();
}
function updateCartBadge() {
  const n = state.cart.reduce((s, i) => s + i.qty, 0);
  const badge = $("cartCount");
  badge.textContent = n;
  badge.hidden = n === 0;
}
function addToCart() {
  const p = state.current;
  if (!state.size) {
    flash("Escolha um tamanho primeiro 👆");
    pulseSizes();
    return;
  }
  const key = p.id + "|" + state.size;
  const found = state.cart.find((i) => i.key === key);
  if (found) found.qty += state.qty;
  else
    state.cart.push({
      key,
      id: p.id,
      nome: p.nome,
      marca: p.marca,
      categoria: p.categoria,
      size: state.size,
      preco: p.preco,
      qty: state.qty,
    });
  saveCart();
  closeOverlay("sheetOverlay");
  flash("Adicionado à sacola 🛍️");
}
function renderCart() {
  const box = $("cartItems");
  if (!state.cart.length) {
    box.innerHTML = `<p class="cart-empty">Sua sacola está vazia.<br>Explore o catálogo e adicione seus itens.</p>`;
    $("cartTotal").textContent = brl(0);
    return;
  }
  box.innerHTML = state.cart
    .map(
      (i, idx) => `
      <div class="ci">
        <div class="ci-thumb m-${i.categoria}">${catIcon(i.categoria)}</div>
        <div class="ci-info">
          <b>${i.nome}</b>
          <small>${i.marca} · Tam ${i.size} · Qtd ${i.qty}</small>
          <span class="ci-price">${brl(i.preco * i.qty)}</span>
        </div>
        <button class="ci-remove" data-rm="${idx}">remover</button>
      </div>`
    )
    .join("");
  box.querySelectorAll("[data-rm]").forEach((b) =>
    b.addEventListener("click", () => {
      state.cart.splice(+b.dataset.rm, 1);
      saveCart();
      renderCart();
    })
  );
  $("cartTotal").textContent = brl(
    state.cart.reduce((s, i) => s + i.preco * i.qty, 0)
  );
}
function checkoutWa() {
  if (!state.cart.length) {
    flash("Sua sacola está vazia");
    return;
  }
  const linhas = state.cart
    .map(
      (i, n) =>
        `${n + 1}. *${i.nome}* — ${i.marca} | Tam ${i.size} | Qtd ${i.qty} | #${i.id}`
    )
    .join("\n");
  const total = state.cart.reduce((s, i) => s + i.preco * i.qty, 0);
  const msg =
    `Olá, ${state.store.nome}! 🤠 Montei meu pedido pelo catálogo digital:\n\n` +
    `${linhas}\n\n` +
    `Total estimado: ${brl(total)} (a confirmar)\n` +
    `Fico no aguardo! 🙌`;
  recordOrder(state.cart.map((i) => ({ ...i })));
  window.open(waLink(msg), "_blank");
}

/* ---------- UI helpers ---------- */
function openOverlay(id) {
  $(id).hidden = false;
  document.body.style.overflow = "hidden";
}
function closeOverlay(id) {
  $(id).hidden = true;
  document.body.style.overflow = "";
}
let toastT;
function flash(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 2600);
}
function pulseSizes() {
  const g = $("sizeGrid");
  g.style.transition = "transform .1s";
  g.style.transform = "scale(1.03)";
  setTimeout(() => (g.style.transform = ""), 160);
}
let searchT;

/* ---------- Eventos ---------- */
function bindEvents() {
  $("categories").addEventListener("click", (e) => {
    const b = e.target.closest(".cat-pill");
    if (!b) return;
    state.categoria = b.dataset.cat;
    $("categories")
      .querySelectorAll(".cat-pill")
      .forEach((x) => x.classList.toggle("active", x === b));
    loadProducts();
  });

  $("brandChips").addEventListener("click", (e) => {
    const b = e.target.closest(".brand-chip");
    if (!b) return;
    const m = b.dataset.marca;
    state.marcas.has(m) ? state.marcas.delete(m) : state.marcas.add(m);
    b.classList.toggle("active");
    loadProducts();
  });

  $("sortSelect").addEventListener("change", (e) => {
    state.ordenar = e.target.value;
    loadProducts();
  });

  $("searchToggle").addEventListener("click", () => {
    const bar = $("searchbar");
    bar.hidden = !bar.hidden;
    if (!bar.hidden) $("searchInput").focus();
  });
  $("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchT);
    state.q = e.target.value.trim();
    searchT = setTimeout(loadProducts, 280);
  });

  const reset = () => {
    state.categoria = "todos";
    state.marcas.clear();
    state.q = "";
    state.ordenar = "destaque";
    $("searchInput").value = "";
    $("sortSelect").value = "destaque";
    $("categories")
      .querySelectorAll(".cat-pill")
      .forEach((x) => x.classList.toggle("active", x.dataset.cat === "todos"));
    $("brandChips")
      .querySelectorAll(".brand-chip")
      .forEach((x) => x.classList.remove("active"));
    loadProducts();
  };
  $("clearFilters").addEventListener("click", reset);
  $("emptyReset").addEventListener("click", reset);

  // Modal
  $("sheetClose").addEventListener("click", () => closeOverlay("sheetOverlay"));
  $("sheetOverlay").addEventListener("click", (e) => {
    if (e.target.id === "sheetOverlay") closeOverlay("sheetOverlay");
  });
  $("qtyMinus").addEventListener("click", () => {
    state.qty = Math.max(1, state.qty - 1);
    $("qtyValue").textContent = state.qty;
  });
  $("qtyPlus").addEventListener("click", () => {
    state.qty = Math.min(99, state.qty + 1);
    $("qtyValue").textContent = state.qty;
  });
  $("btnBuyWa").addEventListener("click", buyNow);
  $("btnAddCart").addEventListener("click", addToCart);

  // Sacola
  $("cartToggle").addEventListener("click", () => {
    renderCart();
    openOverlay("cartOverlay");
  });
  $("cartClose").addEventListener("click", () => closeOverlay("cartOverlay"));
  $("cartOverlay").addEventListener("click", (e) => {
    if (e.target.id === "cartOverlay") closeOverlay("cartOverlay");
  });
  $("btnCheckoutWa").addEventListener("click", checkoutWa);

  // Autenticação / Menu
  $("userAvatarBtn").addEventListener("click", toggleUserMenu);
  $("btnLogout").addEventListener("click", handleLogout);

  // Meus Pedidos
  $("btnMyOrders").addEventListener("click", (e) => {
    e.preventDefault();
    openOrders();
  });
  $("ordersClose").addEventListener("click", () =>
    closeOverlay("ordersOverlay")
  );
  $("ordersOverlay").addEventListener("click", (e) => {
    if (e.target.id === "ordersOverlay") closeOverlay("ordersOverlay");
  });

  // Editar Perfil
  $("btnMyProfile").addEventListener("click", (e) => {
    e.preventDefault();
    openProfile();
  });
  $("profileClose").addEventListener("click", () =>
    closeOverlay("profileOverlay")
  );
  $("profileOverlay").addEventListener("click", (e) => {
    if (e.target.id === "profileOverlay") closeOverlay("profileOverlay");
  });
  $("profileForm").addEventListener("submit", submitProfile);
  
  document.addEventListener("click", (e) => {
    // Fecha menu do usuário se clicar fora
    if (!e.target.closest("#userProfile") && !$("userDropdown").hidden) {
      $("userDropdown").hidden = true;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeOverlay("sheetOverlay");
      closeOverlay("cartOverlay");
      closeOverlay("ordersOverlay");
      closeOverlay("profileOverlay");
      $("userDropdown").hidden = true;
    }
  });
}

init().catch((err) => {
  console.error(err);
  $("resultsCount").textContent = "Erro ao carregar o catálogo.";
});
