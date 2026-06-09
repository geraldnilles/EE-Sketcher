/* =====================================================================
   net-topology.js
   Stateless split / merge / junction engine for orthogonal line nets.
   ===================================================================== */

import { endpointsKey } from '../geometry.js';
import { readLineCoords } from './net-interaction.js';
import { newLineEl, newEndpointHit } from './net-factory.js';
import { appState } from '../state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---- split ---- */

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
 * Split every line wherever another endpoint lies on its interior.
 * Safe to call repeatedly — exits when no splits occurred.
 * Returns true if any splits were performed.
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

/* ---- merge ---- */

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
 * Merge collinear touching/overlapping segments.
 * Returns the number of merges performed.
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

        let aLo, aHi, bLo, bHi;
        if (aHoriz) {
          aLo = Math.min(aC.x1, aC.x2); aHi = Math.max(aC.x1, aC.x2);
          bLo = Math.min(bC.x1, bC.x2); bHi = Math.max(bC.x1, bC.x2);
        } else {
          aLo = Math.min(aC.y1, aC.y2); aHi = Math.max(aC.y1, aC.y2);
          bLo = Math.min(bC.y1, bC.y2); bHi = Math.max(bC.y1, bC.y2);
        }

        const overlapLo = Math.max(aLo, bLo);
        const overlapHi = Math.min(aHi, bHi);
        if (overlapLo > overlapHi) continue;

        if (overlapLo === overlapHi) {
          const coord = aHoriz
            ? endpointsKey(overlapLo, aC.y1)
            : endpointsKey(aC.x1, overlapLo);
          const entries = epMap.get(coord);
          if (!entries || entries.length !== 2) continue;
          const ids = entries.map((e) => e.line);
          if (!ids.includes(a) || !ids.includes(b)) continue;
        }

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

/* ---- junctions ---- */

function addCount(map, x, y) {
  const k = endpointsKey(x, y);
  map.set(k, (map.get(k) || 0) + 1);
}

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

/* ---- compound topology refresh ---- */

export function refreshNetTopology() {
  splitAllLines();
  mergeLines();
  recomputeJunctions();
}
