# Task: Refactor SPEC.md Section 5 from single-file to multi-file architecture

## Current State
- Section 5 specifies a SINGLE index.html with embedded CSS+JS
- Bullet: "Single-File Delivery" - need to replace

## Proposed File Structure
- index.html      -> HTML5 structure (loads CSS via <link>, JS via <script>)
- styles.css      -> All CSS3 styling (layouts, grid overlays, UI formatting)
- js/main.js      -> Entry point, init, event wiring bootstrap
- js/state.js     -> Application state, mode switching (Select/Drag/Connection)
- js/components.js-> Generic Block component create/update/delete logic
- js/nets.js      -> Line net CRUD, T-junction detection/splitting, junction circles
- js/interactions.js -> Pointer/click handlers: select, drag-translate, drag-endpoint, connection-drawing
- js/sidebar.js   -> Sidebar rendering, pin label inputs, +/- row, width buttons, delete buttons
- js/serialization.js -> Export Schema / Import Schema (XMLSerializer, DOMParser)

## Constraints to Preserve
- No build step
- No third-party frameworks
- DOM as state (still true)
- "Run by opening in browser" still true (no server needed beyond file://)

## Edit Strategy
Use sed to replace the entire "## 5. Implementation Architecture" section up to (but not including) "## 6." with the new content.
