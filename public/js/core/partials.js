/* ============================================================================
   Villa Vip Country Store — Partials compartilhados do admin
   Injeta o "chrome" repetido dos painéis (top-bar + blocos de estado) que antes
   estava duplicado em cada HTML. Depende do shared.js (VV.user, VV.escapeHtml)
   e é carregado antes do admin-shell.js. Mesmo padrão de injeção via JS.
   Sync Services.
   ========================================================================== */
(function (global) {
  "use strict";

  if (!global.VV) {
    console.error('[partials] shared.js precisa ser carregado antes.');
    return;
  }

  /* Ícones de linha (stroke) reutilizados nos botões da top-bar. */
  const ICONS = {
    longhorn:     '<path fill="currentColor" d="M120 80C104 82 80 80 58 72C38 64 22 50 14 36C26 46 48 52 70 52C92 52 110 60 120 78C130 60 148 52 170 52C192 52 214 46 226 36C218 50 202 64 182 72C160 80 136 82 120 80Z"/><path fill="currentColor" d="M78 84 L120 170 L162 84 L139 84 L120 126 L101 84 Z"/>',
    intelligence: '<path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/>',
    catalog:      '<path d="M3 9 12 2l9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
    products:     '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    refresh:      '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/>',
    plus:         '<path d="M12 5v14"/><path d="M5 12h14"/>',
    logout:       '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    alert:        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    lock:         '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  };

  /** SVG de linha (24x24) a partir de uma chave de ICONS. */
  function svg(key, cls) {
    return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[key] || ''}</svg>`;
  }

  /** Marca (longhorn + nome) que abre toda top-bar do admin. */
  function brand(subtitle) {
    return `
      <a class="dash-brand" href="/" title="Voltar ao catálogo">
        <svg class="dash-longhorn" viewBox="0 0 240 200" aria-hidden="true">${ICONS.longhorn}</svg>
        <span>
          <strong>Villa Vip</strong>
          <small>${VV.escapeHtml(subtitle || 'Admin')}</small>
        </span>
      </a>`;
  }

  /** Bloco de usuário + botão Sair — idêntico em todos os painéis. */
  function userMenu() {
    return `
      <div class="dash-user">
        <span class="dash-avatar" id="userInitial" aria-hidden="true">V</span>
        <span class="dash-uname" id="userName">—</span>
      </div>
      <button type="button" class="dash-btn solid" id="btnLogout" title="Encerrar sessão">
        ${svg('logout')}<span>Sair</span>
      </button>`;
  }

  /** Preenche nome/inicial do usuário logado na top-bar (substitui o greet inline). */
  function fillUser() {
    const u = VV.user();
    if (!u || !u.nome) return;
    const name = document.getElementById('userName');
    const initial = document.getElementById('userInitial');
    if (name) name.textContent = u.nome;
    if (initial) initial.textContent = u.nome.trim().charAt(0).toUpperCase() || 'V';
  }

  VV.partials = {
    ICONS,
    svg,

    /** Link de navegação no estilo `dash-btn ghost`. */
    actionLink(href, label, iconKey, opts = {}) {
      const attrs = opts.external ? ' target="_blank" rel="noopener"' : '';
      const title = opts.title ? ` title="${VV.escapeHtml(opts.title)}"` : '';
      return `<a class="dash-btn ghost" href="${href}"${attrs}${title}>${svg(iconKey)}<span>${VV.escapeHtml(label)}</span></a>`;
    },

    /** Botão de ação com `id` (ligado pelo script da página). */
    actionButton(id, label, iconKey, opts = {}) {
      const variant = opts.solid ? 'solid' : 'ghost';
      const title = opts.title ? ` title="${VV.escapeHtml(opts.title)}"` : '';
      return `<button type="button" class="dash-btn ${variant}" id="${id}"${title}>${svg(iconKey)}<span>${VV.escapeHtml(label)}</span></button>`;
    },

    /**
     * Injeta a top-bar do admin antes do <main class="dash-main">.
     * `actions` é um array de HTML (links/botões específicos da página) que
     * entra entre o "stamp" e o bloco de usuário.
     */
    adminTopbar({ subtitle = 'Admin', actions = [] } = {}) {
      const main = document.querySelector('main.dash-main');
      if (!main) {
        console.error('[partials] <main class="dash-main"> não encontrado.');
        return;
      }
      const actionsHtml = Array.isArray(actions) ? actions.join('\n') : String(actions || '');
      const html = `
        <header class="dash-top">
          <div class="dash-top-wrap">
            ${brand(subtitle)}
            <div class="dash-top-actions">
              <span class="dash-stamp" id="stamp" aria-live="polite">Carregando…</span>
              ${actionsHtml}
              ${userMenu()}
            </div>
          </div>
        </header>`;
      main.insertAdjacentHTML('beforebegin', html);
      fillUser();
    },

    /**
     * Injeta os três blocos de estado (loading / erro / acesso negado) como
     * primeiros filhos de #dashMain — idênticos em todos os painéis.
     */
    adminStates({ loadingText = 'Carregando…', errorText = 'Não foi possível carregar os dados.' } = {}) {
      const main = document.getElementById('dashMain');
      if (!main) {
        console.error('[partials] #dashMain não encontrado.');
        return;
      }
      const html = `
        <div class="dash-state" id="loadingState">
          <div class="dash-spinner" aria-hidden="true"></div>
          <p>${VV.escapeHtml(loadingText)}</p>
        </div>
        <div class="dash-state err" id="errorState" hidden>
          ${svg('alert')}
          <p id="errorMsg">${VV.escapeHtml(errorText)}</p>
          <button type="button" class="dash-btn solid" id="btnRetry">Tentar novamente</button>
        </div>
        <div class="dash-state err" id="denyState" hidden>
          ${svg('lock')}
          <p><strong>Acesso restrito a administradores</strong></p>
          <p class="dash-state-sub">Sua conta está logada, mas não tem permissão para ver este painel. Fale com o gestor da loja para liberar seu acesso.</p>
          <div class="dash-state-actions">
            <a class="dash-btn ghost dark" href="/">Voltar ao catálogo</a>
            <button type="button" class="dash-btn solid" id="btnDenyLogout">Trocar de conta</button>
          </div>
        </div>`;
      main.insertAdjacentHTML('afterbegin', html);
    },
  };
})(window);
