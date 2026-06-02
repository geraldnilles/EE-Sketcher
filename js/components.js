/* =====================================================================
   components.js
   Generic Block component: create / update / delete
   DOM = source of truth. No JSON model.
   ===================================================================== */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Default pin labels (sensible placeholders). */
  function defaultLabel(side, row) {
    return (side === 'L' ? 'L' : 'R') + (row + 1);
  }

  /**
   * createComponent(x, y, width, rows)
   *   x, y    : grid coords for the top-left pin origin
   *   width   : SVG units; MUST be a multiple of 50
   *   rows    : integer >= 1
   * Returns the <g class="generic-component"> element.
   */
  function createComponent(x, y, width, rows) {
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('createComponent: x,y must be numbers');
    }
    width = width || 100;
    rows  = rows  || 2;

    if (width % 50 !== 0) {
      // Snap up to the next legal width.
      width = Math.max(50, Math.round(width / 50) * 50);
    }
    if (rows < 1) rows = 1;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'generic-component');
    g.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
    g.setAttribute('data-id', global.uid('cmp'));

    // rect: y=-25 (per spec), height = (rows + 1) * 25
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'component-body');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '-25');
    rect.setAttribute('width',  String(width));
    rect.setAttribute('height', String((rows + 1) * 25));
    rect.setAttribute('fill',   '#ffffff');
    rect.setAttribute('stroke', '#000000');
    rect.setAttribute('stroke-width', '2');
    g.appendChild(rect);

    // pin text nodes
    for (let i = 0; i < rows; i++) {
      const l = document.createElementNS(SVG_NS, 'text');
      l.setAttribute('class', 'pin pin-left');
      l.setAttribute('x', '5');
      l.setAttribute('y', String(i * 25));
      l.setAttribute('text-anchor', 'start');
      l.setAttribute('dominant-baseline', 'middle');
      l.setAttribute('font-family', 'sans-serif');
      l.setAttribute('font-size', '12');
      l.setAttribute('data-side', 'L');
      l.setAttribute('data-row',  String(i));
      l.textContent = defaultLabel('L', i);
      g.appendChild(l);

      const r = document.createElementNS(SVG_NS, 'text');
      r.setAttribute('class', 'pin pin-right');
      r.setAttribute('x', String(width - 5));
      r.setAttribute('y', String(i * 25));
      r.setAttribute('text-anchor', 'end');
      r.setAttribute('dominant-baseline', 'middle');
      r.setAttribute('font-family', 'sans-serif');
      r.setAttribute('font-size', '12');
      r.setAttribute('data-side', 'R');
      r.setAttribute('data-row',  String(i));
      r.textContent = defaultLabel('R', i);
      g.appendChild(r);
    }

    // expose layout as data-* for serialization round-trip & sidebar reads
    g.setAttribute('data-width', String(width));
    g.setAttribute('data-rows',  String(rows));

    const layer = document.getElementById('components-layer');
    if (layer) layer.appendChild(g);

    if (global.recomputeJunctions) global.recomputeJunctions();
    return g;
  }

  function getRows(el) {
    return parseInt(el.getAttribute('data-rows') || '1', 10);
  }
  function getWidth(el) {
    return parseInt(el.getAttribute('data-width') || '100', 10);
  }

  function setRectSize(g, width, rows) {
    const rect = g.querySelector('rect.component-body');
    if (rect) {
      rect.setAttribute('width',  String(width));
      rect.setAttribute('height', String((rows + 1) * 25));
    }
    // Move right-side pin x's
    g.querySelectorAll('text.pin-right').forEach((t) => {
      t.setAttribute('x', String(width - 5));
    });
  }

  /**
   * updateComponent(el, patch)
   * Supported patch keys:
   *   labelL: string[]   - left pin labels, length must match rows
   *   labelR: string[]   - right pin labels
   *   addRow()           - alias
   *   removeRow()        - alias
   *   expand()           - alias
   *   contract()         - alias
   *   addRow: true | removeRow: true | expand: true | contract: true
   *   width: number | rows: number   (direct setters)
   */
  function updateComponent(el, patch) {
    if (!el || !el.classList.contains('generic-component')) return;
    if (!patch || typeof patch !== 'object') return;

    let rows  = getRows(el);
    let width = getWidth(el);
    let structuralChanged = false;

    // Mutation helpers -----------------------------------------------------
    if (patch.addRow || patch.removeRow || patch.expand || patch.contract) {
      if (patch.expand)   width = Math.min(1000, width + 50);
      if (patch.contract) width = Math.max(50,   width - 50);
      if (patch.addRow)    rows  = rows + 1;
      if (patch.removeRow) rows  = Math.max(1, rows - 1);
    }
    if (typeof patch.width === 'number') width = Math.max(50, Math.round(patch.width / 50) * 50);
    if (typeof patch.rows  === 'number') rows  = Math.max(1, Math.floor(patch.rows));

    // Apply structural changes
    if (width !== getWidth(el) || rows !== getRows(el)) {
      // Remove pin rows beyond new rows count
      const pins = Array.from(el.querySelectorAll('text.pin'));
      const want = rows;
      pins.forEach((p) => {
        const r = parseInt(p.getAttribute('data-row'), 10);
        if (r >= want) p.remove();
      });
      // Add missing pin rows
      const presentRows = new Set(
        Array.from(el.querySelectorAll('text.pin')).map((p) => p.getAttribute('data-row'))
      );
      for (let i = 0; i < rows; i++) {
        if (!presentRows.has(String(i))) {
          el.appendChild(makePin('L', i, 5));
          el.appendChild(makePin('R', i, width - 5));
        }
      }
      el.setAttribute('data-width', String(width));
      el.setAttribute('data-rows',  String(rows));
      setRectSize(el, width, rows);
      structuralChanged = true;
    }

    // Label patches
    if (Array.isArray(patch.labelL)) {
      patch.labelL.forEach((txt, i) => {
        const node = el.querySelector(`text.pin-left[data-row="${i}"]`);
        if (node) node.textContent = String(txt);
      });
    }
    if (Array.isArray(patch.labelR)) {
      patch.labelR.forEach((txt, i) => {
        const node = el.querySelector(`text.pin-right[data-row="${i}"]`);
        if (node) node.textContent = String(txt);
      });
    }

    if (global.recomputeJunctions) global.recomputeJunctions();

    // If this component is currently selected, ask the sidebar to re-render
    // so the +/- Row and Expand/Contract buttons reflect the new state
    // (disabled flags are computed at render time).
    //
    // IMPORTANT: only fire this on STRUCTURAL changes.  Re-rendering the
    // sidebar blows away and recreates every <input>, which steals focus
    // mid-keystroke from whichever label the user is currently editing.
    // Label-only patches (labelL / labelR) are reflected directly in the
    // SVG <text> nodes and the user is already typing in the live <input>,
    // so the sidebar does not need to be re-rendered for them.
    if (structuralChanged && global.appState && global.appState.selected === el) {
      global.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: el } }));
    }
  }

  function makePin(side, row, x) {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('class', `pin pin-${side === 'L' ? 'left' : 'right'}`);
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(row * 25));
    t.setAttribute('text-anchor', side === 'L' ? 'start' : 'end');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-family', 'sans-serif');
    t.setAttribute('font-size', '12');
    t.setAttribute('data-side', side);
    t.setAttribute('data-row',  String(row));
    t.textContent = defaultLabel(side, row);
    return t;
  }

  /** deleteComponent(el) — remove from DOM, clear selection, recompute junctions. */
  function deleteComponent(el) {
    if (!el) return;
    if (el === global.appState.selected) global.appState.selected = null;
    el.remove();
    if (global.recomputeJunctions) global.recomputeJunctions();
    global.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
  }

  /** Read current labels back as { left: string[], right: string[] }. */
  function readLabels(el) {
    const left  = [];
    const right = [];
    const rows  = getRows(el);
    for (let i = 0; i < rows; i++) {
      const l = el.querySelector(`text.pin-left[data-row="${i}"]`);
      const r = el.querySelector(`text.pin-right[data-row="${i}"]`);
      left.push(l  ? l.textContent  : defaultLabel('L', i));
      right.push(r ? r.textContent : defaultLabel('R', i));
    }
    return { left, right };
  }

  /** Read the absolute top-left pin origin (in SVG units) of a component. */
  function readOrigin(el) {
    const m = /translate\(\s*(-?\d+)\s*,?\s*(-?\d+)\s*\)/.exec(el.getAttribute('transform') || '');
    if (m) return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
    return { x: 0, y: 0 };
  }

  function setOrigin(el, x, y) {
    el.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
  }

  // Expose
  global.createComponent  = createComponent;
  global.updateComponent  = updateComponent;
  global.deleteComponent  = deleteComponent;
  global.readLabels       = readLabels;
  global.readOrigin       = readOrigin;
  global.setOrigin        = setOrigin;
  global.getRows          = getRows;
  global.getWidth         = getWidth;
})(typeof window !== 'undefined' ? window : globalThis);
