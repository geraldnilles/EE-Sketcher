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

    // Clamp position so the entire component stays within the world bounds.
    // Rect spans x..x+width in X, and y-25..y+rows*25 in Y.
    x = global.clamp(snap(x), 0, global.WORLD_W - width);
    y = global.clamp(snap(y), 25, global.WORLD_H - rows * 25);

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

    // Top label (centered above the rect)
    const topLabel = document.createElementNS(SVG_NS, 'text');
    topLabel.setAttribute('class', 'label-top');
    topLabel.setAttribute('x', String(width / 2));
    topLabel.setAttribute('y', '-35');
    topLabel.setAttribute('text-anchor', 'middle');
    topLabel.setAttribute('dominant-baseline', 'middle');
    topLabel.setAttribute('font-family', 'sans-serif');
    topLabel.setAttribute('font-size', '14');
    topLabel.setAttribute('font-weight', 'bold');
    topLabel.textContent = '';
    g.appendChild(topLabel);

    // Bottom label (centered below the rect)
    const bottomLabel = document.createElementNS(SVG_NS, 'text');
    bottomLabel.setAttribute('class', 'label-bottom');
    bottomLabel.setAttribute('x', String(width / 2));
    bottomLabel.setAttribute("y", String(rows * 25 + 10));
    bottomLabel.setAttribute('text-anchor', 'middle');
    bottomLabel.setAttribute('dominant-baseline', 'middle');
    bottomLabel.setAttribute('font-family', 'sans-serif');
    bottomLabel.setAttribute('font-size', '14');
    bottomLabel.setAttribute('font-weight', 'bold');
    bottomLabel.textContent = '';
    g.appendChild(bottomLabel);

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
    g.setAttribute('data-label-top', '');
    g.setAttribute('data-label-bottom', '');

    const layer = document.getElementById('components-layer');
    if (layer) layer.appendChild(g);

    if (global.refreshNetTopology) global.refreshNetTopology();
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
    // Reposition top and bottom labels
    const topLabel = g.querySelector('text.label-top');
    if (topLabel) {
      topLabel.setAttribute('x', String(width / 2));
    }
    const bottomLabel = g.querySelector('text.label-bottom');
    if (bottomLabel) {
      bottomLabel.setAttribute('x', String(width / 2));
      bottomLabel.setAttribute("y", String(rows * 25 + 10));
    }
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

    if (el.classList.contains('passive-component')) {
      if (typeof patch.labelPassive === 'string') {
        const txtEl = el.querySelector('text.passive-label');
        if (txtEl) txtEl.textContent = patch.labelPassive;
        el.setAttribute('data-label', patch.labelPassive);
      }
      if (patch.rotatePassive !== undefined) {
        const rot = String(patch.rotatePassive);
        const useEl = el.querySelector('use');
        if (useEl) useEl.setAttribute('transform', `rotate(${rot})`);
        el.setAttribute('data-rotate', rot);

        const txtEl = el.querySelector('text.passive-label');
        if (txtEl) {
          if (rot === '90') {
            txtEl.setAttribute('x', '20');
            txtEl.setAttribute('y', '0');
            txtEl.setAttribute('text-anchor', 'start');
          } else {
            txtEl.setAttribute('x', '0');
            txtEl.setAttribute('y', '-15');
            txtEl.setAttribute('text-anchor', 'middle');
          }
        }
      }
      if (global.refreshNetTopology) global.refreshNetTopology();
      if (patch.rotatePassive !== undefined && global.appState && global.appState.selected === el) {
        global.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: el } }));
      }
      return;
    }

    if (el.classList.contains('vdd-component')) {
      if (typeof patch.labelVdd === 'string') {
        const txtEl = el.querySelector('text.vdd-label');
        if (txtEl) txtEl.textContent = patch.labelVdd;
        el.setAttribute('data-label', patch.labelVdd);
      }
      if (global.refreshNetTopology) global.refreshNetTopology();
      return;
    }

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
    if (typeof patch.labelTop === 'string') {
      const topLabel = el.querySelector('text.label-top');
      if (topLabel) {
        topLabel.textContent = patch.labelTop;
      }
      el.setAttribute('data-label-top', patch.labelTop);
    }
    if (typeof patch.labelBottom === 'string') {
      const bottomLabel = el.querySelector('text.label-bottom');
      if (bottomLabel) {
        bottomLabel.textContent = patch.labelBottom;
      }
      el.setAttribute('data-label-bottom', patch.labelBottom);
    }
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

    if (global.refreshNetTopology) global.refreshNetTopology();

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
    if (global.refreshNetTopology) global.refreshNetTopology();
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
    const topLabel = el.querySelector('text.label-top');
    const bottomLabel = el.querySelector('text.label-bottom');
    return {
      left, right,
      top: topLabel ? topLabel.textContent : '',
      bottom: bottomLabel ? bottomLabel.textContent : ''
    };
  }

  /** Read the top label text of a component. */
  function readLabelTop(el) {
    const t = el.querySelector('text.label-top');
    return t ? t.textContent : '';
  }
  /** Read the bottom label text of a component. */
  function readLabelBottom(el) {
    const t = el.querySelector('text.label-bottom');
    return t ? t.textContent : '';
  }
  /** Read the absolute top-left pin origin (in SVG units) of a component. */
  function readOrigin(el) {
    const m = /translate\(\s*(-?\d+)\s*,?\s*(-?\d+)\s*\)/.exec(el.getAttribute('transform') || '');
    if (m) return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
    return { x: 0, y: 0 };
  }

  function setOrigin(el, x, y) {
    x = snap(x); y = snap(y);
    if (el.classList.contains('passive-component')) {
      x = global.clamp(x, 50, global.WORLD_W - 50);
      y = global.clamp(y, 50, global.WORLD_H - 50);
    } else if (el.classList.contains('gnd-component')) {
      x = global.clamp(x, 15, global.WORLD_W - 15);
      y = global.clamp(y, 0, global.WORLD_H - 25);
    } else if (el.classList.contains('vdd-component')) {
      x = global.clamp(x, 15, global.WORLD_W - 15);
      y = global.clamp(y, 30, global.WORLD_H); // Allows space for top label
    } else {
      // Clamp position so the entire component stays within the world bounds.
      // Rect spans x..x+width in X, and y-25..y+rows*25 in Y.
      const w = parseInt(el.getAttribute('data-width') || '100', 10);
      const rows = parseInt(el.getAttribute('data-rows') || '1', 10);
      x = global.clamp(x, 0, global.WORLD_W - w);
      y = global.clamp(y, 25, global.WORLD_H - rows * 25);
    }
    el.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
  }

  function createGndComponent(x, y) {
    x = global.clamp(snap(x), 15, global.WORLD_W - 15);
    y = global.clamp(snap(y), 0, global.WORLD_H - 25);

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'generic-component gnd-component');
    g.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
    g.setAttribute('data-id', global.uid('cmp'));

    const useEl = document.createElementNS(SVG_NS, 'use');
    useEl.setAttribute('href', '#gnd');
    g.appendChild(useEl);

    const layer = document.getElementById('components-layer');
    if (layer) layer.appendChild(g);

    if (global.refreshNetTopology) global.refreshNetTopology();
    return g;
  }


  function createVddComponent(x, y) {
    x = global.clamp(snap(x), 15, global.WORLD_W - 15);
    y = global.clamp(snap(y), 30, global.WORLD_H);

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'generic-component vdd-component');
    g.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
    g.setAttribute('data-id', global.uid('cmp'));
    g.setAttribute('data-label', 'VDD');

    const useEl = document.createElementNS(SVG_NS, 'use');
    useEl.setAttribute('href', '#power-bus-t');
    g.appendChild(useEl);

    const txtEl = document.createElementNS(SVG_NS, 'text');
    txtEl.setAttribute('class', 'vdd-label');
    txtEl.setAttribute('y', '-15');
    txtEl.setAttribute('text-anchor', 'middle');
    txtEl.setAttribute('font-family', 'sans-serif');
    txtEl.setAttribute('font-size', '12');
    txtEl.setAttribute('font-weight', 'bold');
    txtEl.textContent = 'VDD';
    g.appendChild(txtEl);

    const layer = document.getElementById('components-layer');
    if (layer) layer.appendChild(g);

    if (global.refreshNetTopology) global.refreshNetTopology();
    return g;
  }

  function createPassiveComponent(type, x, y) {
    x = global.clamp(global.snap(x), 50, global.WORLD_W - 50);
    y = global.clamp(global.snap(y), 50, global.WORLD_H - 50);

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'generic-component passive-component');
    g.setAttribute('transform', `translate(${x} ${y})`);
    g.setAttribute('data-id', global.uid('cmp'));
    g.setAttribute('data-type', type);
    g.setAttribute('data-label', type.toUpperCase()[0]);
    g.setAttribute('data-rotate', '0');

    const useEl = document.createElementNS(SVG_NS, 'use');
    useEl.setAttribute('href', `#${type}`);
    useEl.setAttribute('transform', 'rotate(0)');
    g.appendChild(useEl);

    const txtEl = document.createElementNS(SVG_NS, 'text');
    txtEl.setAttribute('class', 'passive-label');
    txtEl.setAttribute('x', '0');
    txtEl.setAttribute('y', '-15');
    txtEl.setAttribute('text-anchor', 'middle');
    txtEl.setAttribute('font-family', 'sans-serif');
    txtEl.setAttribute('font-size', '12');
    txtEl.setAttribute('font-weight', 'bold');
    txtEl.textContent = type.toUpperCase()[0];
    g.appendChild(txtEl);

    const layer = document.getElementById('components-layer');
    if (layer) layer.appendChild(g);

    if (global.refreshNetTopology) global.refreshNetTopology();
    return g;
  }

  // Expose
  global.createComponent  = createComponent;
  global.createGndComponent = createGndComponent;
  global.createVddComponent = createVddComponent;
  global.createPassiveComponent = createPassiveComponent;
  global.updateComponent  = updateComponent;
  global.deleteComponent  = deleteComponent;
  global.readLabels       = readLabels;
  global.readLabelTop     = readLabelTop;
  global.readLabelBottom  = readLabelBottom;
  global.readOrigin       = readOrigin;
  global.setOrigin        = setOrigin;
  global.getRows          = getRows;
  global.getWidth         = getWidth;
})(typeof window !== 'undefined' ? window : globalThis);
