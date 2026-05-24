/* ============================================================================
   Villa Vip Country Store — Sidebar compartilhada do admin
   Injeta a navegação lateral em qualquer tela /admin/*. Não substitui o
   shared.js — depende dele (VV.user, VV.logout). Sync Services.
   ========================================================================== */
(function (global) {
  "use strict";

  if (!global.VV) {
    console.error('[admin-shell] shared.js precisa ser carregado antes.');
    return;
  }

  const ICONS = {
    dashboard: '<path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/>',
    produtos:  '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    pedidos:   '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 4v4"/><path d="M16 4v4"/>',
    loja:      '<path d="M3 9 12 2l9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
    catalogo:  '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    sair:      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  };

  const GROUPS = [
    {
      title: 'Visão',
      items: [
        { key: 'dashboard', label: 'Dashboard', href: '/admin' },
      ],
    },
    {
      title: 'Operação',
      items: [
        { key: 'pedidos',  label: 'Pedidos',  href: '/admin/pedidos' },
        { key: 'produtos', label: 'Produtos', href: '/admin/produtos' },
      ],
    },
    {
      title: 'Site',
      items: [
        { key: 'catalogo', label: 'Ver catálogo', href: '/', external: true },
      ],
    },
  ];

  function svg(d) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  function buildMarkup(active) {
    const u = VV.user();
    const nome = (u?.nome || 'Admin').trim();
    const initial = nome.charAt(0).toUpperCase() || 'V';

    const groupsHtml = GROUPS.map((g) => `
      <div class="vv-side-group">
        <span class="vv-side-h">${g.title}</span>
        ${g.items.map((it) => `
          <a class="vv-side-item${it.key === active ? ' is-active' : ''}"
             href="${it.href}"${it.external ? ' target="_blank" rel="noopener"' : ''}
             data-key="${it.key}">
            ${svg(ICONS[it.key] || '')}
            <span>${VV.escapeHtml(it.label)}</span>
          </a>`).join('')}
      </div>`).join('');

    return `
      <aside class="vv-side" id="vv-side" data-open="false" aria-label="Navegação do admin">
        <div class="vv-side-brand">
          <svg class="vv-side-longhorn" viewBox="0 0 240 200" aria-hidden="true">
            <path fill="currentColor" d="M120 80C104 82 80 80 58 72C38 64 22 50 14 36C26 46 48 52 70 52C92 52 110 60 120 78C130 60 148 52 170 52C192 52 214 46 226 36C218 50 202 64 182 72C160 80 136 82 120 80Z"/>
            <path fill="currentColor" d="M78 84 L120 170 L162 84 L139 84 L120 126 L101 84 Z"/>
          </svg>
          <div>
            <strong>Villa Vip</strong>
            <small>Admin</small>
          </div>
        </div>

        <nav class="vv-side-nav">${groupsHtml}</nav>

        <div class="vv-side-foot">
          <div class="vv-side-user">
            <span class="vv-side-avatar">${VV.escapeHtml(initial)}</span>
            <div class="vv-side-uinfo">
              <strong>${VV.escapeHtml(nome)}</strong>
              <small>${VV.escapeHtml(u?.email || '')}</small>
            </div>
          </div>
          <button type="button" class="vv-side-logout" data-vv-logout title="Sair">
            ${svg(ICONS.sair)} <span>Sair</span>
          </button>
          <small class="vv-side-credit">Sync Services</small>
        </div>
      </aside>

      <button type="button" class="vv-side-toggle" id="vv-side-toggle" aria-label="Abrir menu">
        <span></span><span></span><span></span>
      </button>
      <div class="vv-side-backdrop" id="vv-side-backdrop" hidden></div>
    `;
  }

  function attachEvents() {
    const side = document.getElementById('vv-side');
    const toggle = document.getElementById('vv-side-toggle');
    const backdrop = document.getElementById('vv-side-backdrop');

    const setOpen = (open) => {
      side.dataset.open = open ? 'true' : 'false';
      backdrop.hidden = !open;
      document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle?.addEventListener('click', () => setOpen(side.dataset.open !== 'true'));
    backdrop?.addEventListener('click', () => setOpen(false));
    side?.addEventListener('click', (e) => {
      // Fecha drawer ao clicar em item de navegação (mobile)
      if (e.target.closest('.vv-side-item') && window.matchMedia('(max-width: 1080px)').matches) {
        setOpen(false);
      }
      if (e.target.closest('[data-vv-logout]')) {
        e.preventDefault();
        VV.logout();
      }
    });
  }

  VV.adminShell = {
    mount({ active = 'dashboard' } = {}) {
      const host = document.createElement('div');
      host.id = 'vv-side-host';
      host.innerHTML = buildMarkup(active);
      document.body.prepend(host);
      document.body.classList.add('vv-with-side');
      attachEvents();
    },
  };
})(window);
