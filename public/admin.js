/* ============================================================================
   Villa Vip Country Store — Painel de Inteligência (front)
   JS puro, zero dependências (filosofia do projeto). Consome /api/analytics
   e renderiza gráficos em HTML/CSS/SVG nativos. Sync Services.
   ========================================================================== */

const $ = (id) => document.getElementById(id);

// Formatters vêm de shared.js (window.VV). Aliases mantêm o restante do arquivo legível.
const brl = VV.brl;
const num = VV.num;
const pct = VV.pct;

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
async function load() {
  setState("loading");
  try {
    const res = await VV.authFetch("/api/analytics", {
      cache: "no-store",
      onForbidden: () => {
        setState("deny");
        $("stamp").textContent = "Acesso restrito";
      },
    });
    if (res.status === 403) return;
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    render(data);
    setState("ready");
  } catch (err) {
    if (err?.message === "Sessão expirada") return;
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

  // Loja física (Fase 2) — primeiro bloco visual
  renderStoreCard(d.lojas?.[0]);

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

/* ---------- Card "Loja Física" --------------------------------------- */
function renderStoreCard(loja) {
  if (!loja) { $("storeSection").hidden = true; return; }
  $("storeSection").hidden = false;

  const v = loja.vendas30d || {};
  const hoje = v.hoje || { qtd: 0, faturamento: 0 };
  const top = (loja.topSkus || []).slice(0, 5);
  const mix = (v.mixPagamento || []);
  const totalMix = mix.reduce((s, m) => s + m.valor, 0) || 1;
  const palette = ["#e2641c", "#c9962b", "#9a8367", "#7a5b30", "#b44e10", "#6f5c40"];

  const PAG_LABELS = {
    dinheiro: "Dinheiro", pix: "PIX", credito: "Crédito",
    debito: "Débito", crediario: "Crediário", outro: "Outro",
  };

  const enderecoCompleto = `${loja.enderecoLinha1} · ${loja.cidade}/${loja.uf}`;
  const statusOpen = loja.status?.open;
  const statusLabel = loja.status?.label || "—";

  const fachada = loja.fotoFachada
    ? `<img class="store-fachada" src="${VV.escapeHtml(loja.fotoFachada)}" alt="Fachada da ${VV.escapeHtml(loja.nome)}">`
    : `<div class="store-fachada store-fachada--placeholder" aria-hidden="true">
         <svg viewBox="0 0 24 24"><path d="M3 9 12 2l9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></svg>
         <span>Sem foto da fachada</span>
       </div>`;

  const whatsappHref = loja.whatsapp
    ? `https://wa.me/${loja.whatsapp}` : null;

  const topList = top.length ? `
    <ol class="store-top">
      ${top.map((t) => `
        <li>
          <span class="store-top-nome">${VV.escapeHtml(t.nome || t.productId)}</span>
          <span class="store-top-qty">${num(t.qty)}<small>un</small></span>
        </li>`).join("")}
    </ol>
  ` : `<p class="store-empty">Sem vendas no balcão nos últimos 30 dias. <a href="/admin/loja">Lançar a primeira →</a></p>`;

  let acc = 0;
  const donutStops = mix.length
    ? mix.map((m, i) => {
        const from = (acc / totalMix) * 360;
        acc += m.valor;
        const to = (acc / totalMix) * 360;
        return `${palette[i % palette.length]} ${from}deg ${to}deg`;
      }).join(", ")
    : "var(--ds-line-strong) 0deg 360deg";

  const mixLegend = mix.length
    ? mix.map((m, i) => `
        <li>
          <span class="store-mix-dot" style="background:${palette[i % palette.length]}"></span>
          <span>${PAG_LABELS[m.pagamento] || m.pagamento}</span>
          <b>${brl(m.valor)}</b>
        </li>`).join("")
    : `<li class="store-mix-empty">Sem vendas registradas</li>`;

  $("storeCard").innerHTML = `
    <div class="store-card-grid">
      <div class="store-fachada-wrap">
        ${fachada}
        <div class="store-id">
          <span class="store-pill ${statusOpen ? "is-open" : "is-closed"}">${VV.escapeHtml(statusLabel)}</span>
          <h2>${VV.escapeHtml(loja.nome)}</h2>
          <p>${VV.escapeHtml(enderecoCompleto)}</p>
          <div class="store-links">
            ${loja.mapsUrl ? `<a class="dash-btn ghost" href="${VV.escapeHtml(loja.mapsUrl)}" target="_blank" rel="noopener">Como chegar</a>` : ""}
            ${whatsappHref ? `<a class="dash-btn ghost" href="${whatsappHref}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
            <a class="dash-btn solid" href="/admin/loja">Gerenciar loja</a>
          </div>
        </div>
      </div>

      <div class="store-stats">
        <div class="store-kpi-row">
          <div class="store-kpi">
            <span class="store-kpi-label">Faturamento hoje</span>
            <strong>${brl(hoje.faturamento)}</strong>
            <small>${num(hoje.qtd)} venda(s)</small>
          </div>
          <div class="store-kpi">
            <span class="store-kpi-label">Faturamento 30d</span>
            <strong>${brl(v.faturamento || 0)}</strong>
            <small>${num(v.qtd || 0)} venda(s)</small>
          </div>
          <div class="store-kpi">
            <span class="store-kpi-label">Ticket médio 30d</span>
            <strong>${brl(v.ticketMedio || 0)}</strong>
            <small>presencial</small>
          </div>
          <div class="store-kpi store-kpi--ruptura">
            <span class="store-kpi-label">SKUs em ruptura</span>
            <strong>${num(loja.rupturaCount || 0)}</strong>
            <small><a href="/admin/loja">Ver estoque →</a></small>
          </div>
        </div>

        <div class="store-bottom">
          <div class="store-mix">
            <span class="store-h">Mix de pagamento · 30d</span>
            <div class="store-mix-row">
              <div class="store-donut" style="background: conic-gradient(${donutStops});">
                <div class="store-donut-center"><b>${brl(v.faturamento || 0)}</b><small>total</small></div>
              </div>
              <ul class="store-mix-legend">${mixLegend}</ul>
            </div>
          </div>

          <div class="store-top-wrap">
            <span class="store-h">Top SKUs no balcão · 30d</span>
            ${topList}
          </div>
        </div>
      </div>
    </div>
  `;
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
$("btnLogout").addEventListener("click", () => VV.logout());
$("btnDenyLogout").addEventListener("click", () => VV.logout());

function refresh(btn) {
  btn.classList.add("is-spin");
  load().finally(() => setTimeout(() => btn.classList.remove("is-spin"), 500));
}

$("btnRefresh").addEventListener("click", (e) =>
  refresh(e.currentTarget)
);
$("btnRetry").addEventListener("click", () => load());

if (VV.guard({ requireAdmin: true })) load();
