/* =====================================================================
   nets.js
   Line net CRUD with stateless topology engine.
   ===================================================================== */

import { snap, clamp, uid, appState } from './state.js';
import { WORLD_W, WORLD_H } from './viewport.js';
import { readOrigin } from './components.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---------- coordinate utilities ---------- */
export function isOrtho(x1, y1, x2, y2) {
  return (x1 === x2) || (y1 === y2);
}
function endpointsKey(x, y) { return x + ',' + y; }

/* ---------- element creation ---------- */
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

export function newEndpointHit(line, which) {
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

/* ---------- validation helpers ---------- */
export function getComponentRects() {
  const layer = document.getElementById('components-layer');
  if (!layer) return [];
  const out = [];
  layer.querySelectorAll('g.generic-component').forEach((g) => {
    // Skip power references entirely so nets can cross them freely
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

    // Existing logic for standard generic blocks remains below
    const o = readOrigin(g);
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

function openOverlap1D(a, b, c, d) {
  const lo = Math.max(Math.min(a, b), Math.min(c, d));
  const hi = Math.min(Math.max(a, b), Math.max(c, d));
  return hi > lo;
}

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

/* ---------- CRUD ---------- */

/**
 * createLine(x1, y1, x2, y2)
 */
export function createLine(x1, y1, x2, y2) {
  x1 = snap(x1); y1 = snap(y1);
  x2 = snap(x2); y2 = snap(y2);
  x1 = clamp(x1, 0, WORLD_W);
  y1 = clamp(y1, 0, WORLD_H);
  x2 = clamp(x2, 0, WORLD_W);
  y2 = clamp(y2, 0, WORLD_H);
  if (x1 === x2 && y1 === y2) return null;
  if (!isOrtho(x1, y1, x2, y2)) return null;

  const valid = validateNewLine(x1, y1, x2, y2);
  if (!valid.ok) return null;

  const layer = document.getElementById('nets-layer');
  if (!layer) return null;

  const ln = newLineEl(x1, y1, x2, y2);
  layer.appendChild(ln);
  ln.appendChild(newEndpointHit(ln, 'start'));
  ln.appendChild(newEndpointHit(ln, 'end'));

  refreshNetTopology();
  return ln;
}

export function deleteLine(lineEl) {
  if (!lineEl) return;
  if (lineEl === appState.selected) appState.selected = null;
  lineEl.remove();
  refreshNetTopology();
  window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
}

/* ---------- stateless split-all pass ---------- */

function pointOnSegmentInterior(px, py, x1, y1, x2, y2) {
  if (x1 === x2) {
    if (px !== x1) return false;
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    return py > lo && py < hi;
  }
  if (y1 === y2) {
    if (py !== y1) return false;
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    return px > lo && px < hi;
  }
  return false;
}

/**
 * splitAllLines()
 */
export function splitAllLines() {
  const layer = document.getElementById('nets-layer');
  if (!layer) return false;

  let didSplit = false;
  const MAX_RUNS = 1000;

  for (let safety = 0; safety < MAX_RUNS; safety++) {
    const lines = Array.from(layer.querySelectorAll('line.net-line'));

    const endpoints = new Set();
    lines.forEach((ln) => {
      endpoints.add(ln.getAttribute('x1') + ',' + ln.getAttribute('y1'));
      endpoints.add(ln.getAttribute('x2') + ',' + ln.getAttribute('y2'));
    });

    let splitOccurred = false;

    for (const ln of lines) {
      const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
      const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');

      for (const ep of endpoints) {
        const commaIdx = ep.indexOf(',');
        const ex = +ep.slice(0, commaIdx);
        const ey = +ep.slice(commaIdx + 1);

        if (pointOnSegmentInterior(ex, ey, x1, y1, x2, y2)) {
          const origId = ln.getAttribute('data-id');
          ln.remove();

          const a = newLineEl(x1, y1, ex, ey, origId);
          a.appendChild(newEndpointHit(a, 'start'));
          a.appendChild(newEndpointHit(a, 'end'));
          layer.appendChild(a);

          const b = newLineEl(ex, ey, x2, y2, null);
          b.appendChild(newEndpointHit(b, 'start'));
          b.appendChild(newEndpointHit(b, 'end'));
          layer.appendChild(b);

          splitOccurred = true;
          didSplit = true;
          break;
        }
      }
      if (splitOccurred) break;
    }
    if (!splitOccurred) break;
  }
  return didSplit;
}

/* ---------- stateless merge-all pass ---------- */

function buildEndpointMap() {
  const layer = document.getElementById('nets-layer');
  const map = new Map();
  if (!layer) return map;
  layer.querySelectorAll('line.net-line').forEach((ln) => {
    const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
    const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');
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

function isCollinearPair(lineA, lineB) {
  const a = readLineCoords(lineA);
  const b = readLineCoords(lineB);
  const aHoriz = (a.y1 === a.y2), aVert = (a.x1 === a.x2);
  const bHoriz = (b.y1 === b.y2), bVert = (b.x1 === b.x2);
  if (aHoriz && bHoriz && a.y1 === b.y1) return true;
  if (aVert  && bVert  && a.x1 === b.x1) return true;
  return false;
}

function moveHitRect(line, which, x, y) {
  const hit = line.querySelector('rect.endpoint-hit[data-endpoint="' + which + '"]');
  if (!hit) return;
  const SIZE = 14;
  hit.setAttribute('x', String(x - SIZE / 2));
  hit.setAttribute('y', String(y - SIZE / 2));
}

export function extendLineTo(line, which, x, y) {
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
 * mergeLines()
 */
export function mergeLines() {
  const layer = document.getElementById('nets-layer');
  if (!layer) return 0;

  let totalMerges = 0;
  const MAX_RUNS = 10000;

  for (let safety = 0; safety < MAX_RUNS; safety++) {
    const epMap = buildEndpointMap();
    const lines = Array.from(layer.querySelectorAll('line.net-line'));
    let didMerge = false;

    for (let i = 0; i < lines.length; i++) {
      const a = lines[i];
      const aC = readLineCoords(a);
      if (aC.x1 === aC.x2 && aC.y1 === aC.y2) continue;
      const aHoriz = (aC.y1 === aC.y2);
      const aVert  = (aC.x1 === aC.x2);
      if (!aHoriz && !aVert) continue;

      for (let j = i + 1; j < lines.length; j++) {
        const b = lines[j];
        const bC = readLineCoords(b);
        if (bC.x1 === bC.x2 && bC.y1 === bC.y2) continue;
        if (!isCollinearPair(a, b)) continue;

        // Both lines are on the same axis.  Compute intervals.
        let aLo, aHi, bLo, bHi;
        if (aHoriz) {
          aLo = Math.min(aC.x1, aC.x2); aHi = Math.max(aC.x1, aC.x2);
          bLo = Math.min(bC.x1, bC.x2); bHi = Math.max(bC.x1, bC.x2);
        } else {
          aLo = Math.min(aC.y1, aC.y2); aHi = Math.max(aC.y1, aC.y2);
          bLo = Math.min(bC.y1, bC.y2); bHi = Math.max(bC.y1, bC.y2);
        }

        // Do intervals touch or overlap?  (max of lows <= min of highs)
        const overlapLo = Math.max(aLo, bLo);
        const overlapHi = Math.min(aHi, bHi);
        if (overlapLo > overlapHi) continue; // no contact

        // If strictly positive overlap, always merge.
        // If only touching at a single point, only merge if that
        // coordinate has exactly 2 endpoints (plain butt-join).
        if (overlapLo === overlapHi) {
          // Endpoint-touch only.  Check endpoint count at the
          // shared coordinate.
          const coord = aHoriz 
            ? endpointsKey(overlapLo, aC.y1)
            : endpointsKey(aC.x1, overlapLo);
          const entries = epMap.get(coord);
          if (!entries || entries.length !== 2) continue;
          // Also verify the two entries correspond to lines a and b
          const ids = entries.map((e) => e.line);
          if (!ids.includes(a) || !ids.includes(b)) continue;
        }

        // ---- perform merge ----
        const newLo = Math.min(aLo, bLo);
        const newHi = Math.max(aHi, bHi);

        if (aHoriz) {
          const y = aC.y1;
          const oldStartX = +a.getAttribute('x1');
          const oldEndX   = +a.getAttribute('x2');
          if (oldStartX <= oldEndX) {
            extendLineTo(a, 'start', newLo, y);
            extendLineTo(a, 'end',   newHi, y);
          } else {
            extendLineTo(a, 'start', newHi, y);
            extendLineTo(a, 'end',   newLo, y);
          }
        } else {
          const x = aC.x1;
          const oldStartY = +a.getAttribute('y1');
          const oldEndY   = +a.getAttribute('y2');
          if (oldStartY <= oldEndY) {
            extendLineTo(a, 'start', x, newLo);
            extendLineTo(a, 'end',   x, newHi);
          } else {
            extendLineTo(a, 'start', x, newHi);
            extendLineTo(a, 'end',   x, newLo);
          }
        }

        if (appState && appState.selected === b) {
          appState.selected = a;
        }
        if (b.parentNode) b.parentNode.removeChild(b);

        didMerge = true;
        totalMerges++;
        break;
      }
      if (didMerge) break;
    }
    if (!didMerge) break;
  }
  return totalMerges;
}

/* ---------- topology refresh ---------- */

export function refreshNetTopology() {
  splitAllLines();
  mergeLines();
  recomputeJunctions();
}

/* ---------- junction circles ---------- */

export function recomputeJunctions() {
  const layer  = document.getElementById('nets-layer');
  const jlayer = document.getElementById('junctions-layer');
  if (!layer || !jlayer) return;

  const counts = new Map();
  layer.querySelectorAll('line.net-line').forEach((ln) => {
    const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
    const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');
    addCount(counts, x1, y1);
    addCount(counts, x2, y2);
  });

  const existing = new Map();
  jlayer.querySelectorAll('circle.junction').forEach((c) => {
    existing.set(c.getAttribute('data-coord'), c);
  });

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
        c.setAttribute('cx', String(x));
        c.setAttribute('cy', String(y));
        existing.delete(key);
      }
    }
  });

  existing.forEach((c) => c.remove());
}

function addCount(map, x, y) {
  const k = endpointsKey(x, y);
  map.set(k, (map.get(k) || 0) + 1);
}

/* ---------- interaction helpers ---------- */

export function readLineCoords(line) {
  return {
    x1: +line.getAttribute('x1'), y1: +line.getAttribute('y1'),
    x2: +line.getAttribute('x2'), y2: +line.getAttribute('y2'),
  };
}

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
  const hit = line.querySelector('rect.endpoint-hit[data-endpoint="' + which + '"]');
  if (hit) {
    const SIZE = 14;
    hit.setAttribute('x', String((which === 'start' ? c.x1 : c.x2) - SIZE / 2));
    hit.setAttribute('y', String((which === 'start' ? c.y1 : c.y2) - SIZE / 2));
  }
}

export function shiftLineForEndpointDrag(line, which, x, y) {
  x = snap(x); y = snap(y);
  x = clamp(x, 0, WORLD_W);
  y = clamp(y, 0, WORLD_H);
  const c = readLineCoords(line);
  const isHoriz = (c.y1 === c.y2), isVert = (c.x1 === c.x2);
  if (!isHoriz && !isVert) return;

  if (isHoriz) {
    if (which === 'start') { c.y1 = y; c.y2 = y; }
    else                   { c.y1 = y; c.y2 = y; }
  } else if (isVert) {
    if (which === 'start') { c.x1 = x; c.x2 = x; }
    else                   { c.x1 = x; c.x2 = x; }
  }
  line.setAttribute('x1', String(c.x1));
  line.setAttribute('y1', String(c.y1));
  line.setAttribute('x2', String(c.x2));
  line.setAttribute('y2', String(c.y2));
  line.querySelectorAll('rect.endpoint-hit').forEach((h) => {
    const SIZE = 14;
    const which2 = h.getAttribute('data-endpoint');
    const hx = (which2 === 'start') ? c.x1 : c.x2;
    const hy = (which2 === 'start') ? c.y1 : c.y2;
    h.setAttribute('x', String(hx - SIZE / 2));
    h.setAttribute('y', String(hy - SIZE / 2));
  });
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
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
