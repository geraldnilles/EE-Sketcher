# Electrical Block Diagram SVG Editor

## 1. Core Concept & Grid Architecture

The objective is to create a lightweight, single-page web application specialized in generating clean, grid-aligned electrical block diagrams (simplified schematics).

* **The Canvas Grid:** The entire application operates on a strict **25-unit grid**. All structural coordinates (component positions, widths, heights, and line coordinates) must be integers perfectly divisible by 25.
* **Application Modes:** The application UI switches between three mutually exclusive operating modes via a sidebar toggle:
1. **Select/Edit Mode (Default):** For selecting elements and editing attributes in the sidebar.
2. **Drag Mode:** For moving components and rearranging net connections.
3. **Connection Mode:** For drawing point-to-point electrical nets.



---

## 2. Component Specification (Generic Block)

The **Generic Block** is a modular, rectangular SVG `<g>` group component representing an electrical device.

### 2.1 Geometry & Vector Architecture

* **Origin Alignment:** The top-left pin connection point serves as the local `(0,0)` origin of the component's `<g>` tag.
* **Symmetrical Padding:** The component body extends exactly 25 units above the first pin row, and exactly 25 units below the last pin row.
* **Dimensional Formulas:** For a component with $N$ rows of pins spaced 25 units apart:
* The internal `<rect>` y-coordinate is fixed at `y="-25"`.
* The height of the `<rect>` is calculated as: $\text{Height} = (N + 1) \times 25$.


* **Width Rules:** Component width is variable but must always be a multiple of 50 units (e.g., 100, 150, 200) to ensure right-side pins consistently snap to the global 25-unit grid.

### 2.2 Pin & Label Layout

* Pins have no explicit vector tick marks or circle graphic indicators. Their locations are implied entirely by their textual labels.
* **Left-Side Pins:** Text anchors at the start of the string (`text-anchor="start"`) positioned at `x="5"`.
* **Right-Side Pins:** Text anchors at the end of the string (`text-anchor="end"`) positioned at `x="width - 5"`.
* **Vertical Alignment:** All labels utilize `dominant-baseline="middle"` to perfectly center align the text with the electrical grid node.

#### Example SVG DOM Structure (2-Row Component, Width = 100)

```svg
<g transform="translate(100, 150)" class="generic-component">
  <rect x="0" y="-25" width="100" height="75" class="component-body" fill="#ffffff" stroke="#000000" stroke-width="2"/>
  
  <text x="5" y="0" text-anchor="start" dominant-baseline="middle" font-family="sans-serif" font-size="12">VIN</text>
  <text x="95" y="0" text-anchor="end" dominant-baseline="middle" font-family="sans-serif" font-size="12">SW</text>
  
  <text x="5" y="25" text-anchor="start" dominant-baseline="middle" font-family="sans-serif" font-size="12">EN</text>
  <text x="95" y="25" text-anchor="end" dominant-baseline="middle" font-family="sans-serif" font-size="12">FB</text>
</g>

```

---

## 3. Net Connections & Junctions

All electrical paths are represented explicitly as simple SVG `<line>` elements.

### 3.1 Routing Constraints

* **Orthogonal Enforcement:** All lines must be strictly horizontal or vertical.
* **Drawing Interaction (Single-Segment Mode):** In Connection Mode, a user creates lines via point-to-point mouse clicks:
* **Click 1:** Locks the starting grid intersection.
* **Movement:** Displays a preview line constrained to the nearest horizontal or vertical grid vector.
* **Click 2:** Instantiates the standalone `<line>` segment and terminates the current drawing action. Continuous path/multi-segment auto-routing is omitted for simplicity.



### 3.2 Junction Logic & Line Splitting

* **Unconnected Crossovers:** Net lines are permitted to cross each other visually without creating a connection. No graphics are generated for simple overlaps.
* **T-Junction Generation:** If a new line endpoint terminates directly on top of an existing line segment, the application splits the target line into two distinct, independent `<line>` segments sharing that grid coordinate.
* **Dynamic Junction Heuristic:** Junction visibility is dynamically calculated based on node density:
* The system counts the total number of line endpoints terminating at any given grid coordinate.
* If a coordinate contains **3 or 4 line endpoints**, a junction symbol—an SVG `<circle r="4">` centered on the coordinate—is dynamically added to the canvas.
* If changes in topology drop the endpoint count at a coordinate to **2 or fewer**, the junction circle is automatically deleted.



---

## 4. User Interaction & Editor States

### 4.1 Selection & Sidebar Editing

When an element is clicked in **Select/Edit Mode**, it is highlighted on the canvas, and a contextual editing form renders in the application sidebar.

#### Block Component Settings Panel

* **Pin Label Configuration:** Displays a two-column layout of text input boxes mapping directly to the left and right pin rows. Updates to these inputs modify the `<text>` element values in real time.
* **Row Modification:**
* **`+` Button:** Adds a new row to the bottom of the component, increasing its height by 25 units and adding two new blank text boxes to the sidebar.
* **`-` Button:** Removes the bottom-most row of pins, reducing the component height by 25 units.


* **Width Modification:**
* **Expand Button:** Increases component width by 50 units.
* **Contract Button:** Decreases component width by 50 units.


* **Component Removal:** Features a dedicated **"Delete Component"** UI button.

#### Line Net Settings Panel

* Displays basic metadata regarding the net segment.
* Features a dedicated **"Delete Line"** UI button.

### 4.2 Dragging Rules (Static Grid Isolation)

When the application is in **Drag Mode**, users can reposition individual assets on the grid using standard pointer interactions.

* **Component Translation:** Dragging a component translates its top-left pin reference origin to a new global grid coordinate.
* **Line Modification:** Users can select an individual line and drag either its start or end point to a new grid location. To maintain strict orthogonality, dragging a horizontal line's endpoint vertically shifts the entire line along the parallel axis (and vice-versa for vertical lines).
* **Static Grid Disconnection:** When a component or line is dragged, any associated nets do **not** rubber-band or dynamically follow the moving asset. The connections remain fixed on the grid, separating visually from the asset. Topology updates and junction evaluations recalculate immediately upon dropping the asset.

### 4.3 Deletion Lifecycle

For the MVP, object destruction is strictly UI-driven to keep state synchronization straightforward. Keyboard shortcuts (`Delete`/`Backspace`) are omitted. Clicking the "Delete" button inside an asset's corresponding sidebar panel removes the asset from the DOM immediately and re-runs the dynamic junction cleanup engine.

---

## 5. Implementation Architecture

To maximize portability, ease of deployment, and simplicity, the editor is written entirely as a vanilla web asset, split across multiple files for maintainability. All assets are co-located in the project root and linked together at load time.

### 5.1 File / Directory Layout

The application is composed of one HTML file, one CSS file, and several JavaScript files, organized as follows:

```
/
├── index.html          # HTML5 structural markup; the only entry point
├── styles.css          # All CSS3 styling (layouts, grid overlays, UI formatting)
└── js/
    ├── main.js         # Entry point: bootstraps state, wires event listeners, runs init()
    ├── state.js        # Application state & mode switching (Select/Edit, Drag, Connection)
    ├── components.js   # Generic Block component create / update / delete logic
    ├── nets.js         # Line net CRUD, T-junction detection, line splitting, junction circles
    ├── interactions.js # Pointer/click handlers: select, drag-translate, drag-endpoint, connection-drawing
    ├── sidebar.js      # Sidebar rendering & forms: pin labels, row +/-, width +/-, delete buttons
    └── serialization.js# Export Schema / Import Schema (XMLSerializer, DOMParser, re-binding)
```

### 5.2 Asset Linking

* **`index.html`** contains the structural markup (sidebar, toolbar, canvas `<svg>`, Data Portal `<textarea>`) and pulls in the other assets declaratively:
  * `<link rel="stylesheet" href="styles.css">` in `<head>`.
  * `<script src="js/serialization.js"></script>` ... `<script src="js/main.js"></script>` at the end of `<body>`, loaded with `defer` (or as plain scripts placed in dependency order: `state.js` → `components.js` → `nets.js` → `interactions.js` → `sidebar.js` → `serialization.js` → `main.js`).
* **`styles.css`** owns every visual concern: grid overlay rendering, sidebar layout, button styling, selection highlight, mode-toggle active states, and the Data Portal `<textarea>` appearance.
* **`js/state.js`** exposes a single shared `appState` object (current mode, selected element reference, last-drawn net start point) and a `setMode(mode)` function. All other modules read from and write to this object.
* **`js/components.js`** defines `createComponent(x, y, width, rows)`, `updateComponent(el, patch)`, `deleteComponent(el)`, and helpers to add/remove pin rows and adjust width by 50-unit increments.
* **`js/nets.js`** defines `createLine(x1, y1, x2, y2)`, `deleteLine(el)`, `splitLineAt(line, x, y)`, and `recomputeJunctions()` — the latter scans every line endpoint, groups them by grid coordinate, and adds/removes `<circle r="4">` junction nodes per the 3-or-4-endpoint heuristic.
* **`js/interactions.js`** attaches all pointer event listeners to the SVG canvas. It dispatches to the correct behavior based on `appState.mode` (selection, drag-translation, drag-endpoint, or connection point-to-point drawing).
* **`js/sidebar.js`** reads the currently selected element from `appState` and renders the appropriate settings panel (component panel with pin labels / row + / row - / expand / contract / delete, or line net panel with metadata and delete).
* **`js/serialization.js`** implements `exportSchema()` (clone the `<svg>`, strip transient UI layers, `XMLSerializer.serializeToString`, return the string) and `importSchema(text)` (wipe canvas, `DOMParser` → fragment, re-bind listeners, run `recomputeJunctions()`).
* **`js/main.js`** runs on `DOMContentLoaded`: instantiates `appState`, performs any initial DOM setup, and kicks off event binding.

### 5.3 Constraints (Preserved)

* **No Build Step:** The app requires no compiler, bundler (Webpack/Vite), node modules, or third-party framework runtime libraries (React/Vue). There is no transpilation or minification step. The plain files are deployed as-is.
* **No Server Required:** Because all assets are loaded via relative paths and the application performs no `fetch`/`XHR` calls at runtime, the project runs flawlessly by being opened locally in any modern web browser (e.g., double-clicking `index.html` or serving the root with any static file server).
* **DOM as State:** The interactive SVG canvas element remains the primary source of truth for the schematic's current state. Each `.js` file queries and mutates native DOM attributes (`transform`, `x`, `y`, data-attributes) directly. No JSON backing store, no virtual DOM, no reactive framework layer is introduced.
* **Plain ES6+ JavaScript:** All modules use native ES6+ syntax (modules may be plain scripts attached to a shared global `window` namespace, or native ES modules with `type="module"` — either is acceptable as long as no build tooling is required).

## 6. Serialization & Data Persistence (Save/Load)

Data persistence is handled entirely client-side via text data streaming inside the main UI layout.

### 6.1 The Data Portal UI

The sidebar or layout footer will feature a persistent **"Data Portal"** layout module containing:

* A large, scrollable `<textarea>` element block labeled "Raw SVG Data".
* An **"Export Schema"** button.
* An **"Import Schema"** button.

### 6.2 Saving / Exporting Data

When the user clicks **"Export Schema"**:

1. The JavaScript state engine clones the root interactive `<svg>` DOM element.
2. It strips out temporary interactive UI layers (such as active drag handles or cursor selection rings).
3. It converts the remaining visual DOM tree into a formatted string block using `XMLSerializer`.
4. This raw SVG text block is automatically injected into the `<textarea>`, allowing the user to copy it to their system clipboard or save it into a local `.svg` text document.

### 6.3 Loading / Importing Data

When a user pastes external SVG string content into the box and clicks **"Import Schema"**:

1. The application wipes the active drawing canvas clean.
2. A safe `DOMParser` instantiates to turn the raw string back into a structural SVG document fragment.
3. The application scans the imported elements, validates their data layout, and maps event listeners back onto the newly created nodes (`.generic-component` groups, network `<line>` tags).
4. The dynamic junction heuristic engine instantly parses the entire node topology to re-verify and render all appropriate T-junction points on the 25-unit grid.
