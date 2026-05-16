// ProtonDeck — loading feedback
// Top bar global pra navegação/forms + helper setButtonLoading pra AJAX.

(function () {
  'use strict';

  // ──────────────── top bar ────────────────
  let bar = null;
  let progressTimer = null;
  let progress = 0;

  function ensureBar() {
    if (bar) return bar;
    bar = document.getElementById('loading-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'loading-bar';
      document.body.appendChild(bar);
    }
    return bar;
  }

  function start() {
    const b = ensureBar();
    b.classList.remove('is-done');
    b.classList.add('is-loading');
    progress = 0;
    b.style.width = '0%';
    // ease-out até ~90%, fica parado lá esperando o done()
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      const step = (90 - progress) * 0.08;
      progress = Math.min(90, progress + step);
      b.style.width = progress + '%';
      if (progress >= 89.5) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    }, 150);
  }

  function done() {
    const b = ensureBar();
    clearInterval(progressTimer);
    progressTimer = null;
    b.classList.add('is-done');
    b.classList.remove('is-loading');
    setTimeout(() => {
      b.style.width = '0%';
      b.classList.remove('is-done');
    }, 400);
  }

  // Form submits (navegação tradicional)
  document.addEventListener('submit', (ev) => {
    const form = ev.target;
    if (!(form instanceof HTMLFormElement)) return;
    // pula submits AJAX (form com data-ajax="true")
    if (form.dataset.ajax === 'true') return;
    start();
  }, true);

  // Cliques em links internos
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (a.target === '_blank') return;
    if (a.hasAttribute('download')) return;
    // links externos: deixa o navegador resolver, mas ainda mostra a barra brevemente
    start();
  }, true);

  // Page show (back/forward cache) ou load termina a barra
  window.addEventListener('pageshow', done);
  window.addEventListener('beforeunload', () => { /* barra permanece visível durante a navegação */ });

  // ──────────────── helper: setButtonLoading ────────────────
  // Uso:
  //   PD.setButtonLoading(btn, true, { text: 'Diagnosticando...' });
  //   await fetch(...);
  //   PD.setButtonLoading(btn, false);
  //
  // Preserva o conteúdo original do botão em data-original-html e restaura
  // ao desligar. Adiciona/remove classe is-loading.

  function setButtonLoading(btn, on, opts) {
    if (!btn) return;
    opts = opts || {};
    if (on) {
      if (!btn.dataset.originalHtml) {
        btn.dataset.originalHtml = btn.innerHTML;
      }
      const label = opts.text || 'Carregando...';
      btn.innerHTML = '<span class="pd-spinner" aria-hidden="true"></span>' + label;
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    } else {
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
        delete btn.dataset.originalHtml;
      }
      btn.classList.remove('is-loading');
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }

  window.PD = window.PD || {};
  window.PD.setButtonLoading = setButtonLoading;
  window.PD.loadingBar = { start, done };
})();
