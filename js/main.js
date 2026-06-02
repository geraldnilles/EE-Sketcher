/* =====================================================================
   main.js
   DOMContentLoaded bootstrap:
     - initialize mode buttons
     - initialize + Component button
     - initialize Export / Import buttons
     - kick off interactions & sidebar
   ===================================================================== */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function init() {
    /* ---- Mode buttons ---- */
    const modeBtns = document.querySelectorAll('.mode-btn');
    function refreshModeButtons() {
      const m = global.appState.mode;
      modeBtns.forEach((b) => {
        if (b.getAttribute('data-mode') === m) b.classList.add('active');
        else                                   b.classList.remove('active');
      });
    }
    modeBtns.forEach((b) => {
      b.addEventListener('click', () => global.setMode(b.getAttribute('data-mode')));
    });
    window.addEventListener('modechange', refreshModeButtons);
    refreshModeButtons();
    // Set initial cursor class on the canvas
    const svg = $('canvas');
    if (svg) {
      svg.classList.remove('mode-select', 'mode-drag', 'mode-connect');
      svg.classList.add('mode-' + global.appState.mode);
    }

    /* ---- + Component button ---- */
    const addBtn = $('add-component-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const g = global.createComponent(100, 100, 100, 2);
        if (g) {
          // Auto-select the new component
          document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
          g.classList.add('is-selected');
          global.appState.selected = g;
          global.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: g } }));
        }
      });
    }

    /* ---- Data Portal ---- */
    const portal   = $('data-portal');
    const exportBtn = $('export-btn');
    const importBtn = $('import-btn');
    const msg      = $('data-portal-msg');

    function setMsg(text, kind) {
      if (!msg) return;
      msg.textContent = text || '';
      msg.classList.remove('error', 'success');
      if (kind) msg.classList.add(kind);
      if (text) {
        clearTimeout(setMsg._t);
        setMsg._t = setTimeout(() => {
          msg.textContent = '';
          msg.classList.remove('error', 'success');
        }, 5000);
      }
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        try {
          const text = global.exportSchema();
          if (portal) portal.value = text;
          setMsg('Exported ' + text.length + ' bytes of SVG.', 'success');
        } catch (err) {
          console.error(err);
          setMsg('Export failed: ' + err.message, 'error');
        }
      });
    }
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        try {
          const text = portal ? portal.value : '';
          global.importSchema(text);
          // Re-render sidebar
          global.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
          setMsg('Imported schema successfully.', 'success');
        } catch (err) {
          console.error(err);
          setMsg('Import failed: ' + err.message, 'error');
        }
      });
    }

    /* ---- Initialize subsystems ---- */
    if (global.initInteractions) global.initInteractions();
    if (global.initSidebar)     global.initSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
