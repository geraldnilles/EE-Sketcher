/* =====================================================================
   net-factory.js
   Pure factory functions that create SVG DOM elements for nets.
   No side-effects, no topology logic.
   ===================================================================== */

import { uid } from '../state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---- line element ---- */

/**
 * Create a bare <line> element with the net-line class and a data-id.
 * Caller is responsible for appending it to the DOM.
 */
export function newLineEl(x1, y1, x2, y2, idOpt) {
  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('class', 'net-line');
  ln.setAttribute('x1', String(x1));
  ln.setAttribute('y1', String(y1));
  ln.setAttribute('x2', String(x2));
  ln.setAttribute('y2', String(y2));
  if (idOpt) ln.setAttribute('data-id', idOpt);
  else       ln.setAttribute('data-id', uid('net'));
  return ln;
}

/* ---- endpoint hit-target ---- */

/**
 * Create a small rect that acts as a drag handle for one endpoint.
 * The rect is a SIBLING of the line (not a child) because <line>
 * elements cannot have rendered children per the SVG spec.
 *
 * @param {SVGLineElement} line  parent line (used to read coords & data-id)
 * @param {'start'|'end'}  which
 * @returns {SVGRectElement}
 */
export function newEndpointHit(line, which) {
  const SIZE = 14;
  const x = (which === 'start') ? +line.getAttribute('x1') : +line.getAttribute('x2');
  const y = (which === 'start') ? +line.getAttribute('y1') : +line.getAttribute('y2');
  const netId = line.getAttribute('data-id');
  const r = document.createElementNS(SVG_NS, 'rect');
  r.setAttribute('class', 'endpoint-hit');
  r.setAttribute('x', String(x - SIZE / 2));
  r.setAttribute('y', String(y - SIZE / 2));
  r.setAttribute('width',  String(SIZE));
  r.setAttribute('height', String(SIZE));
  r.setAttribute('data-endpoint', which);
  r.setAttribute('data-net-id', netId);
  return r;
}

/**
 * Find the endpoint-hit rect for a given line and endpoint.
 * @param {SVGLineElement} line
 * @param {'start'|'end'} which
 * @returns {SVGRectElement|null}
 */
export function findEndpointHit(line, which) {
  const netId = line.getAttribute('data-id');
  if (!netId) return null;
  const layer = document.getElementById('nets-layer');
  if (!layer) return null;
  return layer.querySelector(
    `rect.endpoint-hit[data-net-id="${netId}"][data-endpoint="${which}"]`
  );
}

/**
 * Find both endpoint-hit rects for a given line.
 * @param {SVGLineElement} line
 * @returns {SVGRectElement[]}
 */
export function findAllEndpointHits(line) {
  const netId = line.getAttribute('data-id');
  if (!netId) return [];
  const layer = document.getElementById('nets-layer');
  if (!layer) return [];
  return Array.from(layer.querySelectorAll(
    `rect.endpoint-hit[data-net-id="${netId}"]`
  ));
}
