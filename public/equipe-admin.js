/* Villa Vip — Equipe (gestão de admins) · vanilla JS · Sync Services */

const $ = (id) => document.getElementById(id);
const state = { admins: [], meEmail: '' };

function setState(s) {
  $('loadingState').hidden = s !== 'loading';
  $('errorState').hidden   = s !== 'error';
  $('denyState').hidden    = s !== 'deny';
  $('pageContent').hidden  = s !== 'ready';
  $('dashMain').setAttribute('aria-busy', s === 'loading' ? 'true' : 'false');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

async function load() {
  setState('loading');
  state.meEmail = (VV.user()?.email || '').toLowerCase();
  try {
    let denied = false;
    const res = await VV.authFetch('/api/admin/users', { onForbidden: () => (denied = true) });
    if (denied) return setState('deny');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.admins = data.admins;
    render();
    setState('ready');
    $('stamp').textContent = `${state.admins.length} admin(s)`;
  } catch (err) {
    if (err?.message === 'Sessão expirada') return;
    $('errorMsg').textContent = 'Não foi possível carregar (' + err.message + ').';
    setState('error');
  }
}

function render() {
  $('adminCount').textContent = `${state.admins.length} admin(s) ativo(s)`;
  $('emptyMsg').hidden = state.admins.length > 0;

  $('adminsBody').innerHTML = state.admins.map((a) => {
    const isMe = (a.email || '').toLowerCase() === state.meEmail;
    return `
      <tr data-email="${VV.escapeHtml(a.email)}">
        <td>
          <span class="t-name">${VV.escapeHtml(a.email)}</span>
          ${isMe ? '<span class="t-id">(você)</span>' : ''}
        </td>
        <td>${VV.escapeHtml(a.nome || '—')}</td>
        <td>${fmtDate(a.createdAt)}</td>
        <td class="pe-actions">
          <button class="pe-act del" type="button" ${isMe ? 'disabled title="Você não pode remover o próprio acesso"' : ''}>Remover</button>
        </td>
      </tr>`;
  }).join('');

  $('adminsBody').querySelectorAll('button.pe-act.del').forEach((b) =>
    b.addEventListener('click', () => revogar(b.closest('tr')))
  );
}

async function revogar(tr) {
  const email = tr.dataset.email;
  const ok = await VV.confirm({
    title: 'Remover admin',
    body: `Remover acesso de admin de "${email}"? A pessoa continua com a conta, mas perde o painel.`,
    confirmLabel: 'Remover',
    cancelLabel: 'Cancelar',
    danger: true,
  });
  if (!ok) return;
  const btn = tr.querySelector('button.pe-act.del');
  VV.setBusy(btn, true, '…');
  try {
    const res = await VV.authFetch('/api/admin/users/revoke', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      VV.toast(data.message || 'Erro ao remover.', { kind: 'error' });
      return;
    }
    VV.toast(`${email} não é mais admin.`, { kind: 'success' });
    await load();
  } catch {
    VV.toast('Falha na conexão.', { kind: 'error' });
  } finally {
    VV.setBusy(btn, false);
  }
}

$('promoteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('promoteMsg').hidden = true;
  const email = $('fEmail').value.trim();
  if (!email) return;

  const btn = $('promoteSubmit');
  VV.setBusy(btn, true, 'Promovendo…');
  try {
    const res = await VV.authFetch('/api/admin/users/promote', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      $('promoteMsg').textContent = data.message || 'Erro ao promover.';
      $('promoteMsg').className = 'pe-form-msg error';
      $('promoteMsg').hidden = false;
      return;
    }
    VV.toast(`${data.email} agora é admin.`, { kind: 'success' });
    $('fEmail').value = '';
    await load();
  } catch {
    VV.toast('Falha na conexão.', { kind: 'error' });
  } finally {
    VV.setBusy(btn, false);
  }
});

$('btnLogout').addEventListener('click', () => VV.logout());
$('btnDenyLogout').addEventListener('click', () => VV.logout());
$('btnRetry').addEventListener('click', load);

if (VV.guard({ requireAdmin: true })) load();
