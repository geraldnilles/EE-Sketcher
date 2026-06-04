/* =====================================================================
   interactions.js
   Pointer event dispatch per operating mode.
     select  : click -> set selection, sidebar updates
     drag    : pointerdown on component or endpoint-hit -> translate
     connect : two clicks -> createLine()
   ===================================================================== */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * LINE_PICK_TOLERANCE: how many SVG user units away from a line's path
   * a click is still considered to have hit it.  10 units = 40% of a grid
   * cell, generous enough to forgive a few px of slop at default zoom,
   * but tight enough that clicking in the gap between two adjacent lines
   * still hits the nearer one only.
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
  function pointerToGrid(evt) {
    const p = svgPoint(evt);
    return { x: global.snap(p.x), y: global.snap(p.y) };
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
   * Returns the original target unchanged when it isn't 'canvas' or when
   * no nearby line is found.  This is what makes line selection
   * forgiving without affecting component selection or connect-mode
   * drawing.
   */
  function pickLineWithTolerance(evt, target) {
    if (target.kind !== 'canvas') return target;
    if (typeof global.findLineNearPoint !== 'function') return target;
    const p = svgPoint(evt);
    const near = global.findLineNearPoint(p.x, p.y, LINE_PICK_TOLERANCE);
    if (near) return { kind: 'line', el: near };
    return target;
  }

  /* ----- selection ----- */
  function clearSelection() {
    document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
    global.appState.selected = null;
    global.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
  }
  function setSelection(el) {
    if (global.appState.selected === el) return;
    clearSelection();
    if (el) {
      el.classList.add('is-selected');
      global.appState.selected = el;
      global.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: el } }));
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
   * Validate a candidate line for the preview.  Returns the
   * { ok, reason } object from validateNewLine, or { ok: true } if
   * the validator isn't available or the candidate is zero-length
   * (so we don't flash red for a degenerate single-point preview).
   */
  function previewValidFor(x1, y1, x2, y2) {
    if (x1 === x2 && y1 === y2) return { ok: true };
    if (typeof global.validateNewLine !== 'function') return { ok: true };
    return global.validateNewLine(x1, y1, x2, y2);
  }

  /* ----- main init ----- */
  function init() {
    const svg = document.getElementById('canvas');
    if (!svg) return;

    /* ---- pointer move: preview & live drag ---- */
    svg.addEventListener('pointermove', (evt) => {
      const st = global.appState;

      if (st.dragging) {
        const gp = pointerToGrid(evt);
        const d = st.dragging;
        if (d.kind === 'component') {
          global.setOrigin(d.el, d.ox + (gp.x - d.startX), d.oy + (gp.y - d.startY));
        } else if (d.kind === 'endpoint') {
          global.shiftLineForEndpointDrag(d.el, d.which, gp.x, gp.y);
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
      const st = global.appState;
      let   tgt = resolveTarget(evt);
      // Forgiveness: in drag mode, a near-miss on a line should still pick it.
      if (st.mode === 'drag') tgt = pickLineWithTolerance(evt, tgt);

      if (st.mode === 'drag') {
        if (tgt.kind === 'component') {
          const o = global.readOrigin(tgt.el);
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

      // Connect-mode drawing is handled entirely in the 'click' handler below,
      // which fires once per logical click. We deliberately do nothing in
      // pointerdown for 'connect' to avoid racing with click and clobbering
      // appState.drawStart.
    });

    function endDrag() {
      const st = global.appState;
      if (st.dragging) {
        st.dragging = null;
        svg.classList.remove('is-dragging');
        
        if (global.refreshNetTopology) {
          global.refreshNetTopology();
        } else if (global.recomputeJunctions) {
          global.recomputeJunctions();
        }
      }
    }
    svg.addEventListener('pointerup',     endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('pointerleave',  () => { if (global.appState.dragging) endDrag(); });

    /* ---- click ---- */
    svg.addEventListener('click', (evt) => {
      const st = global.appState;
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
          // Re-check validity.  If the proposed line would overlap an
          // existing net or a component rect/border, the click is
          // silently rejected (no line is drawn) and the in-progress
          // draw is cleared.
          const valid = previewValidFor(st.drawStart.x, st.drawStart.y, x2, y2);
          if (valid.ok) {
            global.createLine(st.drawStart.x, st.drawStart.y, x2, y2);
          }
          // Always cancel the in-progress draw on click 2 (whether the
          // line was accepted or rejected).  This matches the spec:
          // "If the user attempts to draw an overapping net, it should
          // just cancel the operation and not draw any lines."
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
        if (global.appState.drawStart) {
          global.appState.drawStart = null;
          clearPreview();
        }
        if (global.appState.dragging) {
          global.appState.dragging = null;
          svg.classList.remove('is-dragging');
        }
        clearSelection();
      }

      if (evt.target && /(INPUT|TEXTAREA|SELECT)/.test(evt.target.tagName || '')) return;
      if (evt.key === 's' || evt.key === 'S') global.setMode('select');
      if (evt.key === 'd' || evt.key === 'D') global.setMode('drag');
      if (evt.key === 'c' || evt.key === 'C') global.setMode('connect');

      /* ---- a key: add a new generic component ---- */
      if (evt.key === 'a' || evt.key === 'A') {
        const btn = document.getElementById('add-component-btn');
        if (btn) btn.click();
      }

      /* ---- x, Backspace, Delete: delete selected element ---- */
      if (evt.key === 'x' || evt.key === 'X' || evt.key === 'Backspace' || evt.key === 'Delete') {
        const el = global.appState.selected;
        if (el) {
          if (el.classList && el.classList.contains('net-line')) {
            global.deleteLine(el);
          } else {
            global.deleteComponent(el);
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
        global.appState.dragging = null;
        svg.classList.remove('is-dragging');
      }
      if (m !== 'connect') {
        global.appState.drawStart = null;
        clearPreview();
      }
    });
  }

  global.pointerToGrid    = pointerToGrid;
  global.clearSelection  = clearSelection;
  global.setSelection    = setSelection;
  global.initInteractions = init;
})(typeof window !== 'undefined' ? window : globalThis);
