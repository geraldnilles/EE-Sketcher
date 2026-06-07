# PLAN: Refactoring EE-Sketcher to ES6 Modules

This document outlines a detailed, step-by-step architectural plan to refactor the **EE-Sketcher** codebase. The objective is to replace the current global window-polluting IIFE (Immediately Invoked Function Expression) pattern with native **ES6 Modules (`import`/`export`)**, improve readability, enforce a clean separation of concerns, and verify everything automatically using the running Playwright debug session.

---

## 1. Core Architectural Goals

1. **Eradicate Window Pollution**: Completely remove `(function (global) { ... })(window)` wrappers. Each module will explicitly export its functions and constants and import its dependencies.
2. **Clear Separation of Concerns**:
   - **State**: Centralized reactive state that coordinates changes across modules (using a pub-sub or event bus approach).
   - **SVG Components**: Stateless SVG element constructors, readers, and writers.
   - **Net / Wire Routing Logic**: Pure math/coordinate routines, geometric intersection checks, and topological splits/merges.
   - **Canvas Interactions**: State-driven pointer gesture decoders (select, drag, connect).
   - **Sidebar UI Panel & Serializer**: Standard DOM elements rendering and importing/exporting logic.
3. **Martin Fowler Clean Code Principles**:
   - Split oversized functions into smaller, descriptive single-responsibility helpers.
   - Standardize on readable variables and explicit control structures (`for` loops over cryptic high-order chains where readability is enhanced).
   - Strict validation parameters and defensively programming against null values.

---

## 2. Dependency Graph Mapping

In the current setup, files are loaded linearly in `index.html`. Under ES6 modules, the dependencies will be resolved statically:

```
                  [main.js] (Entrypoint)
                 /    |    \
                /     v     \
       [interactions.js] [sidebar.js] [serialization.js]
               \      |       |      /
                \     v       v     /
                 \ [components.js] /
                  \   |     /     /
                   v  v    v     v
                     [nets.js]
                        |
                        v
                   [viewport.js]
                        |
                        v
                    [state.js]
```

---

## 3. Step-by-Step Refactoring Strategy

### Phase 3.1: Preparation & Scratchpad Safeguarding
- Ensure the current state of files is saved in git.
- Write down a minimal baseline integration test script using Playwright to run and assert page health before we touch any code.

### Phase 3.2: Code Refactoring & Transition to ES6 Modules
We will perform surgical, file-by-file rewrites to standard `import`/`export` syntax:

1. **`js/state.js`**:
   - Export constants (`GRID`) and helper methods (`snap`, `toGrid`, `fromGrid`, `clamp`, `uid`).
   - Keep `appState` as a single, exported live object.
   - Refactor `setMode` to cleanly dispatch events on `window` (or a dedicated event target).

2. **`js/viewport.js`**:
   - Import `GRID`, `snap`, `clamp` from `state.js`.
   - Export `initViewport`, `getViewBox`, `setViewBox`, `zoom`, `panByPixels`, `resetView`, `onViewChange`.

3. **`js/components.js`**:
   - Import snap, clamp, utilities, and viewport scale methods.
   - Isolate block-building helpers (e.g., `makePin`, `setRectSize`).
   - Clean up the huge conditional blocks in `updateComponent` to make it modular (separate sub-routines for passive blocks, power blocks, and generic blocks).
   - Export `createComponent`, `createGndComponent`, `createVddComponent`, `createPassiveComponent`, `updateComponent`, `deleteComponent`, `readLabels`, `readOrigin`, `setOrigin`, `getRows`, `getWidth`.

4. **`js/nets.js`**:
   - Import coordinates, constants, and component specs.
   - Refactor `refreshNetTopology()` and its passes (`splitAllLines()`, `mergeLines()`, `recomputeJunctions()`) for ultimate readability and robust null-safety.
   - Export pure and impure methods separately.

5. **`js/interactions.js`**:
   - Import appState, modes, state setters, component builders, routing mechanics.
   - Refactor the pointer listener handlers so they cleanly dispatch states and avoid nested closures where possible.

6. **`js/sidebar.js`**:
   - Import states, component readers, writers, and net coordinators.
   - Refactor the functional DOM element creator `el(...)` to be highly readable.

7. **`js/serialization.js`**:
   - Import validators, net helpers, and components loaders.
   - Ensure importing triggers standard ES6 exports of other modules.

8. **`js/main.js`**:
   - Serve as the module bootstrapper.
   - Import all subsystems and initialize them when DOM is ready.

### Phase 3.3: index.html Modifications
- Replace all 8 sequential script tags with a single script tag:
  `<script type="module" src="js/main.js"></script>`

### Phase 3.4: Automated Playwright Testing & Verification
We will run custom Playwright test scripts against your Chrome session to make sure:
1. No console errors on load.
2. Modes toggle cleanly.
3. Adding a component places a `<g class="generic-component">` on the SVG canvas.
4. Exporting and importing schema does not distort coordinates.

---

## 4. Playwright Verification Script Design

The automated verification script will run in python and connect via CDP to port `9876`. It will run the following checks:
1. **Console Verification**: Hook console output to catch any script errors.
2. **Bootstrap Check**: Ensure the application title is correct and elements are rendered.
3. **Mode Verification**: Simulate pressing 'D', 'C', 'S' and verify the active CSS classes on the toolbar.
4. **Action Verification**: Simulate clicking "+ Component", and assert the count of `.generic-component` rises from 0 to 1.
5. **Round-Trip Serialization Check**: Run Export -> Wipe Canvas -> Paste in Portal -> Import -> Assert state restored.

---

Let's begin executing! I'm ready to write and run verification scripts as we proceed.
