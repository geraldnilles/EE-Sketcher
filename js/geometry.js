/* =====================================================================
   geometry.js
   Shared math & coordinate utilities.  Zero framework dependencies.
   ===================================================================== */

import { readOrigin } from './components.js';

/* ---- coordinate helpers ---- */

/** Format (x,y) into a stable string key. */
export function endpointsKey(x, y) {
  return x + ',' + y;
}

/** True when the line is strictly horizontal or vertical. */
export function isOrtho(x1, y1, x2, y2) {
  return (x1 === x2) || (y1 === y2);
}

/** Open overlap in one dimension: intervals (a,b) and (c,d) share an interior point. */
export function openOverlap1D(a, b, c, d) {
  const lo = Math.max(Math.min(a, b), Math.min(c, d));
  const hi = Math.min(Math.max(a, b), Math.max(c, d));
  return hi > lo;
}

/** Shortest distance from point (px,py) to finite segment (x1,y1)-(x2,y2). */
export function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = px - x1, ey = py - y1;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = x1 + t * dx, cy = y1 + t * dy;
  const ex = px - cx, ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

/* ---- component hit-test rectangles ---- */

/**
 * Walk the components layer and return an array of bounding rects
 * used by net-drawing validation.  Ground / Vdd symbols are skipped
 * so nets can cross them freely.
 */
export function getComponentRects() {
  const layer = document.getElementById('components-layer');
  if (!layer) return [];

  const out = [];
  layer.querySelectorAll('g.generic-component').forEach((g) => {
    // power references are ignored by the net validator
    if (g.classList.contains('gnd-component') || g.classList.contains('vdd-component')) {
      return;
    }

    if (g.classList.contains('passive-component')) {
      const o = readOrigin(g);
      const rot = g.getAttribute('data-rotate') || '0';
      if (rot === '90') {
        out.push({ x: o.x - 15, y: o.y - 50, w: 30, h: 100, el: g });
      } else {
        out.push({ x: o.x - 50, y: o.y - 15, w: 100, h: 30, el: g });
      }
      return;
    }

    // generic block component
    const o = readOrigin(g);
    const w   = parseInt(g.getAttribute('data-width') || '100', 10);
    const rows = parseInt(g.getAttribute('data-rows')  || '1',   10);
    out.push({
      x: o.x,
      y: o.y - 25,                     // rect extends above the origin
      w: w,
      h: (rows + 1) * 25,
      el: g,
    });
  });
  return out;
}
