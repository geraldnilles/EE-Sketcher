/* =====================================================================
   nets.js
   Line net CRUD, splitting on T-junctions, junction-dot heuristic.
   ===================================================================== */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const GRID   = global.GRID;

  /* ---------- coordinate utilities ---------- */
  function isOrtho(x1, y1, x2, y2) {
    return (x1 === x2) || (y1 === y2);
  }
  function endpointsKey(x, y) { return x + ',' + y; }

  function newLineEl(x1, y1, x2, y2, idOpt) {
    const ln = document.createElementNS(SVG_NS, 'line');
    ln.setAttribute('class', 'net-line');
    ln.setAttribute('x1', String(x1));
    ln.setAttribute('y1', String(y1));
    ln.setAttribute('x2', String(x2));
    ln.setAttribute('y2', String(y2));
    ln.setAttribute('stroke', '#000000');
    ln.setAttribute('stroke-width', '2');
    ln.setAttribute('stroke-linecap', 'square');
    if (idOpt) ln.setAttribute('data-id', idOpt);
    else       ln.setAttribute('data-id', global.uid('net'));
    return ln;
  }

  function newEndpointHit(line, which) {
    // 14×14 hit target centered on the endpoint
    const SIZE = 14;
    const x = (which === 'start') ? +line.getAttribute('x1') : +line.getAttribute('x2');
    const y = (which === 'start') ? +line.getAttribute('y1') : +line.getAttribute('y2');
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('class', 'endpoint-hit');
    r.setAttribute('x', String(x - SIZE / 2));
    r.setAttribute('y', String(y - SIZE / 2));
    r.setAttribute('width',  String(SIZE));
    r.setAttribute('height', String(SIZE));
    r.setAttribute('data-endpoint', which);
    return r;
  }

/* ---------- net-overlap / component-overlap validation ---------- */

  /**
   * Compute axis-aligned bounding rects of every component in world space.
   * Returns [{ x, y, w, h, el }, ...]
   *   rect.x = component origin x
   *   rect.y = component origin y - 25   (rect is drawn at y=-25 relative to origin)
   *   rect.w = data-width
   *   rect.h = (data-rows + 1) * 25
   */
  function getComponentRects() {
    const layer = document.getElementById('components-layer');
    if (!layer) return [];
    const out = [];
    layer.querySelectorAll('g.generic-component').forEach((g) => {
      const o = global.readOrigin(g);
      const w = parseInt(g.getAttribute('data-width') || '100', 10);
      const rows = parseInt(g.getAttribute('data-rows') || '1', 10);
      out.push({
        x: o.x,
        y: o.y - 25,
        w: w,
        h: (rows + 1) * 25,
        el: g,
      });
    });
    return out;
  }

  /**
   * Open-interval overlap of two 1D segments [a,b] and [c,d].
   * Returns true if the segments overlap with strictly-positive length
   * (i.e. a shared interior point exists).  Equal endpoints are NOT
   * considered overlap (those are T-junctions and are allowed).
   */
  function openOverlap1D(a, b, c, d) {
    const lo = Math.max(Math.min(a, b), Math.min(c, d));
    const hi = Math.min(Math.max(a, b), Math.max(c, d));
    return hi > lo; // strictly positive length
  }

  /**
   * Does the proposed new line overlap an existing net colinearly with
   * positive length?  Orthogonal crossings (one horiz, one vert) are
   * allowed and return false.  Endpoint-only touches (T-junctions) are
   * also allowed and return false.
   *
   * 'exclude' may be an existing <line> element to skip (e.g. when this
   * check is being re-run on a line that has just been edited).
   */
  function lineOverlapsNet(x1, y1, x2, y2, exclude) {
    if (x1 !== x2 && y1 !== y2) return false; // not even ortho
    const layer = document.getElementById('nets-layer');
    if (!layer) return false;
    const lines = layer.querySelectorAll('line.net-line');
    for (const ln of lines) {
      if (exclude && ln === exclude) continue;
      const ex1 = +ln.getAttribute('x1'), ey1 = +ln.getAttribute('y1');
      const ex2 = +ln.getAttribute('x2'), ey2 = +ln.getAttribute('y2');
      if (y1 === y2 && ey1 === ey2 && y1 === ey1) {
        // both horizontal, same y
        if (openOverlap1D(x1, x2, ex1, ex2)) return true;
      } else if (x1 === x2 && ex1 === ex2 && x1 === ex1) {
        // both vertical, same x
        if (openOverlap1D(y1, y2, ey1, ey2)) return true;
      }
    }
    return false;
  }

  /**
   * Does the proposed new line collide with any component rect?
   *  - 'Touches the border or interior with positive-length overlap' is
   *    a violation.  An endpoint landing exactly on a border is allowed
   *    (this is how a user attaches a wire to a pin).
   *  - For a horizontal line at y from x1..x2 vs rect (rx,ry,rw,rh):
   *      - if y is on [ry, ry+rh] AND the x-intervals overlap with
   *        positive length, then violation.
   *  - Symmetric for vertical lines.
   */
  function lineHitsComponent(x1, y1, x2, y2) {
    if (x1 !== x2 && y1 !== y2) return false; // non-ortho, can't draw
    const rects = getComponentRects();
    for (const r of rects) {
      const rTop    = r.y;
      const rBottom = r.y + r.h;
      const rLeft   = r.x;
      const rRight  = r.x + r.w;
      if (y1 === y2) {
        // horizontal
        if (y1 >= rTop && y1 <= rBottom) {
          // y touches or is inside vertical extent of rect
          if (openOverlap1D(x1, x2, rLeft, rRight)) return true;
        }
      } else {
        // vertical
        if (x1 >= rLeft && x1 <= rRight) {
          if (openOverlap1D(y1, y2, rTop, rBottom)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Top-level validator for a freshly-snapped line.  Returns
   *   { ok: true }                            - all clear
   *   { ok: false, reason: 'overlap' }        - collinear overlap with existing net
   *   { ok: false, reason: 'component' }      - overlaps a component rect/border
   *
   * The caller is expected to have already snap()'d and ortho-checked
   * the coordinates.  This function only enforces the "no overlap" rule
   * described in the product spec.
   */
  function validateNewLine(x1, y1, x2, y2, opts) {
    opts = opts || {};
    if (lineOverlapsNet(x1, y1, x2, y2, opts.exclude)) {
      return { ok: false, reason: 'overlap' };
    }
    if (lineHitsComponent(x1, y1, x2, y2)) {
      return { ok: false, reason: 'component' };
    }
    return { ok: true };
  }


  /**
   * createLine(x1, y1, x2, y2)
   * Snaps to grid, requires ortho and non-zero length.
   * Returns the new <line> element, or null if rejected.
   */
  function createLine(x1, y1, x2, y2) {
    x1 = global.snap(x1); y1 = global.snap(y1);
    x2 = global.snap(x2); y2 = global.snap(y2);
    if (x1 === x2 && y1 === y2) return null;       // zero-length
    if (!isOrtho(x1, y1, x2, y2)) return null;      // enforce ortho

    // Reject if the new line would overlap an existing net or a
    // component rect/border.  The product spec says overlap is never
    // allowed; only orthogonal crossings and T-junction terminations
    // are permitted.
    const valid = validateNewLine(x1, y1, x2, y2);
    if (!valid.ok) return null;

    const layer = document.getElementById('nets-layer');
    if (!layer) return null;

    const ln = newLineEl(x1, y1, x2, y2);
    layer.appendChild(ln);

    // Splits: if either endpoint lands strictly in the interior of an
    // existing line, split that line.
    splitLineAt(x1, y1);
    splitLineAt(x2, y2);

    // Endpoint hit targets for drag-mode interaction
    ln.appendChild(newEndpointHit(ln, 'start'));
    ln.appendChild(newEndpointHit(ln, 'end'));

    recomputeJunctions();
    return ln;
  }

  /** deleteLine(lineEl) — remove from DOM, then recompute junctions. */
  function deleteLine(lineEl) {
    if (!lineEl) return;
    if (lineEl === global.appState.selected) global.appState.selected = null;
    lineEl.remove();
    recomputeJunctions();
    global.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
  }

  /**
   * splitLineAt(x, y)
   * If (x,y) lies strictly in the INTERIOR of an existing line's segment,
   * replace that line with two new lines that share (x,y) as their
   * meeting point. Preserves the original data-id on one half.
   *
   * Returns the number of splits performed.
   */
  function splitLineAt(x, y) {
    const layer = document.getElementById('nets-layer');
    if (!layer) return 0;
    const lines = Array.from(layer.querySelectorAll('line.net-line'));
    let splits = 0;

    for (const ln of lines) {
      const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
      const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');

      // Must lie strictly inside (not at endpoints)
      if (!pointOnSegmentInterior(x, y, x1, y1, x2, y2)) continue;

      const origId = ln.getAttribute('data-id');
      ln.remove();

      // Half A: from (x1,y1) → (x,y)
      const a = newLineEl(x1, y1, x, y, origId);
      a.appendChild(newEndpointHit(a, 'start'));
      a.appendChild(newEndpointHit(a, 'end'));
      layer.appendChild(a);

      // Half B: from (x,y) → (x2,y2), with a fresh id
      const b = newLineEl(x, y, x2, y2, null);
      b.appendChild(newEndpointHit(b, 'start'));
      b.appendChild(newEndpointHit(b, 'end'));
      layer.appendChild(b);

      splits++;
    }
    return splits;
  }

  /** Is (px,py) strictly on the open segment (x1,y1)-(x2,y2)?  */
  function pointOnSegmentInterior(px, py, x1, y1, x2, y2) {
    if (x1 === x2) {
      // vertical
      if (px !== x1) return false;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      return py > lo && py < hi;
    }
    if (y1 === y2) {
      // horizontal
      if (py !== y1) return false;
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      return px > lo && px < hi;
    }
    return false;
  }

  /**
   * recomputeJunctions()
   * For each unique coordinate with 3 or 4 line endpoints, ensure a
   * <circle class="junction"> exists. For coords with 2 or fewer
   * endpoints, ensure no such circle exists.
   */
  function recomputeJunctions() {
    const layer   = document.getElementById('nets-layer');
    const jlayer  = document.getElementById('junctions-layer');
    if (!layer || !jlayer) return;

    // Count endpoints by coordinate
    const counts = new Map();
    layer.querySelectorAll('line.net-line').forEach((ln) => {
      const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
      const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');
      addCount(counts, x1, y1);
      addCount(counts, x2, y2);
    });

    // Reconcile circles
    const existing = new Map();
    jlayer.querySelectorAll('circle.junction').forEach((c) => {
      existing.set(c.getAttribute('data-coord'), c);
    });

    // Track which coords are needed
    const needed = new Set();

    counts.forEach((n, key) => {
      if (n === 3 || n === 4) {
        needed.add(key);
        const [x, y] = key.split(',').map(Number);
        let c = existing.get(key);
        if (!c) {
          c = document.createElementNS(SVG_NS, 'circle');
          c.setAttribute('class', 'junction');
          c.setAttribute('r', '4');
          c.setAttribute('cx', String(x));
          c.setAttribute('cy', String(y));
          c.setAttribute('data-coord', key);
          jlayer.appendChild(c);
        } else {
          // Refresh position defensively
          c.setAttribute('cx', String(x));
          c.setAttribute('cy', String(y));
          existing.delete(key);
        }
      }
    });

    // Any leftover existing circles are now stale
    existing.forEach((c) => c.remove());
  }

  function addCount(map, x, y) {
    const k = endpointsKey(x, y);
    map.set(k, (map.get(k) || 0) + 1);
  }

  /** Read coords from a line element. */
  function readLineCoords(line) {
    return {
      x1: +line.getAttribute('x1'), y1: +line.getAttribute('y1'),
      x2: +line.getAttribute('x2'), y2: +line.getAttribute('y2'),
    };
  }

  /** Update one endpoint of a line, keeping it orthogonal. */
  function setEndpoint(line, which, x, y) {
    if (which !== 'start' && which !== 'end') return;
    x = global.snap(x); y = global.snap(y);
    const c = readLineCoords(line);
    if (which === 'start') { c.x1 = x; c.y1 = y; }
    else                   { c.x2 = x; c.y2 = y; }
    // Enforce orthogonality: snap the moving axis by collapsing to the
    // dominant delta; collapse to whichever non-moving endpoint's coord
    // is closer in grid units.
    if (c.x1 !== c.x2 && c.y1 !== c.y2) {
      // Pick dominant axis by absolute delta
      const dx = Math.abs(c.x2 - c.x1), dy = Math.abs(c.y2 - c.y1);
      if (dx >= dy) { /* keep x as is, snap y to the other endpoint y */ if (which === 'start') c.y1 = c.y2; else c.y2 = c.y1; }
      else          { if (which === 'start') c.x1 = c.x2; else c.x2 = c.x1; }
    }
    line.setAttribute('x1', String(c.x1));
    line.setAttribute('y1', String(c.y1));
    line.setAttribute('x2', String(c.x2));
    line.setAttribute('y2', String(c.y2));
    // Move hit-rect
    const hit = line.querySelector(`rect.endpoint-hit[data-endpoint="${which}"]`);
    if (hit) {
      const SIZE = 14;
      hit.setAttribute('x', String((which === 'start' ? c.x1 : c.x2) - SIZE / 2));
      hit.setAttribute('y', String((which === 'start' ? c.y1 : c.y2) - SIZE / 2));
    }
  }

  /** When moving an endpoint of a horizontal line vertically,
   *  shift the whole line along that axis. (And vice versa for vertical.) */
  function shiftLineForEndpointDrag(line, which, x, y) {
    x = global.snap(x); y = global.snap(y);
    const c = readLineCoords(line);
    const dx = c.x2 - c.x1, dy = c.y2 - c.y1;
    const isHoriz = dy === 0;
    const isVert  = dx === 0;
    if (!isHoriz && !isVert) return; // already non-ortho; nothing to do

    if (isHoriz) {
      // The "parallel axis" rule: dragging an endpoint vertically
      // shifts BOTH endpoints together.
      const newY = y;
      if (which === 'start') { c.y1 = newY; c.y2 = newY; }
      else                   { c.y1 = newY; c.y2 = newY; }
    } else if (isVert) {
      const newX = x;
      if (which === 'start') { c.x1 = newX; c.x2 = newX; }
      else                   { c.x1 = newX; c.x2 = newX; }
    }
    line.setAttribute('x1', String(c.x1));
    line.setAttribute('y1', String(c.y1));
    line.setAttribute('x2', String(c.x2));
    line.setAttribute('y2', String(c.y2));
    // Move hit-rects
    line.querySelectorAll('rect.endpoint-hit').forEach((h) => {
      const SIZE = 14;
      const which2 = h.getAttribute('data-endpoint');
      const hx = (which2 === 'start') ? c.x1 : c.x2;
      const hy = (which2 === 'start') ? c.y1 : c.y2;
      h.setAttribute('x', String(hx - SIZE / 2));
      h.setAttribute('y', String(hy - SIZE / 2));
    });
  }

  /**
   * distancePointToSegment(px, py, x1, y1, x2, y2)
   * Perpendicular distance from (px,py) to the line segment (x1,y1)-(x2,y2),
   * in SVG user units.  For axis-aligned (ortho) segments, this collapses to
   * the simple |Δ| form, which is what we need.
   */
  function distancePointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) {
      // Degenerate zero-length segment
      const ex = px - x1, ey = py - y1;
      return Math.sqrt(ex * ex + ey * ey);
    }
    // For purely-ortho segments (which is all we draw) this is exact; in the
    // general case this is the squared projection parameter clamped to [0,1].
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = x1 + t * dx, cy = y1 + t * dy;
    const ex = px - cx, ey = py - cy;
    return Math.sqrt(ex * ex + ey * ey);
  }

  /**
   * findLineNearPoint(px, py, tolerance)
   * Returns the closest .net-line whose perpendicular distance to (px,py)
   * is <= tolerance, or null if none qualify.  Tolerance is in SVG user
   * units, so it scales with zoom (giving tighter hits when zoomed in,
   * which matches user expectations).
   */
  function findLineNearPoint(px, py, tolerance) {
    const layer = document.getElementById('nets-layer');
    if (!layer) return null;
    const lines = layer.querySelectorAll('line.net-line');
    let best = null;
    let bestDist = Infinity;
    for (const ln of lines) {
      const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
      const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');
      const d = distancePointToSegment(px, py, x1, y1, x2, y2);
      if (d <= tolerance && d < bestDist) {
        bestDist = d;
        best = ln;
      }
    }
    return best;
  }

  // Expose
  global.createLine        = createLine;
  global.deleteLine        = deleteLine;
  global.splitLineAt       = splitLineAt;
  global.recomputeJunctions = recomputeJunctions;
  global.readLineCoords    = readLineCoords;
  global.setEndpoint       = setEndpoint;
  global.shiftLineForEndpointDrag = shiftLineForEndpointDrag;
  global.isOrtho           = isOrtho;
  global.findLineNearPoint  = findLineNearPoint;
  global.validateNewLine    = validateNewLine;
  global.lineOverlapsNet    = lineOverlapsNet;
  global.lineHitsComponent  = lineHitsComponent;
  global.getComponentRects  = getComponentRects;
})(typeof window !== 'undefined' ? window : globalThis);
