/* =====================================================================
   serialization.js
   exportSchema() : clone the canvas, strip transient overlays,
                    serialize to a string via XMLSerializer.
   importSchema(text) : wipe canvas, parse, validate, re-attach via
                        the existing event-delegation listeners, then
                        recomputeJunctions().
   ===================================================================== */
(function (global) {
  'use strict';

  const TRANSIENT_CLASSES = [
    'net-preview',
    'drag-handle',
    'selection-ring',
    'endpoint-hit', // also strip on export
  ];

  function stripClasses(root, classes) {
    const sel = classes.map((c) => '.' + c).join(',');
    const nodes = root.querySelectorAll(sel);
    nodes.forEach((n) => n.remove());
  }

  /** Walk the clone, removing all 'is-selected' / 'is-dragging' state. */
  function stripState(root) {
    root.querySelectorAll('.is-selected, .is-dragging').forEach((n) => {
      n.classList.remove('is-selected', 'is-dragging');
    });
  }

  /**
   * Strip transient layer elements (overlay layer entirely; empty nets /
   * junctions layers if you want to be tidy).
   */
  function stripTransientLayers(root) {
    const overlay = root.querySelector('g.overlay');
    if (overlay) overlay.remove();
    // The grid overlay is structural & can be kept; but for a "clean"
    // export, drop it too (the user can re-render in the running app).
    const grid = root.querySelector('g.grid-overlay');
    if (grid) grid.remove();
  }

  /** Round all coordinates on .net-line and <rect> to multiples of GRID. */
  function snapImportedCoords(root) {
    // Snap net lines
    root.querySelectorAll('line.net-line').forEach((ln) => {
      ['x1','y1','x2','y2'].forEach((a) => {
        const v = +ln.getAttribute(a);
        ln.setAttribute(a, String(global.snap(v)));
      });
    });
    // Snap component transforms
    root.querySelectorAll('g.generic-component').forEach((g) => {
      const m = /translate\(\s*(-?\d+(?:\.\d+)?)\s*,?\s*(-?\d+(?:\.\d+)?)\s*\)/.exec(g.getAttribute('transform') || '');
      if (m) {
        g.setAttribute('transform', `translate(${global.snap(+m[1])} ${global.snap(+m[2])})`);
      }
      // Snap rect width to multiple of 50
      const rect = g.querySelector('rect.component-body');
      if (rect) {
        const w = +rect.getAttribute('width');
        const wSnap = Math.max(50, Math.round(w / 50) * 50);
        rect.setAttribute('width', String(wSnap));
        g.setAttribute('data-width', String(wSnap));
      }
      // Right-side text x
      const newW = rect ? +rect.getAttribute('width') : null;
      if (newW) {
        g.querySelectorAll('text.pin-right').forEach((t) => {
          t.setAttribute('x', String(newW - 5));
        });
      }
    });
    // Snap junction positions (defensive)
    root.querySelectorAll('circle.junction').forEach((c) => {
      c.setAttribute('cx', String(global.snap(+c.getAttribute('cx'))));
      c.setAttribute('cy', String(global.snap(+c.getAttribute('cy'))));
    });
  }

  /** Validate the structure of an imported document. */
  function validate(doc) {
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') {
      throw new Error('Imported document is not an <svg> root.');
    }
    // Ensure required layers exist (we may have to recreate them).
    let nets      = svg.querySelector('g.nets');
    let components = svg.querySelector('g.components');
    let junctions  = svg.querySelector('g.junctions');

    // If none of the expected layers exist, we wrap all top-level groups
    // heuristically: lines -> nets, generic-component -> components.
    if (!nets && !components && !junctions) {
      const netsG = doc.createElementNS(svg.namespaceURI, 'g');
      netsG.setAttribute('class', 'nets');
      const compG = doc.createElementNS(svg.namespaceURI, 'g');
      compG.setAttribute('class', 'components');
      const jG = doc.createElementNS(svg.namespaceURI, 'g');
      jG.setAttribute('class', 'junctions');
      // Move existing children
      const kids = Array.from(svg.children);
      kids.forEach((k) => {
        if (k.nodeName.toLowerCase() === 'line' && k.getAttribute('class') === 'net-line') {
          netsG.appendChild(k);
        } else if (k.nodeName.toLowerCase() === 'g' && k.getAttribute('class') === 'generic-component') {
          compG.appendChild(k);
        } else if (k.nodeName.toLowerCase() === 'circle' && k.getAttribute('class') === 'junction') {
          jG.appendChild(k);
        }
      });
      svg.appendChild(netsG);
      svg.appendChild(compG);
      svg.appendChild(jG);
      nets = netsG; components = compG; junctions = jG;
    }

    // Components: each must have a rect.component-body; pin text rows are
    // recovered from the DOM if data-rows is missing or < 1.  Off-grid
    // widths (not multiples of 50) and non-grid coordinates are silently
    // snapped by snapImportedCoords() below — not rejected.
    svg.querySelectorAll('g.generic-component').forEach((g) => {
      const rect = g.querySelector('rect.component-body');
      if (!rect) throw new Error('Imported component missing <rect class="component-body">');
      const rows = parseInt(g.getAttribute('data-rows') || '0', 10);
      if (rows < 1) {
        // Try to recover from existing pin texts
        const pins = g.querySelectorAll('text.pin');
        const uniq = new Set(Array.from(pins).map((p) => p.getAttribute('data-row')));
        g.setAttribute('data-rows', String(uniq.size || 1));
      }
    });

    // Net lines: zero-length is unrecoverable. Non-orthogonal lines are
    // salvaged by snapImportedCoords() which forces the line onto the
    // dominant axis.
    svg.querySelectorAll('line.net-line').forEach((ln) => {
      const x1 = +ln.getAttribute('x1'), y1 = +ln.getAttribute('y1');
      const x2 = +ln.getAttribute('x2'), y2 = +ln.getAttribute('y2');
      if (x1 === x2 && y1 === y2) throw new Error('Imported line is zero-length.');
    });

    return svg;
  }

  /** Add endpoint hit rects to every imported net-line. */
  function reattachHits(svgRoot) {
    const SIZE = 14;
    svgRoot.querySelectorAll('line.net-line').forEach((ln) => {
      // Skip if already has hit rects
      if (ln.querySelector('rect.endpoint-hit')) return;
      for (const which of ['start', 'end']) {
        const x = +ln.getAttribute(which === 'start' ? 'x1' : 'x2');
        const y = +ln.getAttribute(which === 'start' ? 'y1' : 'y2');
        const r = document.createElementNS(ln.namespaceURI, 'rect');
        r.setAttribute('class', 'endpoint-hit');
        r.setAttribute('x', String(x - SIZE / 2));
        r.setAttribute('y', String(y - SIZE / 2));
        r.setAttribute('width',  String(SIZE));
        r.setAttribute('height', String(SIZE));
        r.setAttribute('data-endpoint', which);
        ln.appendChild(r);
      }
    });
  }

  /** exportSchema() — returns serialized SVG string. */
  function exportSchema() {
    const svg = document.getElementById('canvas');
    if (!svg) return '';
    const clone = svg.cloneNode(true);
    stripTransientLayers(clone);
    stripClasses(clone, TRANSIENT_CLASSES);
    stripState(clone);
    // Reset the viewBox to the full world on export so the saved SVG is a
    // self-contained schematic viewable in any tool.  We still keep the
    // user's current viewBox in a custom data-* attribute so that
    // importSchema() can restore their zoom/pan on round-trip.
    const userViewBox = svg.getAttribute('viewBox');
    if (userViewBox) clone.setAttribute('data-view-box', userViewBox);
    clone.setAttribute('viewBox', '0 0 1500 1000');
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // Add a friendly XML declaration
    const xml = new XMLSerializer().serializeToString(clone);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
  }

  /** importSchema(text) — parses and replaces canvas content. */
  function importSchema(text) {
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Empty input.');
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');

    // DOMParser puts parse errors on the <parsererror> element
    const errEl = doc.querySelector('parsererror');
    if (errEl) {
      throw new Error('Invalid XML: ' + errEl.textContent.split('\n')[0]);
    }

    const svg = validate(doc);
    snapImportedCoords(svg);

    // Now adopt the imported nodes into the live canvas.
    const live = document.getElementById('canvas');
    if (!live) throw new Error('Live canvas missing.');

    // Wipe existing layers (keep defs + grid-overlay if we want to preserve them)
    ['nets-layer', 'components-layer', 'junctions-layer', 'overlay-layer'].forEach((id) => {
      const n = document.getElementById(id);
      if (n) n.innerHTML = '';
    });

    // Find the imported groups and adopt their children
    const liveNS = live.namespaceURI;
    const impNets      = svg.querySelector('g.nets');
    const impComps     = svg.querySelector('g.components');
    const impJunctions = svg.querySelector('g.junctions');

    function adopt(srcLayer, destId) {
      const dest = document.getElementById(destId);
      if (!dest || !srcLayer) return;
      Array.from(srcLayer.children).forEach((child) => {
        const adopted = document.importNode(child, true);
        dest.appendChild(adopted);
      });
    }
    adopt(impNets,      'nets-layer');
    adopt(impComps,     'components-layer');
    adopt(impJunctions, 'junctions-layer');

    // Re-attach endpoint hit rects on imported lines
    const liveSvg = document.getElementById('canvas');
    reattachHits(liveSvg);

    // Ensure all imported components have data-id
    liveSvg.querySelectorAll('g.generic-component').forEach((g) => {
      if (!g.getAttribute('data-id')) g.setAttribute('data-id', global.uid('cmp'));
      if (!g.getAttribute('data-width')) {
        const r = g.querySelector('rect.component-body');
        if (r) g.setAttribute('data-width', r.getAttribute('width'));
      }
      if (!g.getAttribute('data-rows')) {
        const pins = g.querySelectorAll('text.pin');
        const rows = new Set(Array.from(pins).map((p) => p.getAttribute('data-row')));
        g.setAttribute('data-rows', String(rows.size || 1));
      }
      // Restore data-label-top/data-label-bottom from the text elements
      if (!g.getAttribute('data-label-top')) {
        const tl = g.querySelector('text.label-top');
        if (tl) g.setAttribute('data-label-top', tl.textContent || '');
      }
      if (!g.getAttribute('data-label-bottom')) {
        const bl = g.querySelector('text.label-bottom');
        if (bl) g.setAttribute('data-label-bottom', bl.textContent || '');
      }
    });
    // Ensure all imported lines have data-id
    liveSvg.querySelectorAll('line.net-line').forEach((ln) => {
      if (!ln.getAttribute('data-id')) ln.setAttribute('data-id', global.uid('net'));
    });
    // Ensure junctions have data-coord
    liveSvg.querySelectorAll('circle.junction').forEach((c) => {
      const cx = c.getAttribute('cx'), cy = c.getAttribute('cy');
      if (!c.getAttribute('data-coord')) c.setAttribute('data-coord', cx + ',' + cy);
    });

    // Run our comprehensive topology engine pass to handle splits, merges, and dots cleanly
    if (global.refreshNetTopology) {
      global.refreshNetTopology();
    } else {
      if (global.mergeLines) global.mergeLines();
      global.recomputeJunctions();
    }

    // Clear selection
    global.clearSelection();

    // Restore the saved viewBox if the imported SVG carried one, so the user
    // gets back the exact zoom/pan they had when they exported.  We prefer
    // our custom 'data-view-box' attribute (set by exportSchema) so that the
    // SVG's standard 'viewBox' can stay as the full world for portability.
    const savedVb = svg.getAttribute('data-view-box') || svg.getAttribute('viewBox');
    if (savedVb && global.setViewBox) {
      const parts = savedVb.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        global.setViewBox(parts[0], parts[1], parts[2], parts[3]);
      }
    }
  }

  global.exportSchema = exportSchema;
  global.importSchema = importSchema;
})(typeof window !== 'undefined' ? window : globalThis);
