# Agent Context: Project Root

Welcome to the **EE-Sketcher** core codebase. This document outlines the high-level system properties, initialization sequences, and design patterns governing this vanilla front-end engine.

## 1. Core System Ground Rules
* **No Build Step, Frameworks, or External Libraries:** The application relies entirely on modern browser capabilities (ES6 modules, vanilla DOM APIs, native SVG). Never install npm packages, bundlers, or transpillers.
* **DOM-as-State Pattern:** The interactive SVG canvas is the primary and final source of truth. There is **no virtual DOM or JSON backing model**. To inspect or alter component settings, you must read/write data attributes and element contents directly from/to the SVG DOM nodes.
* **The Grid Architecture:** Every coordinate, dimension, and transform vector must snap to a grid spacing of **25 units** (`GRID = 25`). Helpers are exported from `js/state.js`.

## 2. Directory & Component Mapping

| Path | Responsibility |
| :--- | :--- |
| `index.html` | Application layout, sidebar structure, global static SVG defs/symbols. |
| `styles.css` | Color tokens, layout rules, layout themes, interaction state hooks. |
| `js/` | State management, viewport handling, core interactions, UI rendering. |
| `js/nets/` | Isolated sub-engine managing graph compilation and wire validations. |

## 3. High-Level Initialization Flow
1. Browser loads `index.html`.
2. `<script type="module" src="js/main.js"></script>` invokes the entry script.
3. `main.js` registers toolbar event handlers and coordinates initialization across sub-modules:
   * `initViewport()`: Manages aspect ratios, pan, zoom parameters.
   * `initInteractions()`: Configures global pointer tracking and event listeners.
   * `initSidebar()`: Subscribes to cross-module custom events to drive layout refreshes.

## 4. Interaction States & CSS Hook Classes
Be careful when adding elements or applying modifiers. State-tracking components rely on strict class declarations to maintain user context:

* `.is-selected`: Active item outline highlighting (applied to generic components or net lines).
* `.is-dragging`: Applied to the `#canvas` element when actively translating elements or scaling points.
* `.net-preview`: Temporary indicator used during path generation.
* `.net-preview.invalid`: Validation failure indicator (triggers red accenting).

## 5. Critical Engineering Invariants
> [!IMPORTANT]
> Whenever any structural asset is altered (component moved, net added, element removed, schema imported), you **must** call `refreshNetTopology()` from `js/nets.js`. This guarantees collinear merges, T-junction re-evaluations, and line segmentation logic run smoothly without desynced UI artifacts.


---

