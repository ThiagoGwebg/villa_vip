/* Villa Vip — Auditoria (admin) · vanilla JS · Sync Services */

const $ = (id) => document.getElementById(id);
const ACTION_LABELS = {
  'product.create':         'Criou produto',
  'product.update':         'Atualizou produto',
  'product.delete':         'Excluiu produto',
  'product.image_upload':   'Subiu imagem',
  'order.status_change':    'Mudou status do pedido',
  'store.update':           'Atualizou loja',
  'estoque.update':         'Atualizou estoque',
  'venda_presencial.create':'Registrou venda presencial',
};
const TARGET_LABELS = {
  product: 'Produto', product_image: 'Imagem', order: 'Pedido',
  store: 'Loja', estoque: 'Estoque', venda_presencial: 'Venda presencial',
};

const state = { items: [], total: 0, limit: 30, offset: 0, actor: '', target: '' };
let searchTimer;

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

async function load() {
  setState('loading');
  const params = new URLSearchParams({ limit: state.limit, offset: state.offset });
  if (state.actor)  params.set('actor', state.actor);
  if (state.target) params.set('target_type', state.target);
  try {
    let denied = false;
    const res = await VV.authFetch('/api/admin/audit?' + params, { onForbidden: () => (denied = true) });
    if (denied) return setState('deny');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.items = data.items;
    state.total = data.total;
    render();
    setState('ready');
    $('stamp').textContent = `${state.total} evento(s) registrado(s)`;
  } catch (err) {
    if (err?.message === 'Sessão expirada') return;
    $('errorMsg').textContent = 'Não foi possível carregar (' + err.message + ').';
    setState('error');
  }
}

function render() {
  const rows = state.items;
  const cur = Math.floor(state.offset / state.limit) + 1;
  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $('auditCount').textContent = `${state.total} evento(s) · página ${cur} de ${pages}`;
  $('emptyMsg').hidden = rows.length > 0;

  $('auditBody').innerHTML = rows.map((r, i) => `
    <tr>
      <td>${fmtDate(r.created_at)}</td>
      <td>
        <span class="t-name">${VV.escapeHtml(r.actor_email || '—')}</span>
      </td>
      <td>${VV.escapeHtml(ACTION_LABELS[r.action] || r.action)}</td>
      <td>
        <span class="pe-badge">${VV.escapeHtml(TARGET_LABELS[r.target_type] || r.target_type)}</span>
        ${r.target_id ? `<span class="t-id">${VV.escapeHtml(r.target_id)}</span>` : ''}
      </td>
      <td>
        <button class="pe-act" data-i="${i}">Ver diff</button>
      </td>
    </tr>
  `).join('');

  $('auditBody').querySelectorAll('button[data-i]').forEach((b) =>
    b.addEventListener('click', () => openDiff(rows[+b.dataset.i]))
  );

  $('pager').hidden = state.total <= state.limit;
  $('pgInfo').textContent = `Página ${cur} de ${pages}`;
  $('pgPrev').disabled = cur <= 1;
  $('pgNext').disabled = cur >= pages;
}

function openDiff(ev) {
  $('diffTitle').textContent = ACTION_LABELS[ev.action] || ev.action;
  const pretty = (v) => v == null ? '—' : JSON.stringify(v, null, 2);
  $('diffBody').innerHTML = `
    <div class="pe-row">
      <div class="pe-field"><label>Quando</label><div>${fmtDate(ev.created_at)}</div></div>
      <div class="pe-field"><label>Quem</label><div>${VV.escapeHtml(ev.actor_email || '—')}</div></div>
    </div>
    <div class="pe-row">
      <div class="pe-field"><label>Alvo</label><div>${VV.escapeHtml(TARGET_LABELS[ev.target_type] || ev.target_type)} ${ev.target_id ? '· <code>'+VV.escapeHtml(ev.target_id)+'</code>' : ''}</div></div>
      <div class="pe-field"><label>IP</label><div>${VV.escapeHtml(ev.ip || '—')}</div></div>
    </div>
    <div class="pe-field">
      <label>Antes</label>
      <pre class="vv-diff">${VV.escapeHtml(pretty(ev.diff?.before))}</pre>
    </div>
    <div class="pe-field">
      <label>Depois</label>
      <pre class="vv-diff">${VV.escapeHtml(pretty(ev.diff?.after))}</pre>
    </div>
    <div class="pe-field">
      <label>User agent</label>
      <small class="pe-hint">${VV.escapeHtml(ev.user_agent || '—')}</small>
    </div>
  `;
  $('diffOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

$('diffClose').addEventListener('click', () => closeDiff());
$('diffOverlay').addEventListener('click', (e) => { if (e.target.id === 'diffOverlay') closeDiff(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('diffOverlay').hidden) closeDiff(); });
function closeDiff() { $('diffOverlay').hidden = true; document.body.style.overflow = ''; }

$('actorFilter').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.actor = e.target.value.trim();
    state.offset = 0;
    load();
  }, 300);
});
$('targetFilter').addEventListener('change', (e) => {
  state.target = e.target.value;
  state.offset = 0;
  load();
});
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

$('btnLogout').addEventListener('click', () => VV.logout());
$('btnDenyLogout').addEventListener('click', () => VV.logout());
$('btnRetry').addEventListener('click', load);

if (VV.guard({ requireAdmin: true })) load();
