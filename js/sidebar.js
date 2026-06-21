/* =====================================================================
   sidebar.js
   Renders the contextual inspector panel based on appState.selected.
   Re-renders on 'selection-change' and after data mutations.
   ===================================================================== */

import { appState } from './state.js';
import { readLabels, getRows, getWidth, getHeight, updateComponent, deleteComponent, readOrigin, readCommentLines, getCommentLinesCount } from './components.js';
import { deleteLine } from './nets.js';
import { readLineCoords } from './nets/net-interaction.js';

export function el(tag, attrs, children) {
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
  const labels = readLabels(g);
  const rows   = getRows(g);
  const width  = getWidth(g);

  // Top / Bottom labels above the pin grid
  const topRow = el('div', { style: 'margin-bottom: 6px;' }, [
    el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, ['Top Label']),
    el('input', {
      type: 'text', value: labels.top || '',
      placeholder: 'e.g. U1',
      style: 'width: 100%; box-sizing: border-box;',
      oninput: (e) => {
        updateComponent(g, { labelTop: e.target.value });
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
        updateComponent(g, { labelBottom: e.target.value });
      },
    }),
  ]);
  body.appendChild(bottomRow);

  // Secondary checkbox
  const isSecondary = g.getAttribute('data-secondary') === 'true';
  const secondaryRow = el('div', { style: 'margin-bottom: 8px;' }, [
    el('label', { style: 'font-size: 11px; color: #666; display: flex; align-items: center; gap: 6px; cursor: pointer;' }, [
      el('input', {
        type: 'checkbox',
        checked: isSecondary,
        onchange: (e) => {
          if (e.target.checked) {
            g.setAttribute('data-secondary', 'true');
          } else {
            g.removeAttribute('data-secondary');
          }
        },
      }),
      'Secondary (grey fill)'
    ])
  ]);
  body.appendChild(secondaryRow);

  // Pin inputs (two-column grid)
  const grid = el('div', { class: 'pin-grid' });
  grid.appendChild(el('div', { class: 'pin-label' }, ['Pin Labels (left / right)']));
  for (let i = 0; i < rows; i++) {
    const li = el('input', {
      type: 'text', value: labels.left[i] || '',
      'data-side': 'L', 'data-row': String(i),
      oninput: (e) => {
        const idx = +e.target.getAttribute('data-row');
        const newL = readLabels(g).left.slice();
        newL[idx] = e.target.value;
        updateComponent(g, { labelL: newL });
      },
    });
    const ri = el('input', {
      type: 'text', value: labels.right[i] || '',
      'data-side': 'R', 'data-row': String(i),
      oninput: (e) => {
        const idx = +e.target.getAttribute('data-row');
        const newR = readLabels(g).right.slice();
        newR[idx] = e.target.value;
        updateComponent(g, { labelR: newR });
      },
    });
    grid.appendChild(li);
    grid.appendChild(ri);
  }
  body.appendChild(grid);

  // Row buttons
  const rowBtns = el('div', { class: 'btn-row', style: 'margin-bottom: 8px;' }, [
    el('button', { onclick: () => updateComponent(g, { addRow: true }) }, ['+ Row']),
    el('button', {
      onclick: () => updateComponent(g, { removeRow: true }),
      disabled: rows <= 1,
    }, ['- Row']),
  ]);
  body.appendChild(rowBtns);

  // Width buttons
  const widthBtns = el('div', { class: 'btn-row', style: 'margin-bottom: 8px;' }, [
    el('button', { onclick: () => updateComponent(g, { expand: true }) }, ['Expand (+50)']),
    el('button', {
      onclick: () => updateComponent(g, { contract: true }),
      disabled: width <= 50,
    }, ['Contract (-50)']),
  ]);
  body.appendChild(widthBtns);

  // Metadata
  const o = readOrigin(g);
  body.appendChild(el('pre', { class: 'meta' }, [
    `Position: (${o.x}, ${o.y})   Width: ${width}   Rows: ${rows}`,
  ]));

  // Delete
  body.appendChild(el('button', {
    class: 'danger',
    style: 'width: 100%; margin-top: 4px;',
    onclick: () => deleteComponent(g),
    title: "Delete Component  [x / Backspace / Delete]",
  }, ['Delete Component']));
}

function renderGndPanel(body, g) {
  clear(body);
  body.appendChild(el('h3', { style: 'margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: var(--fg-secondary);' }, ['Ground Connection']));

  const o = readOrigin(g);
  body.appendChild(el('pre', { class: 'meta' }, [
    `Position: (${o.x}, ${o.y})\nType: Static Reference`,
  ]));

  body.appendChild(el('button', {
    class: 'danger',
    style: 'width: 100%; margin-top: 4px;',
    onclick: () => deleteComponent(g),
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
      oninput: (e) => updateComponent(g, { labelPassive: e.target.value }),
    }),
  ]);
  body.appendChild(labelRow);

  const rotRow = el('div', { style: 'margin-bottom: 12px;' }, [
    el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, ['Rotation']),
    el('select', {
      style: 'width: 100%; padding: 4px; border-radius: var(--radius);',
      onchange: (e) => updateComponent(g, { rotatePassive: parseInt(e.target.value, 10) }),
    }, [
      el('option', { value: '0', selected: rot === '0' }, ['0 Degrees (Horizontal)']),
      el('option', { value: '90', selected: rot === '90' }, ['90 Degrees (Vertical)']),
    ]),
  ]);
  body.appendChild(rotRow);

  const o = readOrigin(g);
  body.appendChild(el('pre', { class: 'meta' }, [
    `Position: (${o.x}, ${o.y})\nType: Passive Ref (${type})\nRotation: ${rot}°`
  ]));

  body.appendChild(el('button', {
    class: 'danger',
    style: 'width: 100%; margin-top: 4px;',
    onclick: () => deleteComponent(g),
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
        updateComponent(g, { labelVdd: e.target.value });
      },
    }),
  ]);
  body.appendChild(labelRow);

  const o = readOrigin(g);
  body.appendChild(el('pre', { class: 'meta' }, [
    `Position: (${o.x}, ${o.y})\nType: Power Reference`,
  ]));

  body.appendChild(el('button', {
    class: 'danger',
    style: 'width: 100%; margin-top: 4px;',
    onclick: () => deleteComponent(g),
    title: "Delete VDD  [x / Backspace / Delete]",
  }, ['Delete Component']));
}


function renderContainerPanel(body, g) {
  clear(body);
  const width = getWidth(g);
  const height = getHeight(g);
  const currentFill = g.getAttribute('data-fill') || '#ffffff';

  body.appendChild(el('h3', { style: 'margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: var(--fg-secondary);' }, ['Layer Container']));

  // Width controls
  const widthLabel = el('div', { style: 'margin-bottom: 4px;' }, [
    el('label', { style: 'font-size: 11px; color: #666;' }, ['Width: ' + width + ' units'])
  ]);
  body.appendChild(widthLabel);

  const widthBtns = el('div', { class: 'btn-row', style: 'margin-bottom: 8px;' }, [
    el('button', { onclick: () => updateComponent(g, { expand: true }) }, ['Expand (+50)']),
    el('button', {
      onclick: () => updateComponent(g, { contract: true }),
      disabled: width <= 50,
    }, ['Contract (-50)']),
  ]);
  body.appendChild(widthBtns);

  // Height controls
  const heightLabel = el('div', { style: 'margin-bottom: 4px;' }, [
    el('label', { style: 'font-size: 11px; color: #666;' }, ['Height: ' + height + ' units'])
  ]);
  body.appendChild(heightLabel);

  const heightBtns = el('div', { class: 'btn-row', style: 'margin-bottom: 8px;' }, [
    el('button', { onclick: () => updateComponent(g, { expandVert: true }) }, ['Grow Tall (+50)']),
    el('button', {
      onclick: () => updateComponent(g, { contractVert: true }),
      disabled: height <= 50,
    }, ['Shrink (-50)']),
  ]);
  body.appendChild(heightBtns);

  // Fill Color dropdown
  const fillRow = el('div', { style: 'margin-bottom: 8px;' }, [
    el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, ['Fill Color']),
    el('select', {
      style: 'width: 100%; padding: 4px; border-radius: var(--radius);',
      onchange: (e) => updateComponent(g, { fillColor: e.target.value })
    }, [
      el('option', { value: '#ffffff', selected: currentFill === '#ffffff' }, ['Canvas White']),
      el('option', { value: '#f3f4f6', selected: currentFill === '#f3f4f6' }, ['Studio Gray']),
      el('option', { value: '#dbeafe', selected: currentFill === '#dbeafe' }, ['Logic Blue']),
      el('option', { value: '#dcfce7', selected: currentFill === '#dcfce7' }, ['Signal Green']),
      el('option', { value: '#fef9c3', selected: currentFill === '#fef9c3' }, ['Power Yellow']),
      el('option', { value: '#fee2e2', selected: currentFill === '#fee2e2' }, ['Hot Red']),
    ]),
  ]);
  body.appendChild(fillRow);

  const o = readOrigin(g);
  body.appendChild(el('pre', { class: 'meta' }, [
    `Position: (${o.x}, ${o.y})\nWidth: ${width}  Height: ${height}\nFill: ${currentFill}`
  ]));

  body.appendChild(el('button', {
    class: 'danger',
    style: 'width: 100%; margin-top: 4px;',
    onclick: () => deleteComponent(g),
    title: 'Delete Container  [x / Backspace / Delete]',
  }, ['Delete Container']));
}


function renderCommentPanel(body, g) {
  clear(body);
  const lines = readCommentLines(g);

  body.appendChild(el('h3', { style: 'margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: var(--fg-secondary);' }, ['Text Comment']));

  // Render an input field for each line
  for (let i = 0; i < lines.length; i++) {
    const lineRow = el('div', { style: 'margin-bottom: 6px;' }, [
      el('label', { style: 'font-size: 11px; color: #666; display: block; margin-bottom: 2px;' }, [`Line ${i + 1}`]),
      el('input', {
        type: 'text',
        value: lines[i] || '',
        placeholder: 'Comment text...',
        style: 'width: 100%; box-sizing: border-box;',
        oninput: (e) => {
          const updated = readCommentLines(g);
          updated[i] = e.target.value;
          updateComponent(g, { lines: updated });
        },
        onkeydown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && i === lines.length - 1) {
            e.preventDefault();
            g.__enterAddingLine = true;
            updateComponent(g, { addLine: true });
            // Sidebar re-rendered synchronously — find and focus the new last input
            const newInputs = body.querySelectorAll('input[type="text"]');
            const lastInput = newInputs[newInputs.length - 1];
            if (lastInput) lastInput.focus();
            // Clear flag after focus is set (next blur from re-render will skip delete)
            g.__enterAddingLine = false;
          }
        },
        onblur: () => {
          // Auto-delete comment if all lines are blank.
          // Skip when blur was caused by Enter-to-add-line re-render.
          if (g.__enterAddingLine) return;
          const allLines = readCommentLines(g);
          if (allLines.every(txt => !txt || txt.trim() === '')) {
            deleteComponent(g);
          }
        },
      }),
    ]);
    body.appendChild(lineRow);
  }

  // Add / Remove line buttons
  const rowBtns = el('div', { class: 'btn-row', style: 'margin-bottom: 8px;' }, [
    el('button', { onclick: () => updateComponent(g, { addLine: true }) }, ['+ Line']),
    el('button', {
      onclick: () => updateComponent(g, { removeLine: true }),
      disabled: lines.length <= 1,
    }, ['- Line']),
  ]);
  body.appendChild(rowBtns);

  const o = readOrigin(g);
  body.appendChild(el('pre', { class: 'meta' }, [
    `Position: (${o.x}, ${o.y})\nLines: ${lines.length}`,
  ]));

  body.appendChild(el('button', {
    class: 'danger',
    style: 'width: 100%; margin-top: 4px;',
    onclick: () => deleteComponent(g),
    title: 'Delete Comment  [x / Backspace / Delete]',
  }, ['Delete Comment']));
}

function renderLinePanel(body, line) {
  clear(body);
  const c = readLineCoords(line);
  body.appendChild(el('pre', { class: 'meta' }, [
    `Line  (${c.x1}, ${c.y1}) -> (${c.x2}, ${c.y2})\n` +
    `Length: ${Math.abs(c.x2 - c.x1) + Math.abs(c.y2 - c.y1)}   ` +
    (c.x1 === c.x2 ? 'Vertical' : (c.y1 === c.y2 ? 'Horizontal' : 'Non-ortho!')),
  ]));
  body.appendChild(el('button', {
    class: 'danger',
    style: 'width: 100%;',
    onclick: () => deleteLine(line),
    title: "Delete Line  [x / Backspace / Delete]",
  }, ['Delete Line']));
}

export function renderSidebar() {
  const body = document.getElementById('inspector-body');
  if (!body) return;
  const sel = appState.selected;
  if (!sel) return renderEmpty(body);
  if (sel.classList && sel.classList.contains('generic-component')) {
    if (sel.classList.contains('comment-component')) {
      return renderCommentPanel(body, sel);
    }
    if (sel.classList.contains('container-component')) {
      return renderContainerPanel(body, sel);
    }
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

export function initSidebar() {
  window.addEventListener('selection-change', renderSidebar);
  renderSidebar();
}
