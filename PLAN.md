# Implementation Plan: Electrical Block Diagram SVG Editor

This plan implements the application described in `SPEC.md` from the ground up
as a no-build, vanilla HTML/CSS/JS web app with a 25-unit grid, three operating
modes, generic block components, point-to-point net drawing, dynamic T-junction
detection, sidebar editing, and SVG text serialization (Data Portal).

The DOM is the source of truth. No bundler, no framework, no transpilation.

---

## Phase 0 — Project Scaffolding

Establish the directory layout and empty file shells described in §5.1 of
`SPEC.md`. Each file exists at this point but contains only minimal stubs so
that `index.html` can load them in dependency order without 404s.

- [x] Create the project directory tree:
      `index.html`, `styles.css`, and `js/`
- [x] Create `js/state.js` (stub: `appState` + `setMode()`)
- [x] Create `js/components.js` (stub: empty module)
- [x] Create `js/nets.js` (stub: empty module)
- [x] Create `js/interactions.js` (stub: empty module)
- [x] Create `js/sidebar.js` (stub: empty module)
- [x] Create `js/serialization.js` (stub: empty module)
- [x] Create `js/main.js` (stub: `DOMContentLoaded` listener)
- [x] Author `index.html` with `<head>`, `<link rel="stylesheet" href="styles.css">`,
      and `<script>` tags in dependency order at the end of `<body>`:
      `state.js` → `components.js` → `nets.js` → `interactions.js` →
      `sidebar.js` → `serialization.js` → `main.js` (all with `defer`)
- [x] Add the three required DOM regions to `index.html`:
      - A mode-toggle **toolbar** (Select/Edit, Drag, Connection)
      - An interactive **SVG canvas** (`<svg id="canvas">`) with a viewBox
      - A right-hand **sidebar** placeholder (`<aside id="sidebar">`)
      - A bottom **Data Portal** (`<textarea id="data-portal">` plus Export/Import buttons)

---

## Phase 1 — Grid Architecture & Global Constants (§1)

Make the 25-unit grid the foundation of everything. Every coordinate on the
canvas and inside components must be a multiple of 25.

- [x] Define a single `GRID = 25` constant in `state.js` (exported on `window`)
      plus derived helpers `snap(v)`, `toGrid(px)`, `fromGrid(g)`
- [x] Set the `<svg>` viewBox to a large, well-defined extent (e.g.
      `0 0 2000 1500`) and add `preserveAspectRatio="xMidYMid meet"`
- [x] Add a `g.grid-overlay` layer at the top of the SVG containing two
      `<pattern>` definitions (or pre-rendered `<line>` grid) drawn at 25-unit
      intervals, lighter at every line, slightly darker every 100 units
- [x] Implement `pointerToGrid(evt)` in `interactions.js` that converts a
      `MouseEvent` to a snapped `(x, y)` in grid coordinates using
      `svg.getScreenCTM().inverse()` and `snap()`

---

## Phase 2 — State & Mode Switching (§1, §4)

Wire up the three mutually exclusive operating modes through `appState` and
the toolbar.

- [x] In `state.js`, define `appState = { mode: 'select', selected: null,
      drawStart: null }` and `setMode(mode)` which updates `appState.mode`,
      clears `selected` if needed, and dispatches a `modechange` event
- [x] Style the three toolbar buttons in `styles.css` with an `.active` class
      applied when their mode matches `appState.mode`
- [x] In `main.js` (or `interactions.js`), bind click handlers on the toolbar
      buttons to call `setMode('select' | 'drag' | 'connect')`

---

## Phase 3 — Generic Block Component (§2)

Build the modular `<g class="generic-component">` per the spec, including the
exact DOM example with `<rect>` and pin `<text>` elements.

- [x] In `components.js`, implement `createComponent(x, y, width, rows)`:
      - Validate `width % 50 === 0` and `rows >= 1`
      - Build the `<g>` with `transform="translate(x, y)"`, a child
        `<rect x="0" y="-25" width="width" height="(rows + 1) * 25">`, and
        two `<text>` elements per row at `y = 25 * i` (i from 0 to rows-1)
      - Left pin `text-anchor="start"` at `x="5"`, right pin
        `text-anchor="end"` at `x="width - 5"`
      - All `<text>` use `dominant-baseline="middle"`, `font-family="sans-serif"`,
        `font-size="12"`
      - Tag the `<g>` with a unique `data-id` for later lookup
- [x] Add a default pin-label placeholder (e.g. "L1"/"R1") so the component
      is visible immediately
- [x] Append the new component to the canvas inside a `g.components` layer
- [x] In `main.js`, expose a "Add Component" toolbar button that calls
      `createComponent` with a sensible default (`x=100, y=100, width=100, rows=2`)
- [x] Implement `updateComponent(el, patch)` to support:
      - `labelL: string[]`, `labelR: string[]` (length must match `rows`)
      - `addRow()` / `removeRow()` (height adjusts by ±25, new blank pins appended)
      - `expand()` / `contract()` (width adjusts by ±50, right-side `text` x moves)
- [x] Implement `deleteComponent(el)`: remove from DOM, clear selection,
      re-run `recomputeJunctions()`

---

## Phase 4 — Selection & Sidebar Editing (§4.1)

When in Select/Edit mode, clicking an element highlights it and opens a
contextual sidebar panel.

- [x] In `interactions.js`, add a single `click` listener on the SVG canvas
      that:
      - Computes the click target (walk up to `.generic-component` or `.net-line`)
      - Sets `appState.selected` to that element
      - Adds an `.is-selected` class to it (used for highlight styling)
- [x] Add CSS for `.is-selected` (e.g. 2px blue outline on the rect, or a
      overlay `<rect>` for the component body)
- [x] Clicking empty canvas clears selection
- [x] In `sidebar.js`, implement `renderSidebar()` which dispatches on
      `appState.selected`:
      - `null` → show a neutral "Nothing selected" message
      - `.generic-component` → render the **Block Component Settings Panel**
      - `.net-line` → render the **Line Net Settings Panel**
- [x] **Component panel** contents (in this order):
      - A two-column list of `<input type="text">` for each pin row (left
        and right labels). `oninput` updates the corresponding `<text>` node
        directly and live.
      - `+ Row` and `- Row` buttons → `updateComponent(el, { addRow | removeRow })`
      - `Expand` and `Contract` buttons → width ±50
      - `Delete Component` button → `deleteComponent(el)`
- [x] **Line net panel** contents:
      - Read-only metadata: `(x1, y1) → (x2, y2)`
      - `Delete Line` button → `deleteLine(el)`
- [x] Re-render the sidebar after any selection change or data mutation so it
      always reflects the current element

---

## Phase 5 — Drag Mode & Grid Isolation (§4.2)

In Drag mode, allow repositioning components and line endpoints. Per the
spec, nets do **not** rubber-band; they remain fixed and the connection
visually disconnects.

- [x] In `interactions.js`, add `pointerdown` on a `.generic-component` while
      in `drag` mode → start a translate drag; track offset in grid units
- [x] On `pointermove`, update the component's `transform` to the snapped
      pointer position
- [x] On `pointerup`, finalize the transform and call `recomputeJunctions()`
- [x] Add `pointerdown` on the endpoint hit-targets of a `.net-line`:
      - Use a small invisible `<rect>` or compute the nearest endpoint from
        pointer position (within 12 screen units of an endpoint)
      - Mark which endpoint is being dragged (`'start' | 'end'`)
- [x] On `pointermove`, update the dragged endpoint's `x1/y1` or `x2/y2`:
      - For a horizontal line (`y1 === y2`), dragging the endpoint
        vertically must move **both** endpoints (so the whole line shifts
        along the parallel axis). Same for vertical lines dragged horizontally.
      - Endpoint must always land on a grid intersection
- [x] On `pointerup`, snap final position and call `recomputeJunctions()`

---

## Phase 6 — Connection Mode & Point-to-Point Drawing (§3.1)

Strictly orthogonal, single-segment net drawing via two clicks.

- [x] In `interactions.js`, on first `click` in `connect` mode:
      - Record the start point in `appState.drawStart`
      - Create a temporary preview `<line class="net-preview">` element
        with `pointer-events="none"`
- [x] On `pointermove`:
      - Compute the pointer in grid coords
      - Determine dominant axis: whichever delta is larger, lock the other
        axis to `appState.drawStart`
      - Update the preview line endpoints accordingly
- [x] On second `click`:
      - Snap final endpoint, call `createLine(x1, y1, x2, y2)` in `nets.js`
      - Remove the preview line
      - Clear `appState.drawStart`
- [x] On `Escape` (or right-click) during draw, cancel and clear the preview
- [x] All preview and final line coordinates must be multiples of 25
- [x] Reject zero-length lines (start === end) silently

---

## Phase 7 — Net CRUD & T-Junction Logic (§3)

Implement line creation, deletion, splitting, and the dynamic 3-or-4
endpoint junction heuristic.

- [x] In `nets.js`, implement `createLine(x1, y1, x2, y2)`:
      - Build a `<line class="net-line" data-id="…">` with `stroke="#000000"`,
        `stroke-width="2"`
      - Append to a `g.nets` layer
      - Call `splitLineAt` against all existing lines to handle T-junctions
      - Call `recomputeJunctions()`
- [x] Implement `deleteLine(el)`: remove from DOM, then `recomputeJunctions()`
- [x] Implement `splitLineAt(line, x, y)`:
      - Given the new line's start or end `(x, y)`, find any existing line
        that has this point strictly **in the interior** of its segment
        (i.e. not at either endpoint, but lying on the segment)
      - Replace the target line with two new lines whose shared endpoint is
        `(x, y)`. Preserve the original `data-id` on one of the halves and
        give the new half a fresh id.
- [x] Implement `recomputeJunctions()`:
      - Walk every `.net-line` and collect both endpoints
      - Group by coordinate key `"x,y"`
      - For each key with count `=== 3 || === 4`:
        - Ensure a `<circle class="junction" r="4" cx="x" cy="y">` exists in
          the `g.junctions` layer (create if missing, match by `data-coord`)
      - For each key with count `<= 2`:
        - Remove the corresponding `<circle>` if present

---

## Phase 8 — Serialization & Data Portal (§6)

Implement Export/Import of the raw SVG.

- [x] In `serialization.js`, implement `exportSchema()`:
      - Deep-clone the live `<svg>` via `cloneNode(true)`
      - Strip transient layers: any element with class `net-preview`,
        `drag-handle`, `selection-ring`, etc.
      - Strip any `data-id` (or keep them — design decision, but be consistent
        with import)
      - Serialize via `XMLSerializer.serializeToString`
      - Return the string
- [x] Implement `importSchema(text)`:
      - Wipe `g.components`, `g.nets`, and `g.junctions`
      - Parse with `DOMParser` (`image/svg+xml`)
      - Validate: `<svg>` root, every `.generic-component` has required
        children, every `.net-line` has integer-multiple-of-25 coords
      - Re-attach event listeners to imported nodes (delegate via canvas
        listener — they are picked up automatically)
      - Run `recomputeJunctions()`
      - Clear `appState.selected`
- [x] In the DOM (sidebar footer or layout bottom), add:
      - `<textarea id="data-portal" rows="10">`
      - `<button id="export-btn">Export Schema</button>`
      - `<button id="import-btn">Import Schema</button>`
- [x] Wire Export button: call `exportSchema()`, set `textarea.value` to the
      result
- [x] Wire Import button: call `importSchema(textarea.value)`, then refresh
      the sidebar
- [x] Style the textarea and buttons in `styles.css` (monospace, full width,
      fixed height, scrollable)

---

## Phase 9 — Styling & Visual Polish

Make the editor feel like a real tool, not a debug page.

- [x] In `styles.css`:
      - Three-column layout: toolbar (left), canvas (center), sidebar (right)
      - Data Portal docked to the bottom of the sidebar
      - Mode-toggle button group with clear active/inactive states
      - `.is-selected` highlight using a non-destructive overlay
- [x] Set the canvas background to a faint grid color and the SVG body
      background to white
- [x] Use CSS variables for the color palette to keep theming consistent
- [x] Ensure cursor changes per mode (`default` in Select, `grab/grabbing`
      in Drag, `crosshair` in Connect)
- [x] Add hover affordance: when hovering an element in Select mode, show
      a subtle outline so users know it's clickable

---

## Phase 10 — Edge Cases & Hardening

Catch the failure modes the spec implies but doesn't enumerate.

- [x] Contract width below 50 is prevented; button is disabled
- [x] `- Row` is disabled when `rows === 1`
- [x] Deleting a component or line never leaves stale `data-id` references
      in the sidebar
- [x] Importing malformed XML shows a visible error in the Data Portal area
      and leaves the existing canvas untouched
- [x] Importing SVG text with off-grid coordinates snaps the offending
      values to the nearest grid intersection (or rejects with an error —
      pick one and document it)
- [x] Rapid double-clicks in Connect mode don't create duplicate zero-length
      lines
- [x] Resizing the browser window does not break the grid overlay alignment
- [x] Page can be opened with `file://` (double-click `index.html`) and works
      fully — no `fetch`, no modules requiring a server

## Phase 11 — Finalization

- [x] Remove any leftover debug logging
- [x] Confirm `.gitignore` covers `.bash_agent_tmp/` and `*.tmp`
- [x] Update `README.md` (if present) with a one-paragraph "how to run"
- [x] Commit with a descriptive message: e.g. `Initial implementation of
      EE-Sketcher per SPEC.md`

---

## Summary of File Deliverables

| File                     | Purpose                                              |
|--------------------------|------------------------------------------------------|
| `index.html`             | Layout + script tags (entry point)                   |
| `styles.css`             | All visual styling                                   |
| `js/state.js`            | `appState`, `setMode`, grid helpers                  |
| `js/components.js`       | `createComponent`, `updateComponent`, `deleteComponent` |
| `js/nets.js`             | `createLine`, `deleteLine`, `splitLineAt`, `recomputeJunctions` |
| `js/interactions.js`     | Pointer event dispatch per mode                      |
| `js/sidebar.js`          | Contextual settings panel rendering                  |
| `js/serialization.js`    | `exportSchema`, `importSchema`                       |
| `js/main.js`             | `DOMContentLoaded` bootstrap                         |

When every box above is checked, the application will satisfy `SPEC.md`
end-to-end with no build step, no framework, and the DOM as the single
source of truth.
