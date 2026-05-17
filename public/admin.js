/* ============================================================================
   Villa Vip Country Store — Painel de Inteligência (front)
   JS puro, zero dependências (filosofia do projeto). Consome /api/analytics
   e renderiza gráficos em HTML/CSS/SVG nativos. Sync Services.
   ========================================================================== */

const $ = (id) => document.getElementById(id);

const brl = (n) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n) => Number(n).toLocaleString("pt-BR");
const pct = (n) => `${Number(n).toLocaleString("pt-BR")}%`;

/* ---------- Tooltip flutuante compartilhado --------------------------- */
const tip = $("tip");

function bindTip(el, html) {
  el.addEventListener("mousemove", (e) => {
    tip.innerHTML = html;
    tip.hidden = false;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
  });
  el.addEventListener("mouseleave", () => {
    tip.hidden = true;
  });
}

/* ---------- Carga de dados -------------------------------------------- */
function logout(toLogin) {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (toLogin) window.location.replace("/login.html");
}

/* ---------- Guarda de acesso -----------------------------------------
   Cliente comum não vê o painel. Este guard é defesa em profundidade: o
   gate real continua sendo o 403 de /api/analytics (que lê a coluna
   `admin` no banco). Aqui só evitamos que um não-admin chegue a ver o
   esqueleto do painel — sem sessão vai pro login; logado mas sem admin
   volta pra vitrine, como um cliente normal. */
function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function ensureAdmin() {
  if (!localStorage.getItem("token")) {
    window.location.replace("/login.html");
    return false;
  }
  const user = getStoredUser();
  if (!user || user.isAdmin !== true) {
    window.location.replace("/");
    return false;
  }
  return true;
}

async function load() {
  setState("loading");
  const token = localStorage.getItem("token");
  if (!token) return logout(true);
  try {
    const res = await fetch("/api/analytics", {
      cache: "no-store",
      headers: { Authorization: "Bearer " + token },
    });
    // 401: sessão inválida/expirada → encerra e manda relogar.
    if (res.status === 401) return logout(true);
    // 403: logado, mas e-mail fora da allowlist de admin → tela de bloqueio.
    if (res.status === 403) {
      setState("deny");
      $("stamp").textContent = "Acesso restrito";
      return;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    render(data);
    setState("ready");
  } catch (err) {
    $("errorMsg").textContent =
      "Não foi possível carregar os dados (" + err.message + ").";
    setState("error");
  }
}

function setState(s) {
  $("loadingState").hidden = s !== "loading";
  $("errorState").hidden = s !== "error";
  $("denyState").hidden = s !== "deny";
  $("dashContent").hidden = s !== "ready";
  $("dashMain").setAttribute("aria-busy", s === "loading" ? "true" : "false");
  if (s === "loading") $("stamp").textContent = "Carregando dados…";
}

/* ---------- Render principal ------------------------------------------ */
function render(d) {
  const r = d.resumo;

  // KPIs
  $("kProdutos").textContent = num(r.totalProdutos);
  $("kCategorias").textContent = num(r.totalCategorias);
  $("kMarcas").textContent = num(r.totalMarcas);
  $("kTicket").textContent = brl(r.precoMedio);
  $("kValor").textContent = brl(r.valorCatalogo);
  $("kPromo").textContent = num(r.emPromocao);
  $("kPromoPct").textContent = "· " + pct(r.pctPromocao);
  $("kDesconto").textContent = pct(r.descontoMedioPct);
  $("kDestaque").textContent = num(r.emDestaque);
  $("kDestaquePct").textContent = "· " + pct(r.pctDestaque);

  // Barras
  barChart($("chCategoria"), d.porCategoria.map((c) => ({
    label: c.nome,
    value: c.qtd,
    text: num(c.qtd),
    tip: `<b>${c.nome}</b><br>${c.qtd} produto(s)<br>Ticket médio ${brl(c.precoMedio)}<br>${c.emPromocao} em promoção`,
  })));

  barChart($("chMarca"), d.porMarca.map((m) => ({
    label: m.marca,
    value: m.qtd,
    text: num(m.qtd),
    tip: `<b>${m.marca}</b><br>${m.qtd} produto(s)<br>Ticket médio ${brl(m.precoMedio)}<br>Acervo ${brl(m.valorTotal)}`,
  })));

  barChart($("chTicket"), d.porCategoria
    .slice()
    .sort((a, b) => b.precoMedio - a.precoMedio)
    .map((c) => ({
      label: c.nome,
      value: c.precoMedio,
      text: brl(c.precoMedio),
      cls: "alt",
      tip: `<b>${c.nome}</b><br>Ticket médio ${brl(c.precoMedio)}<br>${c.qtd} produto(s)`,
    })));

  barChart($("chValor"), d.porCategoria
    .slice()
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .map((c) => ({
      label: c.nome,
      value: c.valorTotal,
      text: brl(c.valorTotal),
      tip: `<b>${c.nome}</b><br>Acervo somado ${brl(c.valorTotal)}<br>${c.qtd} produto(s)`,
    })));

  // Histograma de faixas de preço
  histogram($("chFaixas"), d.faixasPreco);

  // Donuts
  const cheio = r.totalProdutos - r.emPromocao;
  donut(
    $("chPromo"),
    [
      { label: "Em promoção", value: r.emPromocao, color: "#b23b2e" },
      { label: "Preço cheio", value: cheio, color: "#caa15c" },
    ],
    pct(r.pctPromocao),
    "em promoção"
  );

  const tagColors = ["#e2641c", "#c9962b", "#9a8367", "#7a5b30"];
  donut(
    $("chTags"),
    d.tags.map((t, i) => ({
      label: t.tag,
      value: t.qtd,
      color: tagColors[i % tagColors.length],
    })),
    num(r.totalProdutos),
    "produtos"
  );

  // Heatmap marca × categoria
  heatmap($("chMatriz"), d.matriz);

  // Tabelas
  tableCaros(d.topCaros);
  tableDescontos(d.topDescontos);
  tableDestaques(d.destaques);

  // Carimbo de atualização
  const dt = new Date(d.geradoEm);
  const quando =
    dt.toLocaleDateString("pt-BR") +
    " às " +
    dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  $("stamp").textContent = "Atualizado em " + quando;
  $("footStamp").textContent =
    `${d.loja} · faixa de preço ${brl(r.precoMin)}–${brl(r.precoMax)} · ` +
    `${num(r.variacoesTamanho)} variações de tamanho`;
}

/* ---------- Gráfico de barras horizontais ----------------------------- */
function barChart(host, rows) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  host.innerHTML = "";
  rows.forEach((row) => {
    const el = document.createElement("div");
    el.className = "bar-row";
    el.innerHTML = `
      <span class="bar-label" title="${row.label}">${row.label}</span>
      <span class="bar-track">
        <span class="bar-fill ${row.cls || ""}"></span>
        <span class="bar-val">${row.text}</span>
      </span>`;
    host.appendChild(el);
    const fill = el.querySelector(".bar-fill");
    bindTip(fill, row.tip);
    requestAnimationFrame(() => {
      fill.style.width = Math.max((row.value / max) * 100, 2) + "%";
    });
  });
}

/* ---------- Histograma vertical --------------------------------------- */
function histogram(host, faixas) {
  const max = Math.max(...faixas.map((f) => f.qtd), 1);
  host.className = "chart";
  const wrap = document.createElement("div");
  wrap.className = "hist";
  faixas.forEach((f) => {
    const col = document.createElement("div");
    col.className = "hist-col";
    col.innerHTML = `
      <div class="hist-bar"><b>${f.qtd}</b></div>
      <span class="hist-x">${f.label}</span>`;
    wrap.appendChild(col);
    const bar = col.querySelector(".hist-bar");
    bindTip(bar, `<b>${f.label}</b><br>${f.qtd} produto(s)`);
    requestAnimationFrame(() => {
      bar.style.height = f.qtd === 0 ? "3px" : (f.qtd / max) * 100 + "%";
    });
  });
  host.innerHTML = "";
  host.appendChild(wrap);
}

/* ---------- Donut (conic-gradient) ------------------------------------ */
function donut(host, slices, centerBig, centerSmall) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const stops = slices
    .map((s) => {
      const from = (acc / total) * 360;
      acc += s.value;
      const to = (acc / total) * 360;
      return `${s.color} ${from}deg ${to}deg`;
    })
    .join(", ");

  host.innerHTML = `
    <div class="donut" style="background: conic-gradient(${stops});">
      <div class="donut-center"><b>${centerBig}</b><small>${centerSmall}</small></div>
    </div>
    <div class="legend"></div>`;

  const legend = host.querySelector(".legend");
  slices.forEach((s) => {
    const p = Math.round((s.value / total) * 100);
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-dot" style="background:${s.color}"></span>
      <span>${s.label}</span>
      <b>${num(s.value)}</b><i>${p}%</i>`;
    bindTip(item, `<b>${s.label}</b><br>${num(s.value)} · ${p}%`);
    legend.appendChild(item);
  });
}

/* ---------- Heatmap marca × categoria --------------------------------- */
function heatmap(host, m) {
  let max = 1;
  m.grid.forEach((row) => row.forEach((v) => (max = Math.max(max, v))));

  const shade = (v) => {
    if (v === 0) return "";
    const t = 0.18 + (v / max) * 0.82; // intensidade mínima visível
    // interpola creme -> laranja profundo
    const a = [251, 240, 221];
    const b = [180, 78, 16];
    const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
    const fg = t > 0.55 ? "#fff" : "var(--ds-ink)";
    return `background: rgb(${c[0]},${c[1]},${c[2]}); color:${fg};`;
  };

  let html = "<table class='heat-table'><thead><tr><th></th>";
  m.categorias.forEach((c) => (html += `<th>${c.nome}</th>`));
  html += "</tr></thead><tbody>";

  m.marcas.forEach((marca, ri) => {
    html += `<tr><th class="row-h">${marca}</th>`;
    m.categorias.forEach((cat, ci) => {
      const v = m.grid[ri][ci];
      html += `<td class="heat-cell ${v === 0 ? "zero" : ""}" style="${shade(
        v
      )}" data-tip="<b>${marca} · ${cat.nome}</b><br>${v} produto(s)">${v}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  html +=
    `<div class="heat-legend"><span>menos</span>` +
    `<span class="heat-scale"></span><span>mais produtos</span></div>`;

  host.innerHTML = html;
  host.querySelectorAll(".heat-cell").forEach((c) => {
    bindTip(c, c.getAttribute("data-tip"));
  });
}

/* ---------- Tabelas --------------------------------------------------- */
function tableCaros(rows) {
  $("tblCaros").querySelector("tbody").innerHTML = rows
    .map(
      (p) => `<tr>
        <td><span class="t-name">${p.nome}</span><span class="t-id">${p.id}</span></td>
        <td>${p.marca}</td>
        <td class="num">${brl(p.preco)}</td>
      </tr>`
    )
    .join("");
}

function tableDescontos(rows) {
  $("tblDescontos").querySelector("tbody").innerHTML = rows
    .map(
      (p) => `<tr>
        <td><span class="t-name">${p.nome}</span><span class="t-id">${p.id} · ${p.marca}</span></td>
        <td class="num"><span class="t-was">${brl(p.precoDe)}</span>${brl(p.preco)}</td>
        <td class="num"><span class="pill disc">-${p.descontoPct}%</span></td>
      </tr>`
    )
    .join("");
}

function tableDestaques(rows) {
  $("tblDestaques").querySelector("tbody").innerHTML = rows
    .map(
      (p) => `<tr>
        <td><span class="t-name">${p.nome}</span><span class="t-id">${p.id}${
        p.tag ? " · " + p.tag : ""
      }</span></td>
        <td>${p.categoria}</td>
        <td class="num">${brl(p.preco)}</td>
      </tr>`
    )
    .join("");
}

/* ---------- Ações ----------------------------------------------------- */
$("btnLogout").addEventListener("click", () => logout(true));
$("btnDenyLogout").addEventListener("click", () => logout(true));

function refresh(btn) {
  btn.classList.add("is-spin");
  load().finally(() => setTimeout(() => btn.classList.remove("is-spin"), 500));
}

$("btnRefresh").addEventListener("click", (e) =>
  refresh(e.currentTarget)
);
$("btnRetry").addEventListener("click", () => load());

if (ensureAdmin()) load();
