/* =====================================================================
   interactions.js
   Pointer event dispatch per operating mode.
     select  : click -> set selection, sidebar updates
     drag    : pointerdown on component or endpoint-hit -> translate
     connect : two clicks -> createLine()
   ===================================================================== */

import { snap, clamp, appState, setMode } from './state.js';
import { findLineNearPoint, createLine, deleteLine, refreshNetTopology, recomputeJunctions, shiftLineForEndpointDrag, validateNewLine } from './nets.js';
import { readOrigin, setOrigin, updateComponent, deleteComponent } from './components.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * LINE_PICK_TOLERANCE: how many SVG user units away from a line's path
 * a click is still considered to have hit it.
 */
const LINE_PICK_TOLERANCE = 10;

/* ----- helpers ----- */
function svgPoint(evt) {
  const svg = document.getElementById('canvas');
  const pt  = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  const r = pt.matrixTransform(inv);
  return { x: r.x, y: r.y };
}
export function pointerToGrid(evt) {
  const p = svgPoint(evt);
  return { x: snap(p.x), y: snap(p.y) };
}

/** Find the closest interactive target by walking up the DOM. */
function resolveTarget(evt) {
  const path = evt.composedPath ? evt.composedPath() : [];
  for (const node of path) {
    if (node && node.nodeType === 1 && node.classList && node.classList.contains('endpoint-hit')) {
      return { kind: 'endpoint', el: node };
    }
  }
  let n = evt.target;
  while (n && n !== document.body) {
    if (n.classList) {
      if (n.classList.contains('generic-component')) return { kind: 'component', el: n };
      if (n.classList.contains('net-line'))           return { kind: 'line',      el: n };
    }
    n = n.parentNode;
  }
  return { kind: 'canvas', el: null };
}

/**
 * Upgrade a 'canvas' (no direct hit) target to a 'line' target if the
 * click is within LINE_PICK_TOLERANCE of some line's segment path.
 */
function pickLineWithTolerance(evt, target) {
  if (target.kind !== 'canvas') return target;
  if (typeof findLineNearPoint !== 'function') return target;
  const p = svgPoint(evt);
  const near = findLineNearPoint(p.x, p.y, LINE_PICK_TOLERANCE);
  if (near) return { kind: 'line', el: near };
  return target;
}

/* ----- selection ----- */
export function clearSelection() {
  document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
  appState.selected = null;
  window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
}
export function setSelection(el) {
  if (appState.selected === el) return;
  clearSelection();
  if (el) {
    el.classList.add('is-selected');
    appState.selected = el;
    window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: el } }));
  }
}

/* ----- preview line ----- */
function clearPreview() {
  const overlay = document.getElementById('overlay-layer');
  if (overlay) overlay.innerHTML = '';
}
function drawPreview(x1, y1, x2, y2, valid) {
  clearPreview();
  const overlay = document.getElementById('overlay-layer');
  if (!overlay) return;
  const ln = document.createElementNS(SVG_NS, 'line');
  let cls = 'net-preview';
  if (valid && !valid.ok) cls += ' invalid';
  ln.setAttribute('class', cls);
  ln.setAttribute('x1', String(x1));
  ln.setAttribute('y1', String(y1));
  ln.setAttribute('x2', String(x2));
  ln.setAttribute('y2', String(y2));
  if (valid && !valid.ok && valid.reason) {
    ln.setAttribute('data-violation', valid.reason);
  }
  overlay.appendChild(ln);
}

/**
 * Validate a candidate line for the preview.
 */
function previewValidFor(x1, y1, x2, y2) {
  if (x1 === x2 && y1 === y2) return { ok: true };
  if (typeof validateNewLine !== 'function') return { ok: true };
  return validateNewLine(x1, y1, x2, y2);
}

/* ----- main init ----- */
export function initInteractions() {
  const svg = document.getElementById('canvas');
  if (!svg) return;

  /* ---- pointer move: preview & live drag ---- */
  svg.addEventListener('pointermove', (evt) => {
    const st = appState;

    if (st.dragging) {
      const gp = pointerToGrid(evt);
      const d = st.dragging;
      if (d.kind === 'component') {
        setOrigin(d.el, d.ox + (gp.x - d.startX), d.oy + (gp.y - d.startY));
      } else if (d.kind === 'endpoint') {
        shiftLineForEndpointDrag(d.el, d.which, gp.x, gp.y);
      }
      return;
    }

    if (st.mode === 'connect' && st.drawStart) {
      const p = pointerToGrid(evt);
      const dx = Math.abs(p.x - st.drawStart.x);
      const dy = Math.abs(p.y - st.drawStart.y);
      let x2 = p.x, y2 = p.y;
      if (dx >= dy) y2 = st.drawStart.y;
      else          x2 = st.drawStart.x;
      const valid = previewValidFor(st.drawStart.x, st.drawStart.y, x2, y2);
      drawPreview(st.drawStart.x, st.drawStart.y, x2, y2, valid);
    }
  });

  /* ---- pointer down ---- */
  svg.addEventListener('pointerdown', (evt) => {
    if (evt.button !== 0) return;
    const st = appState;
    let   tgt = resolveTarget(evt);
    // Forgiveness: in drag mode, a near-miss on a line should still pick it.
    if (st.mode === 'drag') tgt = pickLineWithTolerance(evt, tgt);

    if (st.mode === 'drag') {
      if (tgt.kind === 'component') {
        const o = readOrigin(tgt.el);
        const gp = pointerToGrid(evt);
        st.dragging = {
          kind: 'component',
          el: tgt.el,
          ox: o.x, oy: o.y,
          startX: gp.x, startY: gp.y,
        };
        svg.classList.add('is-dragging');
        try { tgt.el.setPointerCapture(evt.pointerId); } catch (_) {}
        setSelection(tgt.el);
      } else if (tgt.kind === 'endpoint') {
        const line = tgt.el.parentNode;
        const which = tgt.el.getAttribute('data-endpoint');
        st.dragging = { kind: 'endpoint', el: line, which: which };
        svg.classList.add('is-dragging');
        try { tgt.el.setPointerCapture(evt.pointerId); } catch (_) {}
        setSelection(line);
      } else if (tgt.kind === 'line') {
        setSelection(tgt.el);
      }
      return;
    }
  });

  function endDrag() {
    const st = appState;
    if (st.dragging) {
      st.dragging = null;
      svg.classList.remove('is-dragging');
      
      if (refreshNetTopology) {
        refreshNetTopology();
      } else if (recomputeJunctions) {
        recomputeJunctions();
      }
    }
  }
  svg.addEventListener('pointerup',     endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointerleave',  () => { if (appState.dragging) endDrag(); });

  /* ---- click ---- */
  svg.addEventListener('click', (evt) => {
    const st = appState;
    let   tgt = resolveTarget(evt);
    // Forgiveness: in select mode, a near-miss on a line should still select it.
    if (st.mode === 'select') tgt = pickLineWithTolerance(evt, tgt);

    if (st.mode === 'connect') {
      if (!st.drawStart) {
        const gp = pointerToGrid(evt);
        st.drawStart = { x: gp.x, y: gp.y };
        drawPreview(gp.x, gp.y, gp.x, gp.y, { ok: true });
        return;
      }
      const gp = pointerToGrid(evt);
      const dx = Math.abs(gp.x - st.drawStart.x);
      const dy = Math.abs(gp.y - st.drawStart.y);
      let x2 = gp.x, y2 = gp.y;
      if (dx >= dy) y2 = st.drawStart.y;
      else          x2 = st.drawStart.x;
      if (x2 !== st.drawStart.x || y2 !== st.drawStart.y) {
        const valid = previewValidFor(st.drawStart.x, st.drawStart.y, x2, y2);
        if (valid.ok) {
          createLine(st.drawStart.x, st.drawStart.y, x2, y2);
        }
      }
      st.drawStart = null;
      clearPreview();
      return;
    }

    if (tgt.kind === 'component' || tgt.kind === 'line') {
      setSelection(tgt.el);
    } else {
      clearSelection();
    }
  });

  /* ---- keyboard ---- */
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      if (appState.drawStart) {
        appState.drawStart = null;
        clearPreview();
      }
      if (appState.dragging) {
        appState.dragging = null;
        svg.classList.remove('is-dragging');
      }
      clearSelection();
    }

    if (evt.target && /(INPUT|TEXTAREA|SELECT)/.test(evt.target.tagName || '')) return;
    if (evt.key === 's' || evt.key === 'S') setMode('select');
    if (evt.key === 'd' || evt.key === 'D') setMode('drag');
    if (evt.key === 'c' || evt.key === 'C') setMode('connect');

    /* ---- a key: add a new generic component ---- */
    if (evt.key === 'a' || evt.key === 'A') {
      const btn = document.getElementById('add-component-btn');
      if (btn) btn.click();
    }

    /* ---- r key: rotate selected passive component 0 ↔ 90 ---- */
    if (evt.key === "r" || evt.key === "R") {
      const el = appState.selected;
      if (el && el.classList && el.classList.contains("passive-component")) {
        const currentRot = parseInt(el.getAttribute("data-rotate") || "0", 10);
        const newRot = currentRot === 0 ? 90 : 0;
        updateComponent(el, { rotatePassive: newRot });
      }
    }

    /* ---- x, Backspace, Delete: delete selected element ---- */
    if (evt.key === 'x' || evt.key === 'X' || evt.key === 'Backspace' || evt.key === 'Delete') {
      const el = appState.selected;
      if (el) {
        if (el.classList && el.classList.contains('net-line')) {
          deleteLine(el);
        } else {
          deleteComponent(el);
        }
      }
    }
  });

  /* ---- mode change ---- */
  window.addEventListener('modechange', (e) => {
    const m = e.detail && e.detail.mode;
    svg.classList.remove('mode-select', 'mode-drag', 'mode-connect');
    svg.classList.add('mode-' + m);
    clearPreview();
    if (m !== 'drag') {
      appState.dragging = null;
      svg.classList.remove('is-dragging');
    }
    if (m !== 'connect') {
      appState.drawStart = null;
      clearPreview();
    }
  });
}
