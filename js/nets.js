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
    // Clamp both endpoints to stay within the world bounds.
    x1 = global.clamp(x1, 0, global.WORLD_W);
    y1 = global.clamp(y1, 0, global.WORLD_H);
    x2 = global.clamp(x2, 0, global.WORLD_W);
    y2 = global.clamp(y2, 0, global.WORLD_H);
    if (x1 === x2 && y1 === y2) return null;       // zero-length
    if (!isOrtho(x1, y1, x2, y2)) return null;      // enforce ortho

    // ----- "Extend" feature for connect mode -----
    // If either endpoint of the proposed segment is the FREE endpoint
    // of an existing collinear line, we absorb the new segment into
    // that existing line instead of creating a brand-new one.  This
    // is the "extend" UX: drawing a line off the end of an existing
    // line simply lengthens the existing line.
    //
    // We must check both endpoints BEFORE the overlap validator runs,
    // because the validator would otherwise (correctly) reject the new
    // line for overlapping the existing free endpoint.  The semantics
    // we want is: "yes, I know I overlap, the user means to extend."
    //
    // Two sub-cases:
    //   - both endpoints absorb into two different existing lines:
    //       bridge them, then mergeLines() collapses them into one
    //   - one endpoint absorbs: extend that line, no new segment
    //   - neither absorbs: fall through to the normal create path
    const extStart = findFreeCollinearExtension(x1, y1, x2, y2);
    const extEnd   = findFreeCollinearExtension(x2, y2, x1, y1);

    if (extStart && extEnd && extStart.line === extEnd.line) {
      // Pathological: a single line claims both endpoints of the new
      // segment as its own free endpoints.  That would mean the new
      // segment is identical to the line, which we already reject
      // (zero-length / overlap).  Just no-op.
      return null;
    }

    if (extStart && extEnd) {
      // Two different existing lines to bridge.  Extend each one to
      // the opposite end of the new segment, then mergeLines() will
      // fold the two now-touching segments into one.
      extendLineTo(extStart.line, extStart.side, x2, y2);
      extendLineTo(extEnd.line,   extEnd.side,   x1, y1);
      const n = mergeLines();
      recomputeJunctions();
      // Notify the sidebar in case either line was selected.
      global.dispatchEvent(new CustomEvent('selection-change', {
        detail: { selected: global.appState.selected }
      }));
      if (n > 0) {
        // Return the surviving merged line so callers (e.g. click
        // handler) can still highlight it if desired.
        return null; // callers don't actually use the return; we
                      // changed existing DOM, not created a new one.
      }
      return null;
    }

    if (extStart) {
      // Just extend the one line; the new segment is fully absorbed.
      extendLineTo(extStart.line, extStart.side, x2, y2);
      // After extending, the touching point (x1,y1) is no longer a
      // free endpoint of the existing line, so no merge can happen.
      recomputeJunctions();
      global.dispatchEvent(new CustomEvent('selection-change', {
        detail: { selected: global.appState.selected }
      }));
      return extStart.line;
    }

    if (extEnd) {
      extendLineTo(extEnd.line, extEnd.side, x1, y1);
      recomputeJunctions();
      global.dispatchEvent(new CustomEvent('selection-change', {
        detail: { selected: global.appState.selected }
      }));
      return extEnd.line;
    }

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

    // Heal: a freshly-created line can sit exactly on top of an
    // existing free endpoint.  After splits, the new line's endpoint
    // has count >= 2 (the new line + whatever was there).  If exactly
    // 2 and the existing line is collinear, merge them.  We always run
    // mergeLines() to be safe — it is a no-op when there is nothing to
    // merge.
    mergeLines();
    recomputeJunctions();
    return ln;
  }

  /** deleteLine(lineEl) — remove from DOM, heal any orphan splits, recompute junctions. */
  function deleteLine(lineEl) {
    if (!lineEl) return;
    if (lineEl === global.appState.selected) global.appState.selected = null;
    lineEl.remove();
    // Heal: deleting a line can drop a coord from 3 endpoints to 2
    // (a T-junction becoming a plain butt-join).  The heal pass
    // detects that and merges the two surviving collinear segments.
    mergeLines();
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
    // Clamp to stay within the world bounds.
    x = global.clamp(x, 0, global.WORLD_W);
    y = global.clamp(y, 0, global.WORLD_H);
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
    // Clamp to stay within the world bounds.
    x = global.clamp(x, 0, global.WORLD_W);
    y = global.clamp(y, 0, global.WORLD_H);
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


  /* =====================================================================
     Line merge / extension logic
     --------------------------------------------------------------------
     Heuristic: any grid coord with exactly 2 line endpoints coming from
     2 different lines is a "mergeable" junction — UNLESS one of those
     lines is horizontal and the other vertical, in which case it's a
     T-junction that must be preserved.

     The merge step is purely stateless: we look at the current DOM, find
     all mergeable pairs, apply them, then loop until no more merges are
     possible.  The same predicate that drives the heal-after-delete
     behaviour also powers the "extend" feature in connect mode: at create
     time we ask "is the proposed endpoint the FREE endpoint of an
     existing collinear line?" and if so we extend the existing line
     instead of creating a new segment.

     This keeps the wire topology clean: 2 collinear segments that meet
     end-to-end become 1 segment, and drawing a new line off the end of
     an existing line just lengthens the existing one.
     ===================================================================== */

  /**
   * Build a map: coord-string "{x},{y}" -> array of { line, side }
   *   side is 'start' or 'end' (the endpoint role in the line).
   * Reads directly from the DOM, so the result is always in sync with
   * the actual current state.
   */
  function buildEndpointMap() {
    const layer = document.getElementById('nets-layer');
    const map = new Map();
    if (!layer) return map;
    layer.querySelectorAll('line.net-line').forEach((ln) => {
      const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
      const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');
      // Skip degenerate zero-length lines defensively
      if (x1 === x2 && y1 === y2) return;
      const k1 = endpointsKey(x1, y1);
      if (!map.has(k1)) map.set(k1, []);
      map.get(k1).push({ line: ln, side: 'start' });
      const k2 = endpointsKey(x2, y2);
      if (!map.has(k2)) map.set(k2, []);
      map.get(k2).push({ line: ln, side: 'end' });
    });
    return map;
  }

  /**
   * Are two line references mutually collinear? Returns true if both
   * lines are horizontal at the same y, or both vertical at the same x.
   * Two lines whose only shared coord is at one of their endpoints, and
   * which lie on the same axis, are mergeable at that shared coord.
   */
  function isCollinearPair(lineA, lineB) {
    const a = readLineCoords(lineA);
    const b = readLineCoords(lineB);
    const aHoriz = (a.y1 === a.y2);
    const aVert  = (a.x1 === a.x2);
    const bHoriz = (b.y1 === b.y2);
    const bVert  = (b.x1 === b.x2);
    if (aHoriz && bHoriz && a.y1 === b.y1) return true;
    if (aVert  && bVert  && a.x1 === b.x1) return true;
    return false;
  }

  /**
   * Move the hit-rect associated with `which` endpoint of `line` to
   * the new (x, y).  Hit-rects are 14x14 transparent rects that act as
   * enlarged click targets for endpoint dragging.
   */
  function moveHitRect(line, which, x, y) {
    const hit = line.querySelector(`rect.endpoint-hit[data-endpoint="${which}"]`);
    if (!hit) return;
    const SIZE = 14;
    hit.setAttribute('x', String(x - SIZE / 2));
    hit.setAttribute('y', String(y - SIZE / 2));
  }

  /**
   * Extend one endpoint of `line` to the new (x, y).  Updates both the
   * line's coordinates and the matching endpoint hit-rect.
   */
  function extendLineTo(line, which, x, y) {
    if (which === 'start') {
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', String(y));
    } else {
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
    }
    moveHitRect(line, which, x, y);
  }

  /**
   * Coordinates of a line's given endpoint.
   */
  function endpointCoord(line, side) {
    if (side === 'start') {
      return { x: +line.getAttribute('x1'), y: +line.getAttribute('y1') };
    }
    return { x: +line.getAttribute('x2'), y: +line.getAttribute('y2') };
  }

  /**
   * Coordinates of a line's *opposite* endpoint (i.e. the one we want
   * to keep when merging — the line's far end).
   */
  function oppositeCoord(line, side) {
    return endpointCoord(line, side === 'start' ? 'end' : 'start');
  }

  /**
   * isButtJoin(coordKey, lineA, sideA, lineB, sideB)
   * Returns true if the two lines meet at `coordKey` end-to-end in
   * a butt-join: each line's chosen endpoint sits AT coordKey, and
   * each line's OTHER endpoint is on the OPPOSITE side of coordKey
   * (so the two lines extend in opposite directions from the joint).
   *
   * This is the only safe configuration for a single coord with
   * exactly 2 endpoints from 2 different collinear lines.  If both
   * other endpoints were on the same side, the two lines would
   * overlap (or be identical) -- a state the validator would have
   * rejected; the first pass of mergeLines() must not silently
   * produce a degenerate shorter line as a side effect.
   */
  function isButtJoin(lineA, sideA, lineB, sideB) {
    const a = endpointCoord(lineA, sideA);
    const b = endpointCoord(lineB, sideB);
    if (a.x !== b.x || a.y !== b.y) return false;
    const aFar = oppositeCoord(lineA, sideA);
    const bFar = oppositeCoord(lineB, sideB);
    if (a.y === aFar.y && a.y === bFar.y) {
      const aDelta = aFar.x - a.x;
      const bDelta = bFar.x - a.x;
      if (aDelta === 0 || bDelta === 0) return false;
      return (aDelta < 0) !== (bDelta < 0);
    }
    if (a.x === aFar.x && a.x === bFar.x) {
      const aDelta = aFar.y - a.y;
      const bDelta = bFar.y - a.y;
      if (aDelta === 0 || bDelta === 0) return false;
      return (aDelta < 0) !== (bDelta < 0);
    }
    return false;
  }

  /**
   * mergeOnePair(surviving, survivingSide, dead, deadSide)
   *   surviving : the line that will absorb the other one
   *   survivingSide : which endpoint of `surviving` to extend
   *   dead : the line that will be removed
   *   deadSide : which endpoint of `dead` is touching the surviving
   *              line (its far endpoint stays put, the touching one
   *              is what's shared and effectively "disappears")
   *
   * The surviving line is extended so that its `survivingSide` endpoint
   * moves to the FAR endpoint of `dead`.  The dead line is then
   * removed.  Selection is preserved: if the user had the dead line
   * selected, selection transfers to the surviving line.
   */
  function mergeOnePair(surviving, survivingSide, dead, deadSide) {
    // The far endpoint of the dead line becomes the new position of
    // surviving's chosen endpoint.
    const far = oppositeCoord(dead, deadSide);

    // The shared coord (the one the two lines were meeting at) should
    // equal the touching endpoint of the dead line and the touching
    // endpoint of the surviving line.  We assert that here to keep
    // the caller honest.
    const sharedDead = endpointCoord(dead, deadSide);
    const sharedSurv = endpointCoord(surviving, survivingSide);
    if (sharedDead.x !== sharedSurv.x || sharedDead.y !== sharedSurv.y) {
      // The two "touching" endpoints aren't actually co-located.  This
      // is a precondition violation; bail without mutation.
      return false;
    }

    extendLineTo(surviving, survivingSide, far.x, far.y);

    // If the dead line was selected, transfer selection to surviving
    if (global.appState && global.appState.selected === dead) {
      global.appState.selected = surviving;
    }
    if (dead.parentNode) dead.parentNode.removeChild(dead);
    return true;
  }

  /**
   * mergeLines()
   * Stateless pass: scan every coord, look for exactly 2 endpoints
   * coming from 2 different lines that are collinear, and merge them.
   * Loops until no more merges can be performed (a single merge can
   * open up new merge opportunities at adjacent coords).
   *
   * Returns the total number of merges performed.
   */
  /**
   * coalesceCollinearOverlap()
   * Finds two collinear lines whose interiors overlap with positive
   * length (e.g. (100,100)→(300,100) and (200,100)→(400,100) overlap
   * on (200,300)) and replaces them with a single line that spans
   * the outer envelope (100,100)→(400,100).  This is what naturally
   * happens during the "bridge" extension in connect mode: when the
   * new line extends two existing lines into each other, the two
   * surviving lines now overlap, and we need to fold them together.
   *
   * Returns true if a coalesce was performed (caller should loop).
   */
  function coalesceCollinearOverlap() {
    console.log('[COALESCE] called');
    const layer = document.getElementById('nets-layer');
    if (!layer) return false;
    const lines = Array.from(layer.querySelectorAll('line.net-line'));
    for (let i = 0; i < lines.length; i++) {
      const a = lines[i];
      const aC = readLineCoords(a);
      if (aC.x1 === aC.x2 && aC.y1 === aC.y2) continue; // skip zero-length
      const aHoriz = (aC.y1 === aC.y2);
      const aVert  = (aC.x1 === aC.x2);
      if (!aHoriz && !aVert) continue; // not ortho; skip
      for (let j = i + 1; j < lines.length; j++) {
        const b = lines[j];
        const bC = readLineCoords(b);
        if (bC.x1 === bC.x2 && bC.y1 === bC.y2) continue;
        if (aHoriz) {
          if (bC.y1 !== bC.y2) continue; // not horizontal
          if (aC.y1 !== bC.y1) continue; // different row
          // Positive-length overlap on x?
          const aLo = Math.min(aC.x1, aC.x2), aHi = Math.max(aC.x1, aC.x2);
          const bLo = Math.min(bC.x1, bC.x2), bHi = Math.max(bC.x1, bC.x2);
          console.log('[COALESCE] j='+j+' bC='+JSON.stringify(bC)+' aHi='+aHi+' bLo='+bLo+' bHi='+bHi+' aLo='+aLo);
          if (aHi <= bLo || bHi <= aLo) continue; // not overlapping
          // They overlap with positive length.  Compute the outer envelope.
          const newX1 = Math.min(aLo, bLo);
          const newX2 = Math.max(aHi, bHi);
          // Transfer selection if needed.
          if (global.appState && global.appState.selected === b) {
            global.appState.selected = a;
          }
          // Apply: keep `a`, extend it to the envelope, remove `b`.
          // Determine which side of `a` needs extending.
          const aExtStart = (newX1 < aLo);
          const aExtEnd   = (newX2 > aHi);
          console.log('[COALESCE] MERGE: newX1='+newX1+' newX2='+newX2+' aExtStart='+aExtStart+' aExtEnd='+aExtEnd);
          if (aExtStart) extendLineTo(a, 'start', newX1, aC.y1);
          if (aExtEnd)   extendLineTo(a, 'end',   newX2, aC.y1);
          if (b.parentNode) b.parentNode.removeChild(b);
          return true;
        } else {
          // a is vertical
          if (bC.x1 !== bC.x2) continue;
          if (aC.x1 !== bC.x1) continue;
          const aLo = Math.min(aC.y1, aC.y2), aHi = Math.max(aC.y1, aC.y2);
          const bLo = Math.min(bC.y1, bC.y2), bHi = Math.max(bC.y1, bC.y2);
          if (aHi <= bLo || bHi <= aLo) continue;
          const newY1 = Math.min(aLo, bLo);
          const newY2 = Math.max(aHi, bHi);
          if (global.appState && global.appState.selected === b) {
            global.appState.selected = a;
          }
          const aExtStart = (newY1 < aLo);
          const aExtEnd   = (newY2 > aHi);
          if (aExtStart) extendLineTo(a, 'start', aC.x1, newY1);
          if (aExtEnd)   extendLineTo(a, 'end',   aC.x1, newY2);
          if (b.parentNode) b.parentNode.removeChild(b);
          return true;
        }
      }
    }
    return false;
  }

  function mergeLines() {
    console.log('[MERGE] called');
    let totalMerges = 0;
    // Bound the loop defensively in case of a bug that creates a
    // cycle.  In normal operation this loop runs 0-2 times.
    for (let safety = 0; safety < 10000; safety++) {
      const map = buildEndpointMap();
      let didMerge = false;

      console.log('[MERGE] first pass, map:', JSON.stringify(Array.from(map.entries()).map(([k,v]) => ({k, count: v.length, sides: v.map(e => e.side)}))));
      // Pass 1: heal butt-joins.  Two collinear lines sharing a
      // single endpoint coord (and no other line touches that
      // coord) get merged.
      const keys = Array.from(map.keys()).sort();
      for (const k of keys) {
        const entries = map.get(k);
        if (entries.length !== 2) continue;
        const a = entries[0], b = entries[1];
        if (a.line === b.line) continue;          // a line's own 2 endpoints
        if (!isCollinearPair(a.line, b.line)) continue;

        // Choose which line to keep.  Prefer the older (earlier in
        // DOM) one so the surviving id is stable for users.
        const aFirst = !b.line.compareDocumentPosition(a.line) ||
                       !(b.line.compareDocumentPosition(a.line) & Node.DOCUMENT_POSITION_FOLLOWING);
        const keep = aFirst ? a : b;
        const drop = aFirst ? b : a;

        console.log('[MERGE] first pass: BUTT-JOIN matched, merging');
        if (mergeOnePair(keep.line, keep.side, drop.line, drop.side)) {
          didMerge = true;
          totalMerges++;
          break; // restart the outer loop with a fresh map
        }
      }

      if (didMerge) continue;

      // Pass 2: coalesce collinear overlap.  Two collinear lines
      // whose interiors overlap (positive length) get folded into
      // one line spanning the outer envelope.  This is what fires
      // after a "bridge" extension produces overlapping lines.
      console.log('[MERGE] trying coalesceCollinearOverlap');
      if (coalesceCollinearOverlap()) {
        totalMerges++;
        continue;
      }

      break;
    }
    return totalMerges;
  }

  /**
   * findFreeCollinearExtension(x, y, farX, farY)
   * Returns { line, side, farX, farY } describing how to extend an
   * existing line if (x, y) is the FREE endpoint of an existing
   * collinear line, OR null if no such extension applies.
   *
   * "Free endpoint" means the coord (x, y) is one of the line's
   * endpoints AND that coord has exactly ONE line endpoint
   * terminating on it (i.e. count == 1 in the endpoint map, so it
   * is not a T-junction or junction dot).
   *
   * `farX, farY` is the OPPOSITE endpoint of the new line; the
   * returned `farX, farY` is the new coord to extend the line to.
   */
  function findFreeCollinearExtension(x, y, farX, farY) {
    const map = buildEndpointMap();
    const k = endpointsKey(x, y);
    const entries = map.get(k);
    if (!entries || entries.length !== 1) return null; // not a free endpoint
    const ref = entries[0];
    const line = ref.line;
    // The line at this coord must be collinear with the direction
    // from (x,y) to (farX,farY).  For an axis-aligned line and a
    // axis-aligned new segment, that means the line lies on the same
    // row or column as the new segment.
    const lc = readLineCoords(line);
    if (lc.y1 === lc.y2) {
      // existing line is horizontal; new segment must also be horizontal at the same y
      if (y !== lc.y1) return null;
      if (farY !== y) return null;
    } else if (lc.x1 === lc.x2) {
      // existing line is vertical; new segment must also be vertical at the same x
      if (x !== lc.x1) return null;
      if (farX !== x) return null;
    } else {
      return null; // non-ortho line; shouldn't happen
    }
    // Extend: the line's `ref.side` endpoint is at (x, y); the new
    // far position is (farX, farY).
    return { line: line, side: ref.side, newX: farX, newY: farY };
  }

  // Expose
  global.createLine        = createLine;
  global.deleteLine        = deleteLine;
  global.splitLineAt       = splitLineAt;
  global.recomputeJunctions = recomputeJunctions;
  global.mergeLines        = mergeLines;
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
