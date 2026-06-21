# Agent Context: Core Application Modules

This directory coordinates runtime state, layout mutations, workspace viewing, and sidebar inspectors.

## 1. Architecture File Breakdown

### `main.js` (System Bootstrap)
Wires up UI button click behaviors, manages initialization ordering, and binds context menu functions to physical actions.

### `state.js` (Global Constants & Application Context)
* **State Store:** Contains `appState` (`mode`, `selected`, `drawStart`, `dragging`).
* **Mode Switch Constraints:** Changing views via `setMode(mode)` automatically flushes transient draw tracking pointers and fires a global window `modechange` event.
* **Coordinate Tools:** Features snapping and mathematical scale primitives: `snap(v)`, `toGrid(px)`, `fromGrid(g)`, and `uid(prefix)`.

### `viewport.js` (Pan, Zoom, & Bounds Tracking)
* **World Resolution Constraints:** Hard-coded coordinate system spanning `(0,0)` to `(1500, 1000)`. Elements must be bounded within these coordinates.
* **Matrix Space Translation:** Maps window coordinate screens cleanly down to logical coordinates using target matrix functions.
* **Scale Limits:** Bound between `0.1x` and `8.0x`.

### `components.js` (Component Lifecycle Manager)
* Handles instantiation structures for Generic Blocks, `GND`, `VDD`, and Passive references (`resistor`, `capacitor`, `inductor`, `diode`).
* **Generic Block Dimensional Calculations:**
    $$\text{Height} = (N_{\text{rows}} + 1) \times 25$$
    Internal tracking rectangle uses a fixed offset of `y="-25"`. Width values must step by clean multiples of `50`.

### `interactions.js` (Pointer Orchestration & Shortcuts)
* Captures and decodes low-level user inputs. Employs a forgiveness radius (`LINE_PICK_TOLERANCE = 10`) to aid fine cursor interactions.
* **Keyboard Suppressor:** Key tracking must look for focus states on input containers (`/INPUT|TEXTAREA|SELECT/`) to avoid layout action triggers while editing labels.

### `sidebar.js` (Dynamic Inspector Panel)
* Generates runtime interface input layout panels using programmatic tree generation (`el(tag, attrs, children)`).
* **Focus Prevention Invariant:** Label configuration input forms read directly from text layouts and must avoid executing raw parent tree redraw blocks during execution to maintain active cursor tracking focus.

### `serialization.js` (Data Portal Core)
* Converts elements to markup schemas via `XMLSerializer` and cleans workspace layout markers (`is-selected`, `is-dragging`, `endpoint-hit`) prior to export. Handles incoming parsing jobs via `DOMParser`.

### `geometry.js` (Spatial Mathematics)
* Implements coordinate calculations, boundary definitions, and segment proximity validations.

## 2. Invariant Data Architecture
Each component configuration relies on clear data elements for file persistence and interface mapping:
* `data-id`: Unique workspace instance identifier.
* `data-width`: Total design pixel layout width.
* `data-rows`: Total vertical port layout lines.
* `data-label-top` / `data-label-bottom`: Metadata tagging blocks.
* Pins require explicit placement variables tracking context layout points (`data-side`, `data-row`).
