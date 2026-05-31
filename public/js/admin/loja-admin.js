/* ============================================================================
   Villa Vip Country Store — Gestão da Loja Física
   3 abas: Loja · Estoque · Vendas Presenciais. Vanilla JS. Sync Services.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const brl = VV.brl;
const authFetch = VV.authFetch;
const DIAS = [
  ['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'],
  ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado'], ['dom', 'Domingo'],
];
const PAG_LABELS = {
  dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito',
  debito: 'Débito', crediario: 'Crediário', outro: 'Outro',
};

const state = {
  lojas: [],
  lojaAtual: null,
  imagemFachada: null,
  horario: {},
  estoque: { items: [], total: 0, limit: 50, offset: 0, q: '', low: false },
  vendas:  { items: [], total: 0, limit: 20, offset: 0, pagamento: '' },
};
let estoqueTimer;
let buscaProdTimer;

/* ---------- State helpers --------------------------------------------- */
function setState(s) {
  $('loadingState').hidden = s !== 'loading';
  $('errorState').hidden   = s !== 'error';
  $('denyState').hidden    = s !== 'deny';
  $('pageContent').hidden  = s !== 'ready';
  $('dashMain').setAttribute('aria-busy', s === 'loading' ? 'true' : 'false');
}
function showError(msg) {
  $('errorMsg').textContent = msg;
  setState('error');
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' · ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ---------- Boot ------------------------------------------------------ */
async function init() {
  setState('loading');
  try {
    const res = await authFetch('/api/admin/stores', {
      onForbidden: () => setState('deny'),
    });
    if (res.status === 403) return;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.lojas = data.lojas;
    if (!state.lojas.length) { showError('Nenhuma loja cadastrada.'); return; }

    populateStoreSelect();
    state.lojaAtual = state.lojas[0];
    selectStore(state.lojaAtual.id);
    setState('ready');
  } catch (err) {
    if (err?.message === 'Sessão expirada') return;
    showError('Não foi possível carregar (' + err.message + ').');
  }
}

function populateStoreSelect() {
  $('storeSelect').innerHTML = state.lojas
    .map((l) => `<option value="${l.id}">${VV.escapeHtml(l.nome)} — ${VV.escapeHtml(l.cidade)}/${l.uf}</option>`)
    .join('');
}

async function selectStore(id) {
  state.lojaAtual = state.lojas.find((l) => l.id === id);
  if (!state.lojaAtual) return;
  $('lojaTitulo').textContent = state.lojaAtual.nome;
  $('lojaSubtitulo').textContent = `${state.lojaAtual.enderecoLinha1} · ${state.lojaAtual.cidade}/${state.lojaAtual.uf}`;
  $('stamp').textContent = state.lojaAtual.nome;
  fillForm(state.lojaAtual);
  state.estoque.offset = 0;
  state.vendas.offset  = 0;
  await Promise.all([loadEstoque(), loadVendas()]);
}

$('storeSelect').addEventListener('change', (e) => selectStore(e.target.value));

/* ---------- Tabs ------------------------------------------------------ */
$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.vv-tab');
  if (!btn) return;
  document.querySelectorAll('.vv-tab').forEach((t) => t.classList.remove('is-active'));
  btn.classList.add('is-active');
  const tab = btn.dataset.tab;
  $('tabLoja').hidden    = tab !== 'loja';
  $('tabEstoque').hidden = tab !== 'estoque';
  $('tabVendas').hidden  = tab !== 'vendas';
});

/* ========================================================================
   ABA LOJA — editor de cadastro + horário + foto
   ====================================================================== */
function fillForm(loja) {
  $('lNome').value      = loja.nome || '';
  $('lTelefone').value  = loja.telefone || '';
  $('lEndereco').value  = loja.enderecoLinha1 || '';
  $('lCep').value       = loja.cep || '';
  $('lCidade').value    = loja.cidade || '';
  $('lUf').value        = loja.uf || '';
  $('lWhatsapp').value  = loja.whatsapp || '';
  $('lEmail').value     = loja.email || '';
  $('lLat').value       = loja.lat ?? '';
  $('lLng').value       = loja.lng ?? '';
  $('lMapsUrl').value   = loja.mapsUrl || '';
  setFachada(loja.fotoFachada || null);
  state.horario = JSON.parse(JSON.stringify(loja.horario || {}));
  renderHours();
}

function setFachada(url) {
  state.imagemFachada = url || null;
  $('lImgPreviewWrap').hidden = !url;
  $('lImgDrop').hidden = !!url;
  if (url) $('lImgPreview').src = url;
  else { $('lImagem').value = ''; }
  $('lImgStatus').hidden = true;
}
function fachadaStatus(text, kind) {
  const el = $('lImgStatus');
  el.className = 'pe-img-status ' + (kind || 'info');
  el.textContent = text;
  el.hidden = false;
}

async function downscaleImage(file, { maxSide = 1600, quality = 0.85 } = {}) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  if (file.size <= 600 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) { bitmap.close?.(); return file; }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'fachada';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch { return file; }
}

$('lImagem').addEventListener('change', async () => {
  const original = $('lImagem').files[0];
  if (!original) return;
  fachadaStatus('Otimizando…', 'info');
  const file = await downscaleImage(original);
  fachadaStatus('Enviando…', 'info');
  const form = new FormData();
  form.append('imagem', file);
  try {
    const res = await authFetch('/api/admin/stores/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { fachadaStatus(data.message || 'Erro no upload.', 'error'); return; }
    setFachada(data.url);
    fachadaStatus('Foto carregada.', 'ok');
  } catch { fachadaStatus('Falha na conexão.', 'error'); }
});
$('lImgRemove').addEventListener('click', () => setFachada(null));
$('lImgDrop').addEventListener('dragover', (e) => { e.preventDefault(); $('lImgDrop').classList.add('drag-over'); });
$('lImgDrop').addEventListener('dragleave', () => $('lImgDrop').classList.remove('drag-over'));
$('lImgDrop').addEventListener('drop', (e) => {
  e.preventDefault();
  $('lImgDrop').classList.remove('drag-over');
  const f = e.dataTransfer?.files[0];
  if (f) { const dt = new DataTransfer(); dt.items.add(f); $('lImagem').files = dt.files; $('lImagem').dispatchEvent(new Event('change')); }
});

/* --- Horário editor --- */
function renderHours() {
  $('hoursEditor').innerHTML = DIAS.map(([key, label]) => {
    const faixas = state.horario[key] || [];
    const linhas = faixas.map((f, idx) => `
      <div class="vv-hour-row">
        <input type="time" value="${f[0]}" data-day="${key}" data-idx="${idx}" data-side="from">
        <span>às</span>
        <input type="time" value="${f[1]}" data-day="${key}" data-idx="${idx}" data-side="to">
        <button type="button" class="dash-btn ghost dark" data-act="rm" data-day="${key}" data-idx="${idx}" aria-label="Remover faixa">×</button>
      </div>
    `).join('');
    return `
      <div class="vv-hour-day">
        <div class="vv-hour-h">
          <strong>${label}</strong>
          ${faixas.length ? '' : '<small>Fechado</small>'}
        </div>
        ${linhas}
        <button type="button" class="dash-btn ghost dark" data-act="add" data-day="${key}">+ faixa</button>
      </div>`;
  }).join('');
}

$('hoursEditor').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const day = btn.dataset.day;
  if (btn.dataset.act === 'add') {
    state.horario[day] = state.horario[day] || [];
    state.horario[day].push(['09:00', '18:00']);
  } else if (btn.dataset.act === 'rm') {
    const idx = +btn.dataset.idx;
    state.horario[day].splice(idx, 1);
    if (!state.horario[day].length) state.horario[day] = [];
  }
  renderHours();
});
$('hoursEditor').addEventListener('change', (e) => {
  const inp = e.target.closest('input[data-day]');
  if (!inp) return;
  const day = inp.dataset.day;
  const idx = +inp.dataset.idx;
  const side = inp.dataset.side === 'from' ? 0 : 1;
  state.horario[day][idx][side] = inp.value;
});

/* --- Submit do form da loja --- */
$('lojaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('lojaSave');
  VV.setBusy(btn, true, 'Salvando…');
  $('lojaMsg').hidden = true;

  const payload = {
    nome:           $('lNome').value.trim(),
    telefone:       $('lTelefone').value.trim() || null,
    enderecoLinha1: $('lEndereco').value.trim(),
    cep:            $('lCep').value.trim() || null,
    cidade:         $('lCidade').value.trim(),
    uf:             $('lUf').value.trim().toUpperCase().slice(0, 2),
    whatsapp:       $('lWhatsapp').value.trim() || null,
    email:          $('lEmail').value.trim() || null,
    lat:            $('lLat').value ? Number($('lLat').value) : null,
    lng:            $('lLng').value ? Number($('lLng').value) : null,
    mapsUrl:        $('lMapsUrl').value.trim() || null,
    horario:        state.horario,
    fotoFachada:    state.imagemFachada,
  };

  try {
    const res = await authFetch(`/api/admin/stores/${state.lojaAtual.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      $('lojaMsg').textContent = data.message || 'Erro ao salvar.';
      $('lojaMsg').className = 'pe-form-msg error';
      $('lojaMsg').hidden = false;
      return;
    }
    Object.assign(state.lojaAtual, data);
    const idx = state.lojas.findIndex((l) => l.id === data.id);
    if (idx >= 0) state.lojas[idx] = data;
    VV.toast('Loja atualizada.', { kind: 'success' });
  } catch {
    VV.toast('Falha na conexão.', { kind: 'error' });
  } finally {
    VV.setBusy(btn, false);
  }
});

/* ========================================================================
   ABA ESTOQUE
   ====================================================================== */
async function loadEstoque() {
  if (!state.lojaAtual) return;
  const params = new URLSearchParams({
    store_id: state.lojaAtual.id,
    limit: state.estoque.limit,
    offset: state.estoque.offset,
  });
  if (state.estoque.q)   params.set('q', state.estoque.q);
  if (state.estoque.low) params.set('low_only', '1');

  try {
    const res = await authFetch('/api/admin/estoque?' + params);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.estoque.items = data.items;
    state.estoque.total = data.total;
    renderEstoque();
  } catch (err) {
    VV.toast('Erro ao carregar estoque.', { kind: 'error' });
  }
}

function renderEstoque() {
  const rows = state.estoque.items;
  const current = Math.floor(state.estoque.offset / state.estoque.limit) + 1;
  const pages = Math.max(1, Math.ceil(state.estoque.total / state.estoque.limit));
  $('estoqueCount').textContent = `${state.estoque.total} SKU(s) · página ${current} de ${pages}`;
  $('estoqueEmpty').hidden = rows.length > 0;

  $('estoqueBody').innerHTML = rows.map((r) => {
    const baixo = r.quantidade <= r.minimo;
    return `
      <tr data-pid="${VV.escapeHtml(r.productId)}">
        <td><code class="pe-ref">${VV.escapeHtml(r.productId)}</code></td>
        <td>
          <span class="t-name">${VV.escapeHtml(r.produto?.nome || '—')}</span>
          <span class="t-id">${VV.escapeHtml(r.produto?.marca || '')}</span>
        </td>
        <td class="num"><input type="number" class="vv-inline-input" data-field="q" value="${r.quantidade}" min="0" step="1"></td>
        <td class="num"><input type="number" class="vv-inline-input" data-field="m" value="${r.minimo}" min="0" step="1"></td>
        <td>${r.atualizadoEm ? fmtDate(r.atualizadoEm) : '—'}</td>
        <td class="pe-actions">
          ${baixo ? '<span class="vv-status vv-status--cancelado">Ruptura</span>' : ''}
          <button class="pe-act" data-act="save">Salvar</button>
        </td>
      </tr>`;
  }).join('');

  $('estoqueBody').querySelectorAll('button[data-act="save"]').forEach((b) =>
    b.addEventListener('click', () => salvarLinhaEstoque(b.closest('tr')))
  );
  renderEstoquePager();
}
function renderEstoquePager() {
  const current = Math.floor(state.estoque.offset / state.estoque.limit) + 1;
  const pages = Math.max(1, Math.ceil(state.estoque.total / state.estoque.limit));
  $('estoquePager').hidden = state.estoque.total <= state.estoque.limit;
  $('estoquePageInfo').textContent = `Página ${current} de ${pages}`;
  $('estoquePrev').disabled = current <= 1;
  $('estoqueNext').disabled = current >= pages;
}
async function salvarLinhaEstoque(tr) {
  const productId = tr.dataset.pid;
  const q = +tr.querySelector('[data-field="q"]').value;
  const m = +tr.querySelector('[data-field="m"]').value;
  const btn = tr.querySelector('button[data-act="save"]');
  VV.setBusy(btn, true, '…');
  try {
    const res = await authFetch(`/api/admin/estoque/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ store_id: state.lojaAtual.id, quantidade: q, minimo: m }),
    });
    if (!res.ok) { VV.toast('Erro ao salvar.', { kind: 'error' }); return; }
    VV.toast('Estoque atualizado.', { kind: 'success' });
    await loadEstoque();
  } catch { VV.toast('Falha na conexão.', { kind: 'error' }); }
  finally { VV.setBusy(btn, false); }
}

$('estoqueQ').addEventListener('input', (e) => {
  clearTimeout(estoqueTimer);
  estoqueTimer = setTimeout(() => {
    state.estoque.q = e.target.value.trim();
    state.estoque.offset = 0;
    loadEstoque();
  }, 300);
});
$('estoqueLow').addEventListener('change', (e) => {
  state.estoque.low = e.target.checked;
  state.estoque.offset = 0;
  loadEstoque();
});
$('estoquePrev').addEventListener('click', () => {
  if (state.estoque.offset === 0) return;
  state.estoque.offset = Math.max(0, state.estoque.offset - state.estoque.limit);
  loadEstoque();
});
$('estoqueNext').addEventListener('click', () => {
  if (state.estoque.offset + state.estoque.limit >= state.estoque.total) return;
  state.estoque.offset += state.estoque.limit;
  loadEstoque();
});

/* ========================================================================
   ABA VENDAS PRESENCIAIS
   ====================================================================== */
async function loadVendas() {
  if (!state.lojaAtual) return;
  const params = new URLSearchParams({
    store_id: state.lojaAtual.id,
    limit: state.vendas.limit,
    offset: state.vendas.offset,
  });
  if (state.vendas.pagamento) params.set('pagamento', state.vendas.pagamento);

  try {
    const res = await authFetch('/api/admin/vendas-presenciais?' + params);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.vendas.items = data.items;
    state.vendas.total = data.total;
    renderVendas();
  } catch {
    VV.toast('Erro ao carregar vendas.', { kind: 'error' });
  }
}

function renderVendas() {
  const rows = state.vendas.items;
  const current = Math.floor(state.vendas.offset / state.vendas.limit) + 1;
  const pages = Math.max(1, Math.ceil(state.vendas.total / state.vendas.limit));
  $('vendasCount').textContent = `${state.vendas.total} venda(s) · página ${current} de ${pages}`;
  $('vendasEmpty').hidden = rows.length > 0;

  $('vendasBody').innerHTML = rows.map((v) => {
    const itensResumo = (v.itens || []).map((i) => `${i.qty}× ${i.nome}${i.size ? ' (' + i.size + ')' : ''}`).join(' · ');
    return `
      <tr>
        <td>${fmtDate(v.createdAt)}</td>
        <td>${VV.escapeHtml(v.vendedorNome || '—')}</td>
        <td>${VV.escapeHtml(itensResumo)}</td>
        <td>${VV.escapeHtml(v.clienteNome || '—')}</td>
        <td><span class="vv-status vv-status--enviado">${VV.escapeHtml(PAG_LABELS[v.pagamento] || v.pagamento)}</span></td>
        <td class="num">${brl(v.total)}</td>
      </tr>`;
  }).join('');
  renderVendasPager();
}
function renderVendasPager() {
  const current = Math.floor(state.vendas.offset / state.vendas.limit) + 1;
  const pages = Math.max(1, Math.ceil(state.vendas.total / state.vendas.limit));
  $('vendasPager').hidden = state.vendas.total <= state.vendas.limit;
  $('vendasPageInfo').textContent = `Página ${current} de ${pages}`;
  $('vendasPrev').disabled = current <= 1;
  $('vendasNext').disabled = current >= pages;
}
$('vendasFiltroPag').addEventListener('change', (e) => {
  state.vendas.pagamento = e.target.value;
  state.vendas.offset = 0;
  loadVendas();
});
$('vendasPrev').addEventListener('click', () => {
  if (state.vendas.offset === 0) return;
  state.vendas.offset = Math.max(0, state.vendas.offset - state.vendas.limit);
  loadVendas();
});
$('vendasNext').addEventListener('click', () => {
  if (state.vendas.offset + state.vendas.limit >= state.vendas.total) return;
  state.vendas.offset += state.vendas.limit;
  loadVendas();
});

/* --- Modal "Nova venda" --- */
let vendaItens = [];

$('btnNovaVenda').addEventListener('click', () => {
  vendaItens = [];
  $('vendaDesconto').value = '0';
  $('vendaPagamento').value = 'dinheiro';
  $('vendaCliente').value = '';
  $('vendaTelefone').value = '';
  $('vendaObs').value = '';
  $('vendaBuscaInput').value = '';
  $('vendaAutocomplete').hidden = true;
  $('vendaMsg').hidden = true;
  renderVendaItens();
  $('vendaOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  $('vendaBuscaInput').focus();
});
$('vendaClose').addEventListener('click', closeVenda);
$('vendaOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'vendaOverlay') closeVenda();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('vendaOverlay').hidden) closeVenda();
});
function closeVenda() {
  $('vendaOverlay').hidden = true;
  document.body.style.overflow = '';
}

$('vendaBuscaInput').addEventListener('input', (e) => {
  clearTimeout(buscaProdTimer);
  const term = e.target.value.trim();
  if (term.length < 2) { $('vendaAutocomplete').hidden = true; return; }
  buscaProdTimer = setTimeout(() => buscarProdutos(term), 250);
});
async function buscarProdutos(q) {
  try {
    const res = await fetch('/api/products?q=' + encodeURIComponent(q));
    const data = await res.json();
    const prods = (data.produtos || []).slice(0, 8);
    if (!prods.length) {
      $('vendaAutocomplete').innerHTML = '<div class="vv-ac-empty">Nada encontrado</div>';
    } else {
      $('vendaAutocomplete').innerHTML = prods.map((p) => `
        <button type="button" class="vv-ac-item" data-id="${VV.escapeHtml(p.id)}">
          <span class="vv-ac-name">${VV.escapeHtml(p.nome)}</span>
          <span class="vv-ac-meta">${VV.escapeHtml(p.marca)} · ${VV.escapeHtml(p.id)} · ${brl(p.preco)}</span>
        </button>`).join('');
      $('vendaAutocomplete').querySelectorAll('.vv-ac-item').forEach((b) =>
        b.addEventListener('click', () => {
          const p = prods.find((x) => x.id === b.dataset.id);
          if (p) addVendaItem(p);
        })
      );
    }
    $('vendaAutocomplete').hidden = false;
  } catch {
    $('vendaAutocomplete').hidden = true;
  }
}
function addVendaItem(prod) {
  const sizes = prod.tamanhos || [];
  vendaItens.push({
    productId: prod.id,
    nome: prod.nome,
    sizes,
    size: sizes[0] || null,
    qty: 1,
    precoUnit: Number(prod.preco || 0),
  });
  $('vendaBuscaInput').value = '';
  $('vendaAutocomplete').hidden = true;
  renderVendaItens();
}
function renderVendaItens() {
  const empty = vendaItens.length === 0;
  $('vendaItensTable').hidden = empty;
  $('vendaItensEmpty').hidden = !empty;
  if (empty) { updateTotais(); return; }

  $('vendaItensBody').innerHTML = vendaItens.map((it, idx) => {
    const sizeCell = it.sizes && it.sizes.length
      ? `<select data-i="${idx}" data-f="size">
           ${it.sizes.map((s) => `<option value="${VV.escapeHtml(s)}" ${s === it.size ? 'selected' : ''}>${VV.escapeHtml(s)}</option>`).join('')}
         </select>`
      : '<small class="pe-hint">—</small>';
    const sub = it.qty * it.precoUnit;
    return `
      <tr>
        <td>
          <span class="t-name">${VV.escapeHtml(it.nome)}</span>
          <span class="t-id">${VV.escapeHtml(it.productId)}</span>
        </td>
        <td>${sizeCell}</td>
        <td class="num"><input type="number" class="vv-inline-input" data-i="${idx}" data-f="qty" value="${it.qty}" min="1" step="1"></td>
        <td class="num"><input type="number" class="vv-inline-input" data-i="${idx}" data-f="preco" value="${it.precoUnit}" min="0" step="0.01"></td>
        <td class="num">${brl(sub)}</td>
        <td class="pe-actions">
          <button class="pe-act del" type="button" data-i="${idx}" aria-label="Remover">×</button>
        </td>
      </tr>`;
  }).join('');

  $('vendaItensBody').querySelectorAll('input,select').forEach((el) =>
    el.addEventListener('input', (e) => {
      const i = +e.target.dataset.i;
      const f = e.target.dataset.f;
      if (f === 'qty')   vendaItens[i].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      if (f === 'preco') vendaItens[i].precoUnit = Math.max(0, Number(e.target.value) || 0);
      if (f === 'size')  vendaItens[i].size = e.target.value;
      renderVendaItens();
    })
  );
  $('vendaItensBody').querySelectorAll('button[data-i]').forEach((b) =>
    b.addEventListener('click', () => {
      vendaItens.splice(+b.dataset.i, 1);
      renderVendaItens();
    })
  );
  updateTotais();
}
function updateTotais() {
  const sub = vendaItens.reduce((s, i) => s + i.qty * i.precoUnit, 0);
  const desc = Math.max(0, Number($('vendaDesconto').value) || 0);
  const total = Math.max(0, sub - desc);
  $('vendaSubtotal').textContent = brl(sub);
  $('vendaTotal').textContent    = brl(total);
}
$('vendaDesconto').addEventListener('input', updateTotais);

$('vendaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('vendaMsg').hidden = true;
  if (!vendaItens.length) {
    $('vendaMsg').textContent = 'Adicione ao menos um item.';
    $('vendaMsg').className = 'pe-form-msg error';
    $('vendaMsg').hidden = false;
    return;
  }
  const payload = {
    storeId: state.lojaAtual.id,
    itens: vendaItens.map((i) => ({
      productId: i.productId, nome: i.nome, size: i.size,
      qty: i.qty, precoUnit: i.precoUnit,
    })),
    desconto: Number($('vendaDesconto').value) || 0,
    pagamento: $('vendaPagamento').value,
    clienteNome: $('vendaCliente').value.trim() || null,
    clienteTelefone: $('vendaTelefone').value.trim() || null,
    observacao: $('vendaObs').value.trim() || null,
  };
  const btn = $('vendaSubmit');
  VV.setBusy(btn, true, 'Registrando…');
  try {
    const res = await authFetch('/api/admin/vendas-presenciais', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      $('vendaMsg').textContent = data.message || 'Erro ao registrar.';
      $('vendaMsg').className = 'pe-form-msg error';
      $('vendaMsg').hidden = false;
      return;
    }
    VV.toast('Venda registrada · estoque atualizado.', { kind: 'success' });
    closeVenda();
    await Promise.all([loadVendas(), loadEstoque()]);
  } catch {
    VV.toast('Falha na conexão.', { kind: 'error' });
  } finally {
    VV.setBusy(btn, false);
  }
});

$('btnExportRuptura').addEventListener('click', () => {
  if (!state.lojaAtual) return;
  VV.downloadFile('/api/admin/reports/ruptura.csv?store_id=' + encodeURIComponent(state.lojaAtual.id));
});
$('btnExportVendas').addEventListener('click', () => {
  if (!state.lojaAtual) return;
  const params = new URLSearchParams({ store_id: state.lojaAtual.id });
  if (state.vendas.pagamento) params.set('pagamento', state.vendas.pagamento);
  VV.downloadFile('/api/admin/reports/vendas-presenciais.csv?' + params);
});

/* ---------- Globals --------------------------------------------------- */
$('btnLogout').addEventListener('click', () => VV.logout());
$('btnDenyLogout').addEventListener('click', () => VV.logout());
$('btnRetry').addEventListener('click', init);

/* ---------- Boot ------------------------------------------------------ */
if (VV.guard({ requireAdmin: true })) init();
