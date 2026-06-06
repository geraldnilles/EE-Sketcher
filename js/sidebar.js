/* =====================================================================
   sidebar.js
   Renders the contextual inspector panel based on appState.selected.
   Re-renders on 'selection-change' and after data mutations.
   ===================================================================== */
(function (global) {
  'use strict';

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] === true) {
          n.setAttribute(k, '');
        } else if (attrs[k] !== false && attrs[k] != null) {
          n.setAttribute(k, attrs[k]);
        }
      }
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function renderEmpty(body) {
    clear(body);
    body.appendChild(el('p', { class: 'muted' }, ['Nothing selected. Click an element on the canvas to edit it.']));
  }

  function renderComponentPanel(body, g) {
    clear(body);
    const labels = global.readLabels(g);
    const rows   = global.getRows(g);
    const width  = global.getWidth(g);

    // Top / Bottom labels above the pin grid
    const topRow = el('div', { style: 'margin-bottom: 6px;' }, [
      el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, ['Top Label']),
      el('input', {
        type: 'text', value: labels.top || '',
        placeholder: 'e.g. U1',
        style: 'width: 100%; box-sizing: border-box;',
        oninput: (e) => {
          global.updateComponent(g, { labelTop: e.target.value });
        },
      }),
    ]);
    body.appendChild(topRow);

    const bottomRow = el('div', { style: 'margin-bottom: 8px;' }, [
      el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, ['Bottom Label']),
      el('input', {
        type: 'text', value: labels.bottom || '',
        placeholder: 'e.g. 74HC00',
        style: 'width: 100%; box-sizing: border-box;',
        oninput: (e) => {
          global.updateComponent(g, { labelBottom: e.target.value });
        },
      }),
    ]);
    body.appendChild(bottomRow);

    // Pin inputs (two-column grid)
    const grid = el('div', { class: 'pin-grid' });
    grid.appendChild(el('div', { class: 'pin-label' }, ['Pin Labels (left / right)']));
    for (let i = 0; i < rows; i++) {
      const li = el('input', {
        type: 'text', value: labels.left[i] || '',
        'data-side': 'L', 'data-row': String(i),
        oninput: (e) => {
          const idx = +e.target.getAttribute('data-row');
          // Always read the latest labels from the SVG (source of truth).
          // If we used the closure's `labels` instead, typing into a second
          // field would send back stale values for every OTHER field, which
          // would silently revert any edits made to those fields since this
          // sidebar was last rendered.
          const newL = global.readLabels(g).left.slice();
          newL[idx] = e.target.value;
          global.updateComponent(g, { labelL: newL });
        },
      });
      const ri = el('input', {
        type: 'text', value: labels.right[i] || '',
        'data-side': 'R', 'data-row': String(i),
        oninput: (e) => {
          const idx = +e.target.getAttribute('data-row');
          // See comment above — read the latest labels from the SVG so we
          // never overwrite a sibling field with a stale value.
          const newR = global.readLabels(g).right.slice();
          newR[idx] = e.target.value;
          global.updateComponent(g, { labelR: newR });
        },
      });
      grid.appendChild(li);
      grid.appendChild(ri);
    }
    body.appendChild(grid);

    // Row buttons
    const rowBtns = el('div', { class: 'btn-row', style: 'margin-bottom: 8px;' }, [
      el('button', { onclick: () => global.updateComponent(g, { addRow: true }) }, ['+ Row']),
      el('button', {
        onclick: () => global.updateComponent(g, { removeRow: true }),
        disabled: rows <= 1,
      }, ['- Row']),
    ]);
    body.appendChild(rowBtns);

    // Width buttons
    const widthBtns = el('div', { class: 'btn-row', style: 'margin-bottom: 8px;' }, [
      el('button', { onclick: () => global.updateComponent(g, { expand: true }) }, ['Expand (+50)']),
      el('button', {
        onclick: () => global.updateComponent(g, { contract: true }),
        disabled: width <= 50,
      }, ['Contract (-50)']),
    ]);
    body.appendChild(widthBtns);

    // Metadata
    const o = global.readOrigin(g);
    body.appendChild(el('pre', { class: 'meta' }, [
      `Position: (${o.x}, ${o.y})   Width: ${width}   Rows: ${rows}`,
    ]));

    // Delete
    body.appendChild(el('button', {
      class: 'danger',
      style: 'width: 100%; margin-top: 4px;',
      onclick: () => global.deleteComponent(g),
      title: "Delete Component  [x / Backspace / Delete]",
    }, ['Delete Component']));
  }

  function renderGndPanel(body, g) {
    clear(body);
    body.appendChild(el('h3', { style: 'margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: var(--fg-secondary);' }, ['Ground Connection']));

    const o = global.readOrigin(g);
    body.appendChild(el('pre', { class: 'meta' }, [
      `Position: (${o.x}, ${o.y})\nType: Static Reference`,
    ]));

    body.appendChild(el('button', {
      class: 'danger',
      style: 'width: 100%; margin-top: 4px;',
      onclick: () => global.deleteComponent(g),
      title: "Delete GND  [x / Backspace / Delete]",
    }, ['Delete Component']));
  }


  function renderPassivePanel(body, g) {
    clear(body);
    const type = g.getAttribute('data-type') || 'component';
    const label = g.getAttribute('data-label') || '';
    const rot = g.getAttribute('data-rotate') || '0';

    body.appendChild(el('h3', { style: 'margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: var(--fg-secondary);' }, [`${type}`]));

    const labelRow = el('div', { style: 'margin-bottom: 8px;' }, [
      el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, ['Component Label']),
      el('input', {
        type: 'text',
        value: label,
        placeholder: 'e.g. R1, C5',
        oninput: (e) => global.updateComponent(g, { labelPassive: e.target.value }),
      }),
    ]);
    body.appendChild(labelRow);

    const rotRow = el('div', { style: 'margin-bottom: 12px;' }, [
      el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, ['Rotation']),
      el('select', {
        style: 'width: 100%%; padding: 4px; border-radius: var(--radius);',
        onchange: (e) => global.updateComponent(g, { rotatePassive: parseInt(e.target.value, 10) }),
      }, [
        el('option', { value: '0', selected: rot === '0' }, ['0 Degrees (Horizontal)']),
        el('option', { value: '90', selected: rot === '90' }, ['90 Degrees (Vertical)']),
      ]),
    ]);
    body.appendChild(rotRow);

    const o = global.readOrigin(g);
    body.appendChild(el('pre', { class: 'meta' }, [
      `Position: (${o.x}, ${o.y})\nType: Passive Ref (${type})\nRotation: ${rot}°`
    ]));

    body.appendChild(el('button', {
      class: 'danger',
      style: 'width: 100%; margin-top: 4px;',
      onclick: () => global.deleteComponent(g),
    }, ['Delete Component']));
  }

  function renderVddPanel(body, g) {
    clear(body);
    body.appendChild(el('h3', { style: 'margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: var(--fg-secondary);' }, ['Power Bus Connection (VDD)']));

    const currentLabel = g.getAttribute('data-label') || 'VDD';

    const labelRow = el('div', { style: 'margin-bottom: 8px;' }, [
      el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, ['Power Label']),
      el('input', {
        type: 'text',
        value: currentLabel,
        placeholder: 'e.g. VDD, 3V3, 5V',
        style: 'width: 100%; box-sizing: border-box;',
        oninput: (e) => {
          global.updateComponent(g, { labelVdd: e.target.value });
        },
      }),
    ]);
    body.appendChild(labelRow);

    const o = global.readOrigin(g);
    body.appendChild(el('pre', { class: 'meta' }, [
      `Position: (${o.x}, ${o.y})\nType: Power Reference`,
    ]));

    body.appendChild(el('button', {
      class: 'danger',
      style: 'width: 100%; margin-top: 4px;',
      onclick: () => global.deleteComponent(g),
      title: "Delete VDD  [x / Backspace / Delete]",
    }, ['Delete Component']));
  }

  function renderLinePanel(body, line) {
    clear(body);
    const c = global.readLineCoords(line);
    body.appendChild(el('pre', { class: 'meta' }, [
      `Line  (${c.x1}, ${c.y1}) -> (${c.x2}, ${c.y2})\n` +
      `Length: ${Math.abs(c.x2 - c.x1) + Math.abs(c.y2 - c.y1)}   ` +
      (c.x1 === c.x2 ? 'Vertical' : (c.y1 === c.y2 ? 'Horizontal' : 'Non-ortho!')),
    ]));
    body.appendChild(el('button', {
      class: 'danger',
      style: 'width: 100%;',
      onclick: () => global.deleteLine(line),
      title: "Delete Line  [x / Backspace / Delete]",
    }, ['Delete Line']));
  }

  function render() {
    const body = document.getElementById('inspector-body');
    if (!body) return;
    const sel = global.appState.selected;
    if (!sel) return renderEmpty(body);
    if (sel.classList && sel.classList.contains('generic-component')) {
      if (sel.classList.contains('passive-component')) {
        return renderPassivePanel(body, sel);
      }
      if (sel.classList.contains('gnd-component')) {
        return renderGndPanel(body, sel);
      }
      if (sel.classList.contains('vdd-component')) {
        return renderVddPanel(body, sel);
      }
      return renderComponentPanel(body, sel);
    }
    if (sel.classList && sel.classList.contains('net-line')) {
      return renderLinePanel(body, sel);
    }
    renderEmpty(body);
  }

  function init() {
    window.addEventListener('selection-change', render);
    // Re-render the inspector when a selected element mutates
    // (components emit no event by default; we hook updateComponent via
    // a microtask flag in main.js — but for simplicity, re-render on click)
    document.addEventListener('click', (evt) => {
      // After selection change bubbles through interactions.js, render is called.
      // No extra work needed here.
    });
    render();
  }

  global.renderSidebar = render;
  global.initSidebar   = init;
})(typeof window !== 'undefined' ? window : globalThis);
