/* ============================================================================
   Villa Vip Country Store — Pedidos (admin)
   Consome /api/admin/orders, permite filtrar, paginar e atualizar status.
   Vanilla JS. Sync Services.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const brl = VV.brl;
const authFetch = VV.authFetch;

const STATUS_LABELS = {
  enviado: 'Enviado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};
const STATUS_FLOW = ['enviado', 'em_andamento', 'concluido', 'cancelado'];

const state = {
  limit: 20,
  offset: 0,
  total: 0,
  status: '',
  q: '',
  pedidos: [],
};
let searchTimer;

/* ---------- State helpers --------------------------------------------- */
function setState(s) {
  $('loadingState').hidden = s !== 'loading';
  $('errorState').hidden   = s !== 'error';
  $('denyState').hidden    = s !== 'deny';
  $('pageContent').hidden  = s !== 'ready';
  $('dashMain').setAttribute('aria-busy', s === 'loading' ? 'true' : 'false');
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' · ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function shortId(id) {
  return String(id || '').slice(0, 8);
}

function itensResumo(itens) {
  if (!Array.isArray(itens) || !itens.length) return '—';
  const qty = itens.reduce((s, i) => s + Number(i.qty || 0), 0);
  const first = itens[0]?.nome || 'item';
  if (itens.length === 1) return `${qty}× ${first}`;
  return `${qty} itens · ${first} +${itens.length - 1}`;
}

/* ---------- Fetch ----------------------------------------------------- */
async function load() {
  setState('loading');
  const params = new URLSearchParams({
    limit: state.limit,
    offset: state.offset,
  });
  if (state.status) params.set('status', state.status);
  if (state.q)      params.set('q', state.q);

  try {
    let denied = false;
    const res = await authFetch(`/api/admin/orders?${params}`, {
      onForbidden: () => (denied = true),
    });
    if (denied) return setState('deny');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.total = data.total;
    state.pedidos = data.pedidos;
    render();
    setState('ready');
    updateStamp();
  } catch (err) {
    if (err?.message === 'Sessão expirada') return;
    $('errorMsg').textContent = 'Não foi possível carregar (' + err.message + ').';
    setState('error');
  }
}

function updateStamp() {
  $('stamp').textContent = state.total
    ? `${state.total} pedido(s) nos últimos 30 dias`
    : 'Nenhum pedido nos últimos 30 dias';
}

/* ---------- Render tabela --------------------------------------------- */
function render() {
  const rows = state.pedidos;
  $('ordersCount').textContent =
    `${state.total} pedido(s) · página ${Math.floor(state.offset / state.limit) + 1}`;
  $('emptyMsg').hidden = rows.length > 0;

  $('ordersBody').innerHTML = rows.map((p) => {
    const cliente = p.user_nome || p.user_email || '—';
    const subt = p.user_email && p.user_nome
      ? `<span class="t-id">${VV.escapeHtml(p.user_email)}</span>` : '';
    return `
      <tr data-id="${p.id}">
        <td><code class="pe-ref">${shortId(p.id)}</code></td>
        <td>
          <span class="t-name">${VV.escapeHtml(cliente)}</span>
          ${subt}
        </td>
        <td>${VV.escapeHtml(itensResumo(p.itens))}</td>
        <td class="num">${brl(p.total)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${fmtDate(p.created_at)}</td>
        <td class="pe-actions">
          <button class="pe-act edit" data-act="view">Detalhes</button>
          <button class="pe-act"      data-act="next">${nextLabel(p.status)}</button>
        </td>
      </tr>`;
  }).join('');

  $('ordersBody').querySelectorAll('button[data-act]').forEach((b) =>
    b.addEventListener('click', (e) => {
      const tr = e.currentTarget.closest('tr');
      const id = tr.dataset.id;
      const pedido = state.pedidos.find((p) => p.id === id);
      if (!pedido) return;
      if (b.dataset.act === 'view') openDetail(pedido);
      else handleNext(pedido, b);
    })
  );

  renderPager();
}

function statusBadge(status) {
  const cls = `vv-status vv-status--${status}`;
  return `<span class="${cls}">${VV.escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function nextLabel(current) {
  const i = STATUS_FLOW.indexOf(current);
  if (i < 0 || current === 'concluido' || current === 'cancelado') return 'Status';
  const next = STATUS_FLOW[i + 1];
  return next === 'em_andamento' ? 'Iniciar' :
         next === 'concluido'    ? 'Concluir' :
         'Avançar';
}

/* ---------- Paginação ------------------------------------------------- */
function renderPager() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  const current = Math.floor(state.offset / state.limit) + 1;
  $('pager').hidden = state.total <= state.limit;
  $('pgInfo').textContent = `Página ${current} de ${totalPages}`;
  $('pgPrev').disabled = current <= 1;
  $('pgNext').disabled = current >= totalPages;
}

$('pgPrev').addEventListener('click', () => {
  if (state.offset === 0) return;
  state.offset = Math.max(0, state.offset - state.limit);
  load();
});
$('pgNext').addEventListener('click', () => {
  if (state.offset + state.limit >= state.total) return;
  state.offset += state.limit;
  load();
});

/* ---------- Filtros --------------------------------------------------- */
$('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    state.offset = 0;
    load();
  }, 300);
});
$('statusFilter').addEventListener('change', (e) => {
  state.status = e.target.value;
  state.offset = 0;
  load();
});

/* ---------- Detalhe do pedido ----------------------------------------- */
function openDetail(p) {
  const rows = (p.itens || []).map((i) => `
    <tr>
      <td><span class="t-name">${VV.escapeHtml(i.nome || '—')}</span>
          <span class="t-id">${VV.escapeHtml(i.id || '')}${i.size ? ' · ' + VV.escapeHtml(String(i.size)) : ''}</span></td>
      <td>${VV.escapeHtml(i.marca || '')}</td>
      <td class="num">${i.qty || 0}</td>
      <td class="num">${brl(i.preco)}</td>
      <td class="num">${brl(Number(i.preco || 0) * Number(i.qty || 0))}</td>
    </tr>`).join('');

  $('detailTitle').textContent = `Pedido ${shortId(p.id)}`;
  $('detailBody').innerHTML = `
    <div class="pe-row">
      <div class="pe-field">
        <label>Cliente</label>
        <div>${VV.escapeHtml(p.user_nome || '—')}</div>
        <small class="pe-hint">${VV.escapeHtml(p.user_email || '')}</small>
      </div>
      <div class="pe-field">
        <label>Status</label>
        <div>${statusBadge(p.status)}</div>
        <small class="pe-hint">Recebido em ${fmtDate(p.created_at)}</small>
      </div>
    </div>

    <div class="pe-field">
      <label>Itens</label>
      <div class="table-scroll">
        <table class="dash-table pe-table">
          <thead><tr><th>Produto</th><th>Marca</th><th class="num">Qtd</th><th class="num">Preço</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="pe-field">
      <label>Atualizar status</label>
      <div class="vv-status-actions">
        ${STATUS_FLOW.map((s) =>
          `<button type="button" class="dash-btn ${s === p.status ? 'solid' : 'ghost dark'}" data-set="${s}">${STATUS_LABELS[s]}</button>`
        ).join('')}
      </div>
    </div>

    <footer class="pe-form-foot">
      <div></div>
      <div><strong>Total ${brl(p.total)}</strong></div>
    </footer>
  `;

  $('detailBody').querySelectorAll('button[data-set]').forEach((b) =>
    b.addEventListener('click', () => updateStatus(p, b.dataset.set, b))
  );

  openOverlay('detailOverlay');
}

async function updateStatus(pedido, status, btn) {
  if (status === pedido.status) {
    VV.toast('Status já está em "' + STATUS_LABELS[status] + '".', { kind: 'info' });
    return;
  }
  VV.setBusy(btn, true, 'Salvando…');
  try {
    const res = await authFetch(`/api/admin/orders/${pedido.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      VV.toast(data.message || 'Erro ao atualizar status.', { kind: 'error' });
      return;
    }
    VV.toast(`Status alterado para "${STATUS_LABELS[status]}".`, { kind: 'success' });
    closeOverlay('detailOverlay');
    await load();
  } catch {
    VV.toast('Falha na conexão.', { kind: 'error' });
  } finally {
    VV.setBusy(btn, false);
  }
}

async function handleNext(pedido, btn) {
  const i = STATUS_FLOW.indexOf(pedido.status);
  if (i < 0 || pedido.status === 'concluido' || pedido.status === 'cancelado') {
    return openDetail(pedido);
  }
  const next = STATUS_FLOW[i + 1];
  await updateStatus(pedido, next, btn);
}

/* ---------- Overlay --------------------------------------------------- */
function openOverlay(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeOverlay(id) {
  $(id).hidden = true;
  document.body.style.overflow = '';
}

$('detailClose').addEventListener('click', () => closeOverlay('detailOverlay'));
$('detailOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'detailOverlay') closeOverlay('detailOverlay');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlay('detailOverlay');
});

/* ---------- Ações globais --------------------------------------------- */
$('btnLogout').addEventListener('click', () => VV.logout());
$('btnDenyLogout').addEventListener('click', () => VV.logout());
$('btnRetry').addEventListener('click', load);
$('btnRefresh').addEventListener('click', (e) => {
  e.currentTarget.classList.add('is-spin');
  load().finally(() =>
    setTimeout(() => e.currentTarget.classList.remove('is-spin'), 500)
  );
});

/* ---------- Boot ------------------------------------------------------ */
if (VV.guard({ requireAdmin: true })) load();
