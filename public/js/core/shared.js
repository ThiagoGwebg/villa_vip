/* ============================================================================
   Villa Vip Country Store — Camada compartilhada do front
   Namespace `VV.*` evita colisão com o JS específico de cada página.
   Tudo vanilla, zero dependências. Sync Services.
   ========================================================================== */
(function (global) {
  "use strict";

  const VV = {};

  /* ---------- Formatters pt-BR ----------------------------------------- */
  VV.brl = (n) =>
    Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  VV.num = (n) => Number(n || 0).toLocaleString("pt-BR");
  VV.pct = (n) => `${Number(n || 0).toLocaleString("pt-BR")}%`;

  /* ---------- Sessão (localStorage) ------------------------------------ */
  VV.token = () => {
    try { return localStorage.getItem("token"); } catch { return null; }
  };

  VV.user = () => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); }
    catch { return null; }
  };

  VV.setUser = (user) => {
    try { localStorage.setItem("user", JSON.stringify(user)); } catch { /* ignore */ }
  };

  VV.logout = (opts = {}) => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch { /* ignore */ }
    const to = opts.to || (opts.silent ? null : "/login");
    if (to) window.location.replace(to);
  };

  /* ---------- Guard de acesso -----------------------------------------
     Cliente comum não vê o painel. Este guard é defesa em profundidade: o
     gate real continua sendo o 403 da API (que lê `profiles.admin` no
     banco). Aqui só evitamos que um não-admin chegue a ver o esqueleto.
     ------------------------------------------------------------------- */
  VV.guard = (opts = {}) => {
    if (!VV.token()) {
      window.location.replace("/login");
      return null;
    }
    const u = VV.user();
    if (opts.requireAdmin && (!u || u.isAdmin !== true)) {
      window.location.replace("/");
      return null;
    }
    return u;
  };

  /* ---------- Fetch autenticado ---------------------------------------
     Adiciona Authorization automaticamente. Em 401, encerra a sessão.
     Em 403, dispara callback opcional (a página decide o que mostrar).
     ------------------------------------------------------------------- */
  VV.authFetch = async (url, opts = {}) => {
    const token = VV.token();
    const headers = {
      ...(opts.headers || {}),
      Authorization: "Bearer " + (token || ""),
    };
    // Só seta Content-Type se houver body JSON e o caller não tiver setado.
    if (opts.body && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) {
      VV.logout({ to: "/login" });
      throw new Error("Sessão expirada");
    }
    if (res.status === 403 && typeof opts.onForbidden === "function") {
      opts.onForbidden(res);
    }
    return res;
  };

  /* ---------- Toast --------------------------------------------------- */
  function ensureToastHost() {
    let host = document.getElementById("vv-toasts");
    if (!host) {
      host = document.createElement("div");
      host.id = "vv-toasts";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      document.body.appendChild(host);
    }
    return host;
  }

  VV.toast = (msg, opts = {}) => {
    const host = ensureToastHost();
    const kind = opts.kind || "info";
    const timeout = opts.timeout || 4000;

    const el = document.createElement("div");
    el.className = `vv-toast vv-toast--${kind}`;
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    el.textContent = msg;

    let dismissTimer;
    const dismiss = () => {
      el.classList.add("vv-toast--leaving");
      setTimeout(() => el.remove(), 220);
    };
    const arm = () => {
      clearTimeout(dismissTimer);
      dismissTimer = setTimeout(dismiss, timeout);
    };
    el.addEventListener("mouseenter", () => clearTimeout(dismissTimer));
    el.addEventListener("mouseleave", arm);
    el.addEventListener("click", dismiss);

    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("vv-toast--in"));
    arm();
    return el;
  };

  /* ---------- Confirm modal -------------------------------------------
     Substitui window.confirm() com algo que respeita a identidade visual.
     Retorna Promise<boolean>.
     ------------------------------------------------------------------- */
  VV.confirm = ({
    title = "Confirmar ação",
    body = "Tem certeza que deseja continuar?",
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    danger = false,
  } = {}) =>
    new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "vv-confirm-overlay";
      overlay.innerHTML = `
        <div class="vv-confirm" role="dialog" aria-modal="true" aria-labelledby="vvcTitle">
          <h3 id="vvcTitle">${escapeHtml(title)}</h3>
          <p>${escapeHtml(body)}</p>
          <div class="vv-confirm-actions">
            <button type="button" class="vv-btn vv-btn--ghost" data-act="cancel">${escapeHtml(cancelLabel)}</button>
            <button type="button" class="vv-btn ${danger ? "vv-btn--danger" : "vv-btn--primary"}" data-act="ok">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const cleanup = (result) => {
        document.body.style.overflow = prevOverflow;
        overlay.remove();
        document.removeEventListener("keydown", onKey);
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === "Escape") cleanup(false);
        else if (e.key === "Enter") cleanup(true);
      };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cleanup(false);
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "ok") cleanup(true);
        if (act === "cancel") cleanup(false);
      });
      document.addEventListener("keydown", onKey);
      overlay.querySelector('[data-act="ok"]').focus();
    });

  /* ---------- Loading state de botão ----------------------------------
     setBusy(btn, true, 'Salvando...') | setBusy(btn, false)
     Guarda o texto original em dataset.idleText para restaurar com segurança.
     ------------------------------------------------------------------- */
  VV.setBusy = (btn, loading, label) => {
    if (!btn) return;
    if (loading) {
      if (btn.dataset.idleText == null) btn.dataset.idleText = btn.textContent;
      btn.disabled = true;
      btn.classList.add("is-busy");
      if (label) btn.textContent = label;
    } else {
      btn.disabled = false;
      btn.classList.remove("is-busy");
      if (btn.dataset.idleText != null) {
        btn.textContent = btn.dataset.idleText;
        delete btn.dataset.idleText;
      }
    }
  };

  /* ---------- Download de arquivo autenticado --------------------------
     fetch() não permite headers customizados em <a download>, então
     baixamos como Blob e simulamos o clique. Mostra toast em erro.
     ------------------------------------------------------------------- */
  VV.downloadFile = async (url, fallbackName = 'download') => {
    try {
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + (VV.token() || '') },
      });
      if (res.status === 401) { VV.logout(); return; }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        VV.toast(data.message || 'Erro ao gerar arquivo.', { kind: 'error' });
        return;
      }
      // Nome do arquivo: tenta Content-Disposition, senão fallback.
      const dispo = res.headers.get('Content-Disposition') || '';
      const match = dispo.match(/filename="?([^";]+)"?/i);
      const name = match ? match[1] : fallbackName;
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      VV.toast('Falha na conexão.', { kind: 'error' });
    }
  };

  /* ---------- Helpers internos ---------------------------------------- */
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }
  VV.escapeHtml = escapeHtml;

  global.VV = VV;
})(window);
