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
    if (g.classList.contains('gnd-component') || g.classList.contains('vdd-component') || g.classList.contains('comment-component') || g.classList.contains('container-component')) {
      return;
    }

    if (g.classList.contains('passive-component')) {
      const o = readOrigin(g);
      const rot = g.getAttribute('data-rotate') || '0';

      // Read actual pin offsets from the <defs> template so the bounding
      // rect adapts to any symbol, not just the old 100-wide defaults.
      const type = g.getAttribute('data-type') || '';
      const defEl = type ? document.getElementById(type) : null;
      let p1x = -50, p1y = 0, p2x = 50, p2y = 0;
      if (defEl) {
        const a = (defEl.getAttribute('data-pin1') || '-50,0').split(',');
        const b = (defEl.getAttribute('data-pin2') || '50,0').split(',');
        p1x = parseInt(a[0], 10) || -50;  p1y = parseInt(a[1], 10) || 0;
        p2x = parseInt(b[0], 10) || 50;   p2y = parseInt(b[1], 10) || 0;
      }

      const MARGIN = 15;  // body thickness perpendicular to the pin axis

      // Determine the long (pin-to-pin) axis and build a bounding rect.
      let rx, ry, rw, rh;
      if (rot === '90') {
        // Symbol is rotated 90° — swap the axis roles.
        if (p1y === p2y) {
          // Pins originally on a horizontal line → after rotation they're vertical.
          ry = Math.min(p1x, p2x);
          rh = Math.abs(p2x - p1x);
          rx = p1y - MARGIN;
          rw = 2 * MARGIN;
        } else {
          // Pins originally on a vertical line → after rotation they're horizontal.
          rx = Math.min(p1y, p2y);
          rw = Math.abs(p2y - p1y);
          ry = p1x - MARGIN;
          rh = 2 * MARGIN;
        }
      } else {
        // Normal (0°) orientation.
        if (p1y === p2y) {
          // Horizontal pins.
          rx = Math.min(p1x, p2x);
          rw = Math.abs(p2x - p1x);
          ry = p1y - MARGIN;
          rh = 2 * MARGIN;
        } else {
          // Vertical pins.
          ry = Math.min(p1y, p2y);
          rh = Math.abs(p2y - p1y);
          rx = p1x - MARGIN;
          rw = 2 * MARGIN;
        }
      }

      out.push({ x: o.x + rx, y: o.y + ry, w: rw, h: rh, el: g });
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
