# EE-Sketcher — Electrical Block Diagram SVG Editor

## 1. Core Concept & Grid Architecture

A lightweight, single-page web application specialized in generating clean, grid-aligned electrical block diagrams (simplified schematics). Runs entirely client-side with no build step, no server, and no framework dependencies.

* **The Canvas Grid:** All structural coordinates (component positions, widths, heights, and line endpoints) snap to multiples of a **25-unit grid** (`GRID = 25`). All coordinate helpers (`snap`, `toGrid`, `fromGrid`, `clamp`) are exposed globally from `state.js`.
* **World Bounds:** The drawing area extends from (0,0) to (1500, 1000) in SVG user units. All components and lines are clamped to remain within these bounds.
* **Application Modes:** The application switches between three mutually exclusive operating modes via toolbar buttons or keyboard shortcuts:
  1. **Select/Edit Mode** (`S` key): For selecting elements and editing attributes in the sidebar.
  2. **Drag Mode** (`D` key): For moving components and dragging net endpoints.
  3. **Connect Mode** (`C` key): For drawing point-to-point electrical nets.

---

## 2. Component Specification (Generic Block)

The **Generic Block** is a modular, rectangular SVG `<g>` group component representing an electrical device.

### 2.1 Geometry & Vector Architecture

* **Origin Alignment:** The top-left pin connection point serves as the local `(0,0)` origin of the component's `<g>` tag (`transform="translate(x, y)"`).
* **Symmetrical Padding:** The component body extends 25 units above the first pin row, and 25 units below the last pin row.
* **Dimensional Formulas:** For a component with N rows of pins spaced 25 units apart:
  * The internal `<rect>` y-coordinate is fixed at `y="-25"`.
  * The `<rect>` height is: `Height = (N + 1) * 25`.
  * The `<rect>` has rounded corners (`rx="6" ry="6"`).
* **Width Rules:** Component width is variable but must always be a multiple of 50 units (e.g., 100, 150, 200). If an invalid width is provided, it snaps up to the next legal multiple.

### 2.2 Pin Layout

* Pins have no explicit vector tick marks or circle graphic indicators. Their locations are implied entirely by their textual labels.
* **Left-Side Pins:** `text-anchor="start"` at `x="5"`.
* **Right-Side Pins:** `text-anchor="end"` at `x="width - 5"`.
* **Vertical Alignment:** All pin labels use `dominant-baseline="middle"`.

### 2.3 Top & Bottom Labels

Each component has two additional text elements for identification:
* **Top Label:** Centered above the rect at `x="width/2" y="-35"`, `text-anchor="middle"`, bold 14px sans-serif.
* **Bottom Label:** Centered below the rect at `x="width/2" y="N*25 + 10"`, `text-anchor="middle"`, bold 14px sans-serif.

### 2.4 Data Attributes

For serialization round-trip and sidebar reads, each component stores layout metadata:
* `data-id`: Unique identifier.
* `data-width`: Component width (SVG units).
* `data-rows`: Number of pin rows.
* `data-label-top`: Top label text.
* `data-label-bottom`: Bottom label text.
* Each pin text element has `data-side` (`L`/`R`) and `data-row` attributes.

---

## 3. Net Connections & Junctions

All electrical paths are `<line>` elements with `class="net-line"`.

### 3.1 Routing Constraints

* **Orthogonal Enforcement:** All lines must be strictly horizontal or vertical. During drawing and dragging, the longer axis determines the line's orientation.
* **Drawing Interaction:** In Connect Mode (`C`):
  * **Click 1:** Locks the starting grid intersection. A dashed preview line appears and follows the cursor, constrained to horizontal or vertical.
  * **Movement:** The preview line shows the proposed segment.
  * **Click 2:** Instantiates the `<line>` segment and terminates the drawing action.

### 3.2 Validation During Creation

Before a line is drawn, it is validated against two rules:
* **No Overlap:** The new line must not overlap any existing line on the same axis (collinear segments sharing a positive-length interval are rejected).
* **No Component Intersection:** The new line must not pass through any component's bounding rect.

If validation fails, the preview line renders as a red dashed line (`class="net-preview invalid"`) and the second click cancels the operation (no line is drawn).

### 3.3 Stateless Topology Engine

Rather than per-operation split/merge logic, the application uses a comprehensive stateless engine: `refreshNetTopology()` runs three passes across the entire DOM:

1. **`splitAllLines()`** — Scans every line against every endpoint coordinate. If any endpoint lies on the interior of any line segment, that segment is split into two independent `<line>` elements sharing that grid coordinate. Loops until no more splits occur.

2. **`mergeLines()`** — Scans every pair of collinear lines on the same axis. If their intervals overlap (positive-length intersection), they are merged into their envelope. If they merely touch at a single point (endpoint-to-endpoint), they are merged only when that shared coordinate has exactly two line endpoints (a plain butt-join, not a T-junction). Loops until no more merges are possible.

3. **`recomputeJunctions()`** — Counts terminating line endpoints at every grid coordinate. If a coordinate has **3 or 4 endpoints**, a junction dot (SVG `<circle r="4" class="junction">`) is placed there. Coordinates with 2 or fewer endpoints have any junction circle removed.

This engine runs after every structural mutation: line creation, deletion, endpoint drags, component creation/deletion, and import.

---

## 4. User Interaction & Editor States

### 4.1 Selection & Sidebar Editing

When an element is clicked in **Select/Edit Mode**, it is highlighted with a blue stroke (`class="is-selected"`) and a contextual editing form renders in the sidebar. In Select Mode, a near-miss click (within 10 SVG user units of a line's segment path) still selects the line for a forgiving UX.

#### Block Component Settings Panel

* **Top Label** — single text input.
* **Bottom Label** — single text input.
* **Pin Labels** — two-column grid of text inputs mapped to left and right pin rows. Inputs read from the SVG DOM (source of truth) on every keystroke to avoid stale-closure overwrites.
* **Row Modification:**
  * **+ Row** — Adds a pin row. Increases component height by 25 units, shifting the bottom label.
  * **- Row** — Removes the last pin row (disabled when rows ≤ 1).
* **Width Modification:**
  * **Expand (+50)** — Increases width by 50 units.
  * **Contract (-50)** — Decreases width by 50 units (disabled when width ≤ 50).
* **Metadata** — Displays position, width, and row count in monospace.
* **Delete Component** — Danger-styled button.

#### Line Net Settings Panel

* Displays endpoint coordinates, line length, and orientation (Horizontal/Vertical).
* **Delete Line** — Danger-styled button.

Label-only edits (typing in pin label inputs) do **not** re-render the sidebar panel (which would blow away focus). Structural changes (+Row, -Row, Expand, Contract) do trigger a re-render.

### 4.2 Dragging Rules

When in **Drag Mode** (`D`):

* **Component Translation:** Dragging a component translates its top-left pin origin to a new snapped grid coordinate, clamped within world bounds.
* **Line Endpoint Dragging:** Each line has two transparent `<rect class="endpoint-hit">` hit-targets (14×14 SVG units) centered on its endpoints. Dragging an endpoint shifts it to a new grid location:
  * Dragging a horizontal line's endpoint vertically shifts the entire line along the parallel axis (maintaining horizontality).
  * Dragging a vertical line's endpoint horizontally shifts the entire line (maintaining verticality).
* **Static Grid Disconnection:** Nets do **not** rubber-band or dynamically follow moving components. Connections remain fixed on the grid. The full topology engine runs on drop.

### 4.3 Keyboard Shortcuts

* `S` — Switch to Select/Edit mode.
* `D` — Switch to Drag mode.
* `C` — Switch to Connect mode.
* `A` — Add a new Generic Block component (centered in current viewport).
* `X`, `Backspace`, or `Delete` — Delete the currently selected element.
* `Escape` — Cancel in-progress draw, cancel drag, or clear selection.

Keyboard shortcuts are suppressed when focus is in an `<input>`, `<textarea>`, or `<select>` element.

### 4.4 Hover Feedback

* Components and lines highlight with a blue stroke on hover (`.generic-component:hover .component-body`, `.net-line:hover`).
* Selected elements get a thicker blue stroke (`.is-selected`).

---

## 5. Viewport / Pan & Zoom

The canvas uses a dynamic `viewBox` managed by `viewport.js`, replacing the static 1500×1000 default with a viewport that the user can pan and zoom.

### 5.1 Controls

* **Wheel (plain):** Pan vertically and horizontally.
* **Shift + Wheel:** Horizontal pan only.
* **Ctrl/Cmd + Wheel (or trackpad pinch-zoom):** Zoom in/out around the cursor position.

### 5.2 Constraints

* **Zoom Limits:** 0.1× (far out) to 8× (close in).
* **Clamped Panning:** The viewBox never exceeds the 1500×1000 world bounds.
* **Aspect Ratio:** Always matches the canvas container — preserved via `preserveAspectRatio="xMidYMid meet"`.
* **Resize:** On window resize, the view adjusts to maintain the same center point and scale.

### 5.3 Default View

On load, the viewBox opens centered on the world at roughly 2× zoom on a typical monitor (width between 800 and 1500).

---

## 6. Implementation Architecture

### 6.1 File / Directory Layout

```
/
├── index.html          # HTML5 structural markup; the only entry point
├── styles.css          # All CSS3 styling (layouts, grid overlays, UI formatting)
├── SPEC.md             # This specification
├── LICENSE             # License file
└── js/
    ├── main.js         # Entry point: bootstraps state, wires event listeners, runs init()
    ├── state.js        # GRID constant, snap helpers, appState, setMode(), event bus
    ├── viewport.js     # Dynamic viewBox, pan & zoom with wheel/pinch, coordinate helpers
    ├── components.js   # Generic Block component create / update / delete logic
    ├── nets.js         # Line net CRUD, stateless topology engine (split/merge/junction)
    ├── interactions.js # Pointer/click handlers: select, drag-translate, drag-endpoint, connect-draw
    ├── sidebar.js      # Sidebar rendering & forms: pin labels, row +/-, width +/-, delete buttons
    └── serialization.js# Export Schema / Import Schema (XMLSerializer, DOMParser, re-binding)
```

### 6.2 Asset Loading

* `index.html` loads `styles.css` in `<head>` and all scripts at end of `<body>` with `defer`, in dependency order:
  `state.js` → `viewport.js` → `components.js` → `nets.js` → `interactions.js` → `sidebar.js` → `serialization.js` → `main.js`
* All modules attach to the global `window` namespace via IIFEs.

### 6.3 Constraints (Preserved)

* **No Build Step:** No compiler, bundler, node modules, or third-party framework runtime libraries. Plain files deployed as-is.
* **No Server Required:** Runs by opening `index.html` in any modern browser.
* **DOM as State:** The interactive SVG canvas is the primary source of truth. No JSON backing store, no virtual DOM, no reactive framework.
* **Plain ES6+ JavaScript:** Native ES6+ syntax with IIFE-based modules on `window`.

---

## 7. Serialization & Data Persistence (Save/Load)

### 7.1 The Data Portal

A persistent sidebar section containing:
* A scrollable `<textarea>` (monospace font).
* **Export Schema** button.
* **Import Schema** button.
* Status message (auto-clears after 5 seconds).

### 7.2 Exporting

1. Clone the live `<svg>` element.
2. Strip transient layers: `g.overlay`, `g.grid-overlay`, hit-targets, preview lines.
3. Strip interaction state classes (`is-selected`, `is-dragging`).
4. Save the current `viewBox` as a `data-view-box` attribute for round-trip.
5. Reset the SVG's `viewBox` to `"0 0 1500 1000"` for standalone portability.
6. Serialize via `XMLSerializer` with an XML declaration.
7. Inject into the `<textarea>`.

### 7.3 Importing

1. Parse the input string via `DOMParser`.
2. Validate the root `<svg>` element and layer structure.
3. Snap all imported coordinates: net line endpoints, component transforms, rect widths, right-side pin x-positions, junction centers.
4. Wipe the live canvas layers (`nets-layer`, `components-layer`, `junctions-layer`, `overlay-layer`).
5. Adopt imported children into the live layers via `importNode`.
6. Re-attach endpoint hit-targets to all imported lines.
7. Ensure all elements have `data-id`, `data-width`, `data-rows`, `data-label-top`, `data-label-bottom` attributes.
8. Run `refreshNetTopology()` (split → merge → junctions).
9. Clear selection and re-render sidebar.
10. Restore the saved viewBox from `data-view-box` if present.

---

## 8. Styles & Theming

CSS variables define the complete visual theme (colors, shadows, radii, fonts) in `:root`. All styling — grid overlays, sidebar layout, button states, selection highlights, mode cursors, preview lines — lives in `styles.css`.

Grid rendering uses two nested SVG `<pattern>` elements:
* **Fine grid:** 25×25 units, light strokes.
* **Coarse grid:** 100×100 units, darker strokes, with the fine grid as fill.
* **Background:** `#fffff0` (warm off-white) behind the grid.

Cursors change per mode: `default` (select), `grab`/`grabbing` (drag), `crosshair` (connect).
```
