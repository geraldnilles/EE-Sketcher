/* =====================================================================
   components.js
   Generic Block component: create / update / delete
   DOM = source of truth. No JSON model.
   ===================================================================== */

import { snap, clamp, uid, appState } from './state.js';
import { WORLD_W, WORLD_H } from './viewport.js';
import { refreshNetTopology } from './nets.js';

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
/**
 * appendComponentToLayer(g)
 *   Shared helper: appends a new component <g> element to the components
 *   layer and triggers a net-topology refresh.  Used by all four
 *   factory functions to avoid duplicated boilerplate.
 */
function appendComponentToLayer(g) {
  const layer = document.getElementById('components-layer');
  if (layer) layer.appendChild(g);
  if (refreshNetTopology) refreshNetTopology();
  return g;
}


/** Get the number of text lines in a comment component. */
export function getCommentLinesCount(el) {
  return parseInt(el.getAttribute('data-lines') || '1', 10);
}

/** Read all text lines from a comment component. */
export function readCommentLines(el) {
  const lines = [];
  const count = getCommentLinesCount(el);
  for (let i = 0; i < count; i++) {
    const t = el.querySelector(`text.comment-line[data-line-idx="${i}"]`);
    lines.push(t ? t.textContent : '');
  }
  return lines;
}

export function createComponent(x, y, width, rows) {
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
  x = clamp(snap(x), 0, WORLD_W - width);
  y = clamp(snap(y), 25, WORLD_H - rows * 25);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'generic-component');
  g.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
  g.setAttribute('data-id', uid('cmp'));

  // rect: y=-25 (per spec), height = (rows + 1) * 25
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('class', 'component-body');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '-25');
  rect.setAttribute('width',  String(width));
  rect.setAttribute('height', String((rows + 1) * 25));
  g.appendChild(rect);

  // Top label (centered above the rect)
  const topLabel = document.createElementNS(SVG_NS, 'text');
  topLabel.setAttribute('class', 'label-top');
  topLabel.setAttribute('x', String(width / 2));
  topLabel.setAttribute('y', '-35');
  topLabel.setAttribute('text-anchor', 'middle');
  topLabel.setAttribute('dominant-baseline', 'middle');
  topLabel.textContent = '';
  g.appendChild(topLabel);

  // Bottom label (centered below the rect)
  const bottomLabel = document.createElementNS(SVG_NS, 'text');
  bottomLabel.setAttribute('class', 'label-bottom');
  bottomLabel.setAttribute('x', String(width / 2));
  bottomLabel.setAttribute("y", String(rows * 25 + 10));
  bottomLabel.setAttribute('text-anchor', 'middle');
  bottomLabel.setAttribute('dominant-baseline', 'middle');
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

  return appendComponentToLayer(g);
}


/**
 * createContainerComponent(x, y)
 *   x, y : grid coords for the top-left corner of the container rect.
 * Returns the <g class="generic-component container-component"> element
 * which renders behind nets and components as a background grouping box.
 */
export function createContainerComponent(x, y) {
  x = clamp(snap(x), 0, WORLD_W - 200);
  y = clamp(snap(y), 0, WORLD_H - 150);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'generic-component container-component');
  g.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
  g.setAttribute('data-id', uid('cmp'));
  g.setAttribute('data-width', '200');
  g.setAttribute('data-height', '150');
  g.setAttribute('data-fill', '#ffffff');

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('class', 'component-body container-body');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '200');
  rect.setAttribute('height', '150');
  rect.style.fill = '#ffffff';
  g.appendChild(rect);

  // Top label (centered above the rect)
  const topLabel = document.createElementNS(SVG_NS, 'text');
  topLabel.setAttribute('class', 'label-top');
  topLabel.setAttribute('x', '100');
  topLabel.setAttribute('y', '-10');
  topLabel.setAttribute('text-anchor', 'middle');
  topLabel.setAttribute('dominant-baseline', 'middle');
  topLabel.textContent = '';
  g.appendChild(topLabel);

  // Bottom label (centered below the rect)
  const bottomLabel = document.createElementNS(SVG_NS, 'text');
  bottomLabel.setAttribute('class', 'label-bottom');
  bottomLabel.setAttribute('x', '100');
  bottomLabel.setAttribute('y', '160');
  bottomLabel.setAttribute('text-anchor', 'middle');
  bottomLabel.setAttribute('dominant-baseline', 'middle');
  bottomLabel.textContent = '';
  g.appendChild(bottomLabel);

  g.setAttribute('data-label-top', '');
  g.setAttribute('data-label-bottom', '');

  const layer = document.getElementById('containers-layer');
  if (layer) layer.appendChild(g);
  // Containers do NOT participate in net routing, so no refreshNetTopology() call.
  return g;
}

/**
 * createCommentComponent(x, y)
 *   x, y : grid coords for the top-left corner of the comment rect.
 * Returns the <g class="generic-component comment-component"> element.
 */
export function createCommentComponent(x, y) {
  x = clamp(snap(x), 0, WORLD_W - 150);
  y = clamp(snap(y), 25, WORLD_H - 25);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'generic-component comment-component');
  g.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
  g.setAttribute('data-id', uid('cmp'));
  g.setAttribute('data-lines', '1');

  // Background rect — a light gray annotation block with dashed borders
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('class', 'component-body comment-body');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', '150');
  rect.setAttribute('height', '25');
  g.appendChild(rect);

  // Initial empty text line
  const line = document.createElementNS(SVG_NS, 'text');
  line.setAttribute('class', 'comment-line');
  line.setAttribute('data-line-idx', '0');
  line.setAttribute('x', '5');
  line.setAttribute('y', '17');
  line.setAttribute('dominant-baseline', 'middle');
  line.textContent = 'Comment';
  g.appendChild(line);

  return appendComponentToLayer(g);
}

export function getRows(el) {
  return parseInt(el.getAttribute('data-rows') || '1', 10);
}
export function getWidth(el) {
  return parseInt(el.getAttribute('data-width') || '100', 10);
}
export function getHeight(el) {
  return parseInt(el.getAttribute('data-height') || '150', 10);
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
 * updatePassiveComponent(el, patch)
 *   Handles label and rotation updates for passive components
 *   (resistor, capacitor, inductor).  Called by updateComponent().
 */
function updatePassiveComponent(el, patch) {
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
        txtEl.setAttribute('x', '15');
        txtEl.setAttribute('y', '-15');
        txtEl.setAttribute('text-anchor', 'start');
      }
    }
  }
  if (refreshNetTopology) refreshNetTopology();
  if (patch.rotatePassive !== undefined && appState && appState.selected === el) {
    window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: el } }));
  }
}

/**
 * updateVddComponent(el, patch)
 *   Handles label updates for VDD power-bus components.
 *   Called by updateComponent().
 */
function updateVddComponent(el, patch) {
  if (typeof patch.labelVdd === 'string') {
    const txtEl = el.querySelector('text.vdd-label');
    if (txtEl) txtEl.textContent = patch.labelVdd;
    el.setAttribute('data-label', patch.labelVdd);
  }
  if (refreshNetTopology) refreshNetTopology();
}

/**
 * applyStructuralPatch(el, patch, rows, width)
 *   Applies expand / contract / addRow / removeRow mutations to a
 *   generic block component.  Handles pin-row reconciliation and
 *   SVG rect resizing.  Returns { rows, width, structuralChanged }.
 */
function applyStructuralPatch(el, patch, rows, width) {
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

  return { rows, width, structuralChanged };
}

/**
 * updateComponent(el, patch)
 */
export function updateComponent(el, patch) {
  if (!el || !el.classList.contains('generic-component')) return;
  if (!patch || typeof patch !== 'object') return;

  if (el.classList.contains('passive-component')) {
    updatePassiveComponent(el, patch);
    return;
  }

  if (el.classList.contains('vdd-component')) {
    updateVddComponent(el, patch);
    return;
  }

  if (el.classList.contains('comment-component')) {
    updateCommentComponent(el, patch);
    return;
  }

  if (el.classList.contains('container-component')) {
    updateContainerComponent(el, patch);
    return;
  }

  let rows  = getRows(el);
  let width = getWidth(el);
  const result = applyStructuralPatch(el, patch, rows, width);
  rows = result.rows;
  width = result.width;
  const structuralChanged = result.structuralChanged;

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

  if (refreshNetTopology) refreshNetTopology();

  if (structuralChanged && appState && appState.selected === el) {
    window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: el } }));
  }
}


/**
 * updateContainerComponent(el, patch)
 *   Handles size (expand/contract/expandVert/contractVert) and fillColor
 *   mutations for container components.  Called by updateComponent().
 */
function updateContainerComponent(el, patch) {
  let structuralChanged = false;

  const minWidth = 50, minHeight = 50;
  let width = parseInt(el.getAttribute('data-width') || '200', 10);
  let height = parseInt(el.getAttribute('data-height') || '150', 10);

  if (patch.expand) {
    width = Math.min(2000, width + 50);
    structuralChanged = true;
  }
  if (patch.contract) {
    width = Math.max(minWidth, width - 50);
    structuralChanged = true;
  }
  if (patch.expandVert) {
    height = Math.min(2000, height + 50);
    structuralChanged = true;
  }
  if (patch.contractVert) {
    height = Math.max(minHeight, height - 50);
    structuralChanged = true;
  }

  if (structuralChanged) {
    el.setAttribute('data-width', String(width));
    el.setAttribute('data-height', String(height));
    const rect = el.querySelector('rect.container-body');
    if (rect) {
      rect.setAttribute('width', String(width));
      rect.setAttribute('height', String(height));
    }
    // Reposition labels when size changes
    const topLabel = el.querySelector('text.label-top');
    if (topLabel) topLabel.setAttribute('x', String(width / 2));
    const bottomLabel = el.querySelector('text.label-bottom');
    if (bottomLabel) {
      bottomLabel.setAttribute('x', String(width / 2));
      bottomLabel.setAttribute('y', String(height + 10));
    }
  }

  // Label patches
  if (typeof patch.labelTop === 'string') {
    const topLabel = el.querySelector('text.label-top');
    if (topLabel) topLabel.textContent = patch.labelTop;
    el.setAttribute('data-label-top', patch.labelTop);
  }
  if (typeof patch.labelBottom === 'string') {
    const bottomLabel = el.querySelector('text.label-bottom');
    if (bottomLabel) bottomLabel.textContent = patch.labelBottom;
    el.setAttribute('data-label-bottom', patch.labelBottom);
  }

  if (typeof patch.fillColor === 'string') {
    el.setAttribute('data-fill', patch.fillColor);
    const rect = el.querySelector('rect.container-body');
    if (rect) rect.style.fill = patch.fillColor;
  }

  if (structuralChanged && appState && appState.selected === el) {
    window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: el } }));
  }
}

/**
 * updateCommentComponent(el, patch)
 *   Handles addLine / removeLine / lines mutations for comment components.
 */
function updateCommentComponent(el, patch) {
  let structuralChanged = false;

  if (patch.addLine) {
    structuralChanged = true;
    const lines = getCommentLinesCount(el) + 1;
    el.setAttribute('data-lines', String(lines));

    // Append new text element
    const newIdx = lines - 1;
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('class', 'comment-line');
    t.setAttribute('data-line-idx', String(newIdx));
    t.setAttribute('x', '5');
    t.setAttribute('y', String(newIdx * 25 + 17));
    t.setAttribute('dominant-baseline', 'middle');
    t.textContent = '';
    el.appendChild(t);

    // Resize background rect
    const rect = el.querySelector('rect.comment-body');
    if (rect) rect.setAttribute('height', String(lines * 25));
  }

  if (patch.removeLine) {
    structuralChanged = true;
    const current = getCommentLinesCount(el);
    if (current <= 1) return; // keep at least one line
    const newCount = current - 1;
    el.setAttribute('data-lines', String(newCount));

    // Remove text nodes with index >= newCount
    el.querySelectorAll('text.comment-line').forEach((t) => {
      const idx = parseInt(t.getAttribute('data-line-idx'), 10);
      if (idx >= newCount) t.remove();
    });

    // Resize background rect
    const rect = el.querySelector('rect.comment-body');
    if (rect) rect.setAttribute('height', String(newCount * 25));
  }

  if (Array.isArray(patch.lines)) {
    patch.lines.forEach((txt, i) => {
      const node = el.querySelector(`text.comment-line[data-line-idx="${i}"]`);
      if (node) node.textContent = String(txt);
    });
  }

  if (refreshNetTopology) refreshNetTopology();

  if (structuralChanged && appState && appState.selected === el) {
    window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: el } }));
  }
}

function makePin(side, row, x) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('class', `pin pin-${side === 'L' ? 'left' : 'right'}`);
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(row * 25));
  t.setAttribute('text-anchor', side === 'L' ? 'start' : 'end');
  t.setAttribute('dominant-baseline', 'middle');
  t.setAttribute('data-side', side);
  t.setAttribute('data-row',  String(row));
  t.textContent = defaultLabel(side, row);
  return t;
}

/** deleteComponent(el) — remove from DOM, clear selection, recompute junctions. */
export function deleteComponent(el) {
  if (!el) return;
  if (el === appState.selected) appState.selected = null;
  el.remove();
  if (refreshNetTopology) refreshNetTopology();
  window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
}

/** Read current labels back as { left: string[], right: string[] }. */
export function readLabels(el) {
  const left  = [];
  const right = [];
  const rows  = getRows(el);
  for (let i = 0; i < rows; i++) {
    const l = el.querySelector(`text.pin-left[data-row="${i}"]`);
    const r = el.querySelector(`text.pin-right[data-row="${i}"]`);
    left.push(l  ? l.textContent.trim()  : defaultLabel('L', i));
    right.push(r ? r.textContent.trim() : defaultLabel('R', i));
  }
  const topLabel = el.querySelector('text.label-top');
  const bottomLabel = el.querySelector('text.label-bottom');
  return {
    left, right,
    top: topLabel ? topLabel.textContent.trim() : '',
    bottom: bottomLabel ? bottomLabel.textContent.trim() : ''
  };
}

/** Read the top label text of a component. */
export function readLabelTop(el) {
  const t = el.querySelector('text.label-top');
  return t ? t.textContent.trim() : '';
}
/** Read the bottom label text of a component. */
export function readLabelBottom(el) {
  const t = el.querySelector('text.label-bottom');
  return t ? t.textContent.trim() : '';
}
/** Read the absolute top-left pin origin (in SVG units) of a component. */
export function readOrigin(el) {
  const m = /translate\(\s*(-?\d+)\s*,?\s*(-?\d+)\s*\)/.exec(el.getAttribute('transform') || '');
  if (m) return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
  return { x: 0, y: 0 };
}

export function setOrigin(el, x, y) {
  x = snap(x); y = snap(y);
  if (el.classList.contains('passive-component')) {
    x = clamp(x, 50, WORLD_W - 50);
    y = clamp(y, 50, WORLD_H - 50);
  } else if (el.classList.contains('gnd-component')) {
    x = clamp(x, 15, WORLD_W - 15);
    y = clamp(y, 0, WORLD_H - 25);
  } else if (el.classList.contains('vdd-component')) {
    x = clamp(x, 15, WORLD_W - 15);
    y = clamp(y, 30, WORLD_H); // Allows space for top label
  } else if (el.classList.contains('comment-component')) {
    const lines = getCommentLinesCount(el);
    x = clamp(x, 0, WORLD_W - 150);
    y = clamp(y, 25, WORLD_H - lines * 25);
  } else if (el.classList.contains('container-component')) {
    const w = parseInt(el.getAttribute('data-width') || '200', 10);
    const h = parseInt(el.getAttribute('data-height') || '150', 10);
    x = clamp(x, 0, WORLD_W - w);
    y = clamp(y, 0, WORLD_H - h);
  } else {
    // Clamp position so the entire component stays within the world bounds.
    // Rect spans x..x+width in X, and y-25..y+rows*25 in Y.
    const w = parseInt(el.getAttribute('data-width') || '100', 10);
    const rows = parseInt(el.getAttribute('data-rows') || '1', 10);
    x = clamp(x, 0, WORLD_W - w);
    y = clamp(y, 25, WORLD_H - rows * 25);
  }
  x = snap(x); y = snap(y);
  el.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
}

export function createGndComponent(x, y) {
  x = clamp(snap(x), 15, WORLD_W - 15);
  y = clamp(snap(y), 0, WORLD_H - 15);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'generic-component gnd-component');
  g.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
  g.setAttribute('data-id', uid('cmp'));

  const useEl = document.createElementNS(SVG_NS, 'use');
  useEl.setAttribute('href', '#gnd');
  g.appendChild(useEl);

  return appendComponentToLayer(g);
}

export function createVddComponent(x, y) {
  x = clamp(snap(x), 15, WORLD_W - 15);
  y = clamp(snap(y), 30, WORLD_H);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'generic-component vdd-component');
  g.setAttribute('transform', `translate(${snap(x)} ${snap(y)})`);
  g.setAttribute('data-id', uid('cmp'));
  g.setAttribute('data-label', 'VDD');

  const useEl = document.createElementNS(SVG_NS, 'use');
  useEl.setAttribute('href', '#power-bus-t');
  g.appendChild(useEl);

  const txtEl = document.createElementNS(SVG_NS, 'text');
  txtEl.setAttribute('class', 'vdd-label');
  txtEl.setAttribute('y', '-5');
  txtEl.setAttribute('text-anchor', 'middle');
  txtEl.textContent = 'VDD';
  g.appendChild(txtEl);

  return appendComponentToLayer(g);
}

export function createPassiveComponent(type, x, y) {
  x = clamp(snap(x), 50, WORLD_W - 50);
  y = clamp(snap(y), 50, WORLD_H - 50);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'generic-component passive-component');
  g.setAttribute('transform', `translate(${x} ${y})`);
  g.setAttribute('data-id', uid('cmp'));
  g.setAttribute('data-type', type);
  g.setAttribute('data-label', '');
  g.setAttribute('data-rotate', '0');

  const useEl = document.createElementNS(SVG_NS, 'use');
  useEl.setAttribute('href', `#${type}`);
  useEl.setAttribute('transform', 'rotate(0)');
  g.appendChild(useEl);

  const txtEl = document.createElementNS(SVG_NS, 'text');
  txtEl.setAttribute('class', 'passive-label');
  txtEl.setAttribute('x', '15');
  txtEl.setAttribute('y', '-15');
  txtEl.setAttribute('text-anchor', 'start');
  txtEl.textContent = '';
  g.appendChild(txtEl);

  return appendComponentToLayer(g);
}

/**
 * Duplicates a selected component or container element.
 * Copies all custom settings/labels and offsets the position by +25 units in X and Y.
 * Automatically selects the newly created duplicate element.
 * @param {SVGElement} el - The original component SVG element to copy.
 */
export function duplicateComponent(el) {
  if (!el || !el.classList.contains('generic-component')) return;

  // 1. Read current layout coordinates and shift position by one grid cell (+25 units)
  const o = readOrigin(el);
  const newX = o.x + 25;
  const newY = o.y + 25;
  let newEl = null;

  // 2. Branch duplication strategy based on component sub-class signatures
  if (el.classList.contains('gnd-component')) {
    // Ground Connection Symbol
    newEl = createGndComponent(newX, newY);

  } else if (el.classList.contains('vdd-component')) {
    // Power Bus Reference
    const label = el.getAttribute('data-label') || 'VDD';
    newEl = createVddComponent(newX, newY);
    updateComponent(newEl, { labelVdd: label });

  } else if (el.classList.contains('passive-component')) {
    // Passive Components (Resistors, Capacitors, Inductors, Diodes)
    const type = el.getAttribute('data-type');
    const label = el.getAttribute('data-label') || '';
    const rotate = parseInt(el.getAttribute('data-rotate') || '0', 10);
    newEl = createPassiveComponent(type, newX, newY);
    updateComponent(newEl, { labelPassive: label, rotatePassive: rotate });

  } else if (el.classList.contains('comment-component')) {
    // Text Comment Blocks
    const lines = readCommentLines(el);
    newEl = createCommentComponent(newX, newY);
    // Expand rows to accommodate line counts greater than the default baseline
    for (let i = 1; i < lines.length; i++) {
      updateComponent(newEl, { addLine: true });
    }
    updateComponent(newEl, { lines: lines });

  } else if (el.classList.contains('container-component')) {
    // Background Layer Grouping Container Boxes
    const labels = readLabels(el);
    const width = getWidth(el);
    const height = getHeight(el);
    const fill = el.getAttribute('data-fill') || '#ffffff';

    newEl = createContainerComponent(newX, newY);
    newEl.setAttribute('data-width', String(width));
    newEl.setAttribute('data-height', String(height));
    newEl.setAttribute('data-fill', fill);

    const rect = newEl.querySelector('rect.container-body');
    if (rect) {
      rect.setAttribute('width', String(width));
      rect.setAttribute('height', String(height));
      rect.style.fill = fill;
    }
    // Reposition labels to match the duplicated container dimensions
    const dupTopLabel = newEl.querySelector('text.label-top');
    if (dupTopLabel) dupTopLabel.setAttribute('x', String(width / 2));
    const dupBottomLabel = newEl.querySelector('text.label-bottom');
    if (dupBottomLabel) {
      dupBottomLabel.setAttribute('x', String(width / 2));
      dupBottomLabel.setAttribute('y', String(height + 10));
    }
    updateComponent(newEl, { labelTop: labels.top, labelBottom: labels.bottom });

  } else {
    // Standard Generic Multi-Pin IC Block Components
    const labels = readLabels(el);
    const width = getWidth(el);
    const rows = getRows(el);
    const isSecondary = el.getAttribute('data-secondary') === 'true';

    newEl = createComponent(newX, newY, width, rows);
    if (isSecondary) newEl.setAttribute('data-secondary', 'true');
    updateComponent(newEl, {
      labelTop: labels.top,
      labelBottom: labels.bottom,
      labelL: labels.left,
      labelR: labels.right
    });
  }

  // 3. Update the global application focus context if creation succeeded
  if (newEl) {
    document.querySelectorAll('.is-selected').forEach((e) => e.classList.remove('is-selected'));
    newEl.classList.add('is-selected');
    appState.selected = newEl;
    window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: newEl } }));
  }
}
