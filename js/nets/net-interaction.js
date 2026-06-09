/* =====================================================================
   net-interaction.js
   Read / write line geometry, hit-test helpers, and drag utilities.
   ===================================================================== */

import { snap, clamp } from '../state.js';
import { WORLD_W, WORLD_H } from '../viewport.js';
import { findEndpointHit, findAllEndpointHits } from './net-factory.js';

/* ---- DOM readers ---- */

/** Return a plain { x1, y1, x2, y2 } object from a <line> element. */
export function readLineCoords(line) {
  return {
    x1: +line.getAttribute('x1'), y1: +line.getAttribute('y1'),
    x2: +line.getAttribute('x2'), y2: +line.getAttribute('y2'),
  };
}

/* ---- DOM writers (snap + clamp built in) ---- */

/**
 * Move one endpoint of a line.  If the result would be diagonal,
 * choose the shorter axis.  Also repositions the hit-target rect.
 */
export function setEndpoint(line, which, x, y) {
  if (which !== 'start' && which !== 'end') return;
  x = snap(x); y = snap(y);
  x = clamp(x, 0, WORLD_W);
  y = clamp(y, 0, WORLD_H);
  const c = readLineCoords(line);
  if (which === 'start') { c.x1 = x; c.y1 = y; }
  else                   { c.x2 = x; c.y2 = y; }
  if (c.x1 !== c.x2 && c.y1 !== c.y2) {
    const dx = Math.abs(c.x2 - c.x1), dy = Math.abs(c.y2 - c.y1);
    if (dx >= dy) { if (which === 'start') c.y1 = c.y2; else c.y2 = c.y1; }
    else          { if (which === 'start') c.x1 = c.x2; else c.x2 = c.x1; }
  }
  line.setAttribute('x1', String(c.x1));
  line.setAttribute('y1', String(c.y1));
  line.setAttribute('x2', String(c.x2));
  line.setAttribute('y2', String(c.y2));

  // Reposition the sibling endpoint-hit rect
  const hit = findEndpointHit(line, which);
  if (hit) {
    const SIZE = 14;
    hit.setAttribute('x', String((which === 'start' ? c.x1 : c.x2) - SIZE / 2));
    hit.setAttribute('y', String((which === 'start' ? c.y1 : c.y2) - SIZE / 2));
  }
}

/**
 * Drag-move handler that enforces orthogonality during a drag.
 * If the line is horizontal, both Ys change; if vertical, both Xs.
 */
export function shiftLineForEndpointDrag(line, which, x, y) {
  // Reshape the line by moving only the dragged endpoint,
  // enforcing orthogonality. Same logic as setEndpoint.
  x = snap(x); y = snap(y);
  x = clamp(x, 0, WORLD_W);
  y = clamp(y, 0, WORLD_H);
  const c = readLineCoords(line);
  // Move the dragged endpoint
  if (which === 'start') { c.x1 = x; c.y1 = y; }
  else                   { c.x2 = x; c.y2 = y; }
  // Enforce orthogonality: pick the shorter axis deviation
  if (c.x1 !== c.x2 && c.y1 !== c.y2) {
    const dx = Math.abs(c.x2 - c.x1), dy = Math.abs(c.y2 - c.y1);
    if (dx >= dy) {
      if (which === 'start') c.y1 = c.y2;
      else                   c.y2 = c.y1;
    } else {
      if (which === 'start') c.x1 = c.x2;
      else                   c.x2 = c.x1;
    }
  }
  line.setAttribute('x1', String(c.x1));
  line.setAttribute('y1', String(c.y1));
  line.setAttribute('x2', String(c.x2));
  line.setAttribute('y2', String(c.y2));

  // Reposition sibling endpoint-hit rects
  findAllEndpointHits(line).forEach((h) => {
    const SIZE = 14;
    const which2 = h.getAttribute('data-endpoint');
    const hx = (which2 === 'start') ? c.x1 : c.x2;
    const hy = (which2 === 'start') ? c.y1 : c.y2;
    h.setAttribute('x', String(hx - SIZE / 2));
    h.setAttribute('y', String(hy - SIZE / 2));
  });
}

/* ---- hit-test geometry ---- */

/** Shortest distance from a point to a finite line segment. */
export function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = px - x1, ey = py - y1;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = x1 + t * dx, cy = y1 + t * dy;
  const ex = px - cx, ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Walk every <line.net-line> and return the closest one within
 * `tolerance` pixels of (px, py).  Returns null if nothing is near.
 */
export function findLineNearPoint(px, py, tolerance) {
  const layer = document.getElementById('nets-layer');
  if (!layer) return null;
  const lines = layer.querySelectorAll('line.net-line');
  let best = null, bestDist = Infinity;
  for (const ln of lines) {
    const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
    const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');
    const d = distancePointToSegment(px, py, x1, y1, x2, y2);
    if (d <= tolerance && d < bestDist) { bestDist = d; best = ln; }
  }
  return best;
}
