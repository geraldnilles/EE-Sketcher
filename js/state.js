/* =====================================================================
   state.js
   - GRID constant + snap helpers (shared by every module)
   - appState: mode, selected element, drawStart point
   - setMode() with 'modechange' CustomEvent
   - Tiny event bus (window.dispatchEvent / window.addEventListener)
   ===================================================================== */
(function (global) {
  'use strict';

  /** The single source of truth for grid resolution (in SVG user units). */
  const GRID = 25;

  /** Snap a value to the nearest multiple of GRID. */
  function snap(v) {
    return Math.round(v / GRID) * GRID;
  }

  /** Convert raw SVG units to grid units (integer count of GRID cells). */
  function toGrid(px) {
    return Math.round(px / GRID);
  }

  /** Convert grid units back to SVG units. */
  function fromGrid(g) {
    return g * GRID;
  }

  /** Clamp a value to [lo, hi]. */
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /** Generate a short, unique id. */
  function uid(prefix) {
    return (prefix || 'id') + '-' +
      Math.random().toString(36).slice(2, 8) +
      Date.now().toString(36).slice(-4);
  }

  /* -------- App state -------- */
  const appState = {
    mode: 'select',          // 'select' | 'drag' | 'connect'
    selected: null,          // currently selected SVG element (.generic-component | .net-line) or null
    drawStart: null,         // {x, y} in grid coords for in-progress net draw
    dragging: null,          // { kind, el, ... } during an in-progress drag
  };

  /** Update the mode, clear stale flags, dispatch a 'modechange' event. */
  function setMode(mode) {
    if (mode !== 'select' && mode !== 'drag' && mode !== 'connect') {
      console.warn('setMode: unknown mode', mode);
      return;
    }
    if (appState.mode === mode) return;

    // Cancel any in-progress operations when switching modes.
    if (appState.drawStart) {
      appState.drawStart = null;
      // Caller is expected to clear preview line; we just signal.
      global.dispatchEvent(new CustomEvent('draw-cancel'));
    }
    if (appState.dragging) {
      appState.dragging = null;
      global.dispatchEvent(new CustomEvent('drag-cancel'));
    }

    appState.mode = mode;
    global.dispatchEvent(new CustomEvent('modechange', { detail: { mode } }));
  }

  // Expose
  global.GRID         = GRID;
  global.snap         = snap;
  global.toGrid       = toGrid;
  global.fromGrid     = fromGrid;
  global.clamp        = clamp;
  global.uid          = uid;
  global.appState     = appState;
  global.setMode      = setMode;
})(typeof window !== 'undefined' ? window : globalThis);
