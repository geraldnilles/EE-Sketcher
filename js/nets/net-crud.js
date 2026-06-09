/* =====================================================================
   net-crud.js
   Create and delete net lines in the DOM.
   ===================================================================== */

import { snap, clamp, appState }           from '../state.js';
import { WORLD_W, WORLD_H }                from '../viewport.js';
import { isOrtho }                         from '../geometry.js';
import { validateNewLine }                 from './net-validation.js';
import { refreshNetTopology }              from './net-topology.js';
import { newLineEl, newEndpointHit }       from './net-factory.js';

/**
 * Create a horizontal or vertical net segment, validate it,
 * add it to the DOM, and refresh topology.
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

/** Remove a line from the DOM, update state, and refresh topology. */
export function deleteLine(lineEl) {
  if (!lineEl) return;
  if (lineEl === appState.selected) appState.selected = null;
  lineEl.remove();
  refreshNetTopology();
  window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
}
