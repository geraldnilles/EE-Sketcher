/* =====================================================================
   interactions.js
   Pointer event dispatch per operating mode.
     select  : click -> set selection, sidebar updates
     drag    : pointerdown on component or endpoint-hit -> translate
     connect : two clicks -> createLine()
   ===================================================================== */

import { snap, clamp, appState, setMode } from './state.js';
import { createLine, deleteLine, refreshNetTopology, recomputeJunctions } from './nets.js';
import { findEndpointHit } from './nets/net-factory.js';
import { readLineCoords, findLineNearPoint, shiftLineForEndpointDrag } from './nets/net-interaction.js';
import { validateNewLine } from './nets/net-validation.js';
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
      } else if (d.kind === 'multi-drag') {
        const dx = gp.x - d.startX;
        const dy = gp.y - d.startY;

        for (let i = 0; i < d.elements.length; i++) {
          const item = d.elements[i];
          if (item.kind === 'component') {
            setOrigin(item.el, item.ox + dx, item.oy + dy);
          } else if (item.kind === 'line') {
            const nx1 = item.x1 + dx;
            const ny1 = item.y1 + dy;
            const nx2 = item.x2 + dx;
            const ny2 = item.y2 + dy;
            item.el.setAttribute('x1', String(nx1));
            item.el.setAttribute('y1', String(ny1));
            item.el.setAttribute('x2', String(nx2));
            item.el.setAttribute('y2', String(ny2));

            // Synchronize the invisible companion endpoint hit targets
            const netId = item.el.getAttribute('data-id');
            const hits = document.querySelectorAll('rect.endpoint-hit[data-net-id="' + netId + '"]');
            hits.forEach(h => {
              const SIZE = 14;
              const which = h.getAttribute('data-endpoint');
              const hx = (which === 'start') ? nx1 : nx2;
              const hy = (which === 'start') ? ny1 : ny2;
              h.setAttribute('x', String(hx - SIZE / 2));
              h.setAttribute('y', String(hy - SIZE / 2));
            });
          }
        }
      } else if (d.kind === 'box-select') {
        const p = svgPoint(evt);
        const overlay = document.getElementById('overlay-layer');
        if (overlay) {
          overlay.innerHTML = '';
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          const x = Math.min(d.startX, p.x);
          const y = Math.min(d.startY, p.y);
          const width = Math.abs(d.startX - p.x);
          const height = Math.abs(d.startY - p.y);

          rect.setAttribute('x', String(x));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', String(width));
          rect.setAttribute('height', String(height));
          rect.setAttribute('fill', 'rgba(37, 99, 235, 0.1)');
          rect.setAttribute('stroke', 'var(--accent)');
          rect.setAttribute('stroke-width', '1');
          rect.setAttribute('stroke-dasharray', '4 4');
          overlay.appendChild(rect);
        }
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
      // 1. If Ctrl is held, don't start dragging; let the click listener handle selection toggling
      if (evt.ctrlKey) return;

      if (tgt.kind === 'component' || tgt.kind === 'line') {
        // 2. If the clicked element isn't already selected, treat it as a new single selection
        if (!tgt.el.classList.contains('is-selected')) {
          clearSelection();
          tgt.el.classList.add('is-selected');
          st.selected = tgt.el;
          window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: st.selected } }));
        }

        // Capture initial positions of ALL elements in the selected group
        const gp = pointerToGrid(evt);
        const selectedEls = Array.from(document.querySelectorAll('.is-selected'));
        const dragElements = [];

        for (let i = 0; i < selectedEls.length; i++) {
          const el = selectedEls[i];
          if (el.classList.contains('generic-component')) {
            const o = readOrigin(el);
            dragElements.push({ el, kind: 'component', ox: o.x, oy: o.y });
          } else if (el.classList.contains('net-line')) {
            const coords = readLineCoords(el);
            dragElements.push({ el, kind: 'line', x1: coords.x1, y1: coords.y1, x2: coords.x2, y2: coords.y2 });
          }
        }

        st.dragging = {
          kind: 'multi-drag',
          startX: gp.x,
          startY: gp.y,
          elements: dragElements
        };

        svg.classList.add('is-dragging');
        try { tgt.el.setPointerCapture(evt.pointerId); } catch (_) {}
        return;

      } else if (tgt.kind === 'endpoint') {
        // Keep existing standalone endpoint drag logic intact
        const netId = tgt.el.getAttribute('data-net-id');
        const line = document.querySelector('line.net-line[data-id="' + netId + '"]');
        const which = tgt.el.getAttribute('data-endpoint');
        st.dragging = { kind: 'endpoint', el: line, which: which };
        svg.classList.add('is-dragging');
        try { tgt.el.setPointerCapture(evt.pointerId); } catch (_) {}
        setSelection(line);
        return;

      } else if (tgt.kind === 'canvas') {
        // 3. Start a marquee box selection from the exact mouse coordinates
        const p = svgPoint(evt);
        st.dragging = {
          kind: 'box-select',
          startX: p.x,
          startY: p.y
        };
        svg.classList.add('is-dragging');
        clearSelection();
        return;
      }
    }
  });

  function endDrag(evt) {
    const st = appState;
    if (st.dragging) {
      // Set a flag so the subsequent click event doesn't undo the drag result
      appState.justDragged = true;
      if (st.dragging.kind === 'box-select') {
        const overlay = document.getElementById('overlay-layer');
        if (overlay) overlay.innerHTML = '';

        // Check if we have a valid pointer up event object to calculate intersections
        if (evt) {
          const p = svgPoint(evt);
          const d = st.dragging;
          const x1 = Math.min(d.startX, p.x);
          const y1 = Math.min(d.startY, p.y);
          const x2 = Math.max(d.startX, p.x);
          const y2 = Math.max(d.startY, p.y);

          // getBBox() returns local coordinates. Add translate from parent <g> transform.
          const getWorldBounds = (el) => {
            const bbox = el.getBBox();
            const transform = el.getAttribute('transform') || '';
            const m = /translate\(\s*(-?\d+(?:\.\d+)?)\s*,?\s*(-?\d+(?:\.\d+)?)\s*\)/.exec(transform);
            let tx = 0, ty = 0;
            if (m) {
              tx = parseFloat(m[1]);
              ty = parseFloat(m[2]);
            }
            return {
              bx1: bbox.x + tx,
              by1: bbox.y + ty,
              bx2: bbox.x + tx + bbox.width,
              by2: bbox.y + ty + bbox.height
            };
          };

          // Query and highlight overlapping components
          document.querySelectorAll('.generic-component').forEach(el => {
            const b = getWorldBounds(el);
            if (x1 <= b.bx2 && x2 >= b.bx1 && y1 <= b.by2 && y2 >= b.by1) {
              el.classList.add('is-selected');
              st.selected = el;
            }
          });

          // Query and highlight overlapping net wires
          document.querySelectorAll('line.net-line').forEach(el => {
            const b = getWorldBounds(el);
            if (x1 <= b.bx2 && x2 >= b.bx1 && y1 <= b.by2 && y2 >= b.by1) {
              el.classList.add('is-selected');
              st.selected = el;
            }
          });

          window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: st.selected } }));
        }
      }

      st.dragging = null;
      svg.classList.remove('is-dragging');

      if (refreshNetTopology) {
        refreshNetTopology();
      } else if (recomputeJunctions) {
        recomputeJunctions();
      }
    }
  }
  svg.addEventListener('pointerup',     (evt) => endDrag(evt));
  svg.addEventListener('pointercancel', (evt) => endDrag(evt));
  svg.addEventListener('pointerleave',  () => { /* pointerup/pointercancel handle drag end */ });

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

    // Handle Ctrl+Click Accumulative Toggling
    if (evt.ctrlKey) {
      if (tgt.kind === 'component' || tgt.kind === 'line') {
        if (tgt.el.classList.contains('is-selected')) {
          tgt.el.classList.remove('is-selected');
          // If the primary sidebar target was unselected, fall back to another selected element
          if (st.selected === tgt.el) {
            st.selected = document.querySelector('.is-selected');
          }
        } else {
          tgt.el.classList.add('is-selected');
          st.selected = tgt.el;
        }
        window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: st.selected } }));
      }
      return;
    }

    // After a drag operation (including box-select), don't alter selection
    if (st.justDragged) {
      st.justDragged = false;
      return;
    }

    // Regular click selection behavior
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
