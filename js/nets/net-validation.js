/* =====================================================================
   net-validation.js
   Pure validation predicates for new net segments.  Stateless.
   ===================================================================== */

import { openOverlap1D, getComponentRects } from '../geometry.js';

/* ---- collision predicates ---- */

/**
 * True when the segment (x1,y1)-(x2,y2) overlaps an existing net segment.
 * @param {SVGLineElement} [exclude]  line to ignore (e.g., the one being edited)
 */
export function lineOverlapsNet(x1, y1, x2, y2, exclude) {
  if (x1 !== x2 && y1 !== y2) return false;
  const layer = document.getElementById('nets-layer');
  if (!layer) return false;
  const lines = layer.querySelectorAll('line.net-line');
  for (const ln of lines) {
    if (exclude && ln === exclude) continue;
    const ex1 = +ln.getAttribute('x1'), ey1 = +ln.getAttribute('y1');
    const ex2 = +ln.getAttribute('x2'), ey2 = +ln.getAttribute('y2');
    if (y1 === y2 && ey1 === ey2 && y1 === ey1) {
      if (openOverlap1D(x1, x2, ex1, ex2)) return true;
    } else if (x1 === x2 && ex1 === ex2 && x1 === ex1) {
      if (openOverlap1D(y1, y2, ey1, ey2)) return true;
    }
  }
  return false;
}

/** True when the segment passes through a component bounding rect. */
export function lineHitsComponent(x1, y1, x2, y2) {
  if (x1 !== x2 && y1 !== y2) return false;
  const rects = getComponentRects();
  for (const r of rects) {
    const rTop = r.y, rBottom = r.y + r.h;
    const rLeft = r.x, rRight = r.x + r.w;
    if (y1 === y2) {
      if (y1 >= rTop && y1 <= rBottom && openOverlap1D(x1, x2, rLeft, rRight)) return true;
    } else {
      if (x1 >= rLeft && x1 <= rRight && openOverlap1D(y1, y2, rTop, rBottom)) return true;
    }
  }
  return false;
}

/* ---- compound validator ---- */

/**
 * Return { ok, reason } for a candidate segment.
 */
export function validateNewLine(x1, y1, x2, y2, opts) {
  opts = opts || {};
  if (lineOverlapsNet(x1, y1, x2, y2, opts.exclude)) {
    return { ok: false, reason: 'overlap' };
  }
  if (lineHitsComponent(x1, y1, x2, y2)) {
    return { ok: false, reason: 'component' };
  }
  return { ok: true };
}
