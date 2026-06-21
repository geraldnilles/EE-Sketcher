/* =====================================================================
   main.js
   DOMContentLoaded bootstrap:
     - initialize mode buttons
     - initialize + Component button
     - initialize Export / Import buttons
     - kick off interactions & sidebar
   ===================================================================== */

import { appState, setMode, snap } from './state.js';
import { initViewport, getViewBox } from './viewport.js';
import { createComponent, createCommentComponent, createGndComponent, createVddComponent, createPassiveComponent } from './components.js';
import { initInteractions } from './interactions.js';
import { initSidebar, renderSidebar } from './sidebar.js';
import { exportSchema, importSchema } from './serialization.js';

function $(id) { return document.getElementById(id); }

function init() {
  /* ---- Mode buttons ---- */
  const modeBtns = document.querySelectorAll('.mode-btn');
  function refreshModeButtons() {
    const m = appState.mode;
    modeBtns.forEach((b) => {
      if (b.getAttribute('data-mode') === m) b.classList.add('active');
      else                                   b.classList.remove('active');
    });
  }
  modeBtns.forEach((b) => {
    b.addEventListener('click', () => setMode(b.getAttribute('data-mode')));
  });
  window.addEventListener('modechange', refreshModeButtons);
  refreshModeButtons();
  
  // Set initial cursor class on the canvas
  const svg = $('canvas');
  if (svg) {
    svg.classList.remove('mode-select', 'mode-drag', 'mode-connect');
    svg.classList.add('mode-' + appState.mode);
  }

  /* ---- + Component button ---- */
  const addBtn = $('add-component-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      let _vx = 100, _vy = 100;
      if (getViewBox) {
        const vb = getViewBox();
        _vx = snap(vb.x + vb.w / 2);
        _vy = snap(vb.y + vb.h / 2);
      }
      const g = createComponent(_vx, _vy, 100, 2);
      if (g) {
        document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
        g.classList.add('is-selected');
        appState.selected = g;
        window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: g } }));
      }
    });
  }

  /* ---- + Comment button ---- */
  const commentBtn = $('add-comment-btn');
  if (commentBtn) {
    commentBtn.addEventListener('click', () => {
      let vx = 100, vy = 100;
      if (getViewBox) {
        const vb = getViewBox();
        vx = snap(vb.x + vb.w / 2);
        vy = snap(vb.y + vb.h / 2);
      }
      const g = createCommentComponent(vx, vy);
      if (g) {
        document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
        g.classList.add('is-selected');
        appState.selected = g;
        window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: g } }));
      }
    });
  }

  /* ---- + GND button ---- */
  const gndBtn = $('add-gnd-btn');
  if (gndBtn) {
    gndBtn.addEventListener('click', () => {
      let _vx = 100, _vy = 100;
      if (getViewBox) {
        const vb = getViewBox();
        _vx = snap(vb.x + vb.w / 2);
        _vy = snap(vb.y + vb.h / 2);
      }
      const g = createGndComponent(_vx, _vy);
      if (g) {
        document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
        g.classList.add('is-selected');
        appState.selected = g;
        window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: g } }));
      }
    });
  }

  /* ---- + VDD button ---- */
  const vddBtn = $('add-vdd-btn');
  if (vddBtn) {
    vddBtn.addEventListener('click', () => {
      let _vx = 100, _vy = 100;
      if (getViewBox) {
        const vb = getViewBox();
        _vx = snap(vb.x + vb.w / 2);
        _vy = snap(vb.y + vb.h / 2);
      }
      const g = createVddComponent(_vx, _vy);
      if (g) {
        document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
        g.classList.add('is-selected');
        appState.selected = g;
        window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: g } }));
      }
    });
  }

  /* ---- + Resistor / Capacitor / Inductor buttons ---- */
  ['resistor', 'capacitor', 'inductor', 'diode'].forEach((type) => {
    const btn = $(`add-${type}-btn`);
    if (btn) {
      btn.addEventListener('click', () => {
        let vx = 100, vy = 100;
        if (getViewBox) {
          const vb = getViewBox();
          vx = snap(vb.x + vb.w / 2);
          vy = snap(vb.y + vb.h / 2);
        }
        const g = createPassiveComponent(type, vx, vy);
        if (g) {
          document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
          g.classList.add('is-selected');
          appState.selected = g;
          window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: g } }));
        }
      });
    }
  });

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
        const text = exportSchema();
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
        importSchema(text);
        window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
        setMsg('Imported schema successfully.', 'success');
      } catch (err) {
        console.error(err);
        setMsg('Import failed: ' + err.message, 'error');
      }
    });
  }

  /* ---- Initialize subsystems ---- */
  initViewport();
  initInteractions();
  initSidebar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
