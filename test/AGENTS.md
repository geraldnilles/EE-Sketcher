# Agent Context: Test Suite

This directory contains the automated regression test suite for EE-Sketcher, built on Playwright (Python).

## 1. Technology Stack

* **Test Framework:** [Playwright for Python](https://playwright.dev/python/) (`playwright.sync_api`, synchronous API).
* **Browser Target:** Chrome, connected via Chrome DevTools Protocol (CDP).
* **App Serving:** The EE-Sketcher static front-end is served by a lightweight HTTP server (`./server.sh` at the project root, which runs `python3 -m http.server 8080`).
* **Language:** All test files are Python 3 scripts.

## 2. Prerequisites & Running Tests

### Required Before Running

1. Start the dev server from the project root:
   ```
   ./server.sh
   ```
   This serves the app at `http://localhost:8080`.

2. Start Chrome with remote debugging enabled:
   ```
   google-chrome --remote-debugging-port=9876
   ```
   (Or equivalent for your platform/Chromium-based browser.)

3. Install Playwright and its Chromium browser:
   ```
   pip install playwright
   playwright install chromium
   ```

### Execution

```
python3 test/browser.py           # run all test suites
python3 test/browser.py --modes   # run only the modes suite
python3 test/browser.py --components --connect  # run specific suites
python3 test/browser.py --help    # list all options
```

Each test module can also be run standalone (it exposes a `run()` function):
```
python3 -c "import test_components; test_components.run()"
```

### Exit Codes
* `0` — all selected suites passed.
* `1` — one or more suites failed (failures are printed to stdout).

## 3. Directory & File Map

| File | Responsibility |
| :--- | :--- |
| `browser.py` | **Master test runner.** Discovers and dispatches to each suite module. Parses CLI flags, runs suites sequentially, aggregates pass/fail counts. |
| `test_modes.py` | Toolbar mode toggling (Select/Drag/Connect) via button clicks and keyboard shortcuts (S, D, C). Verifies `.mode-{mode}` class on SVG canvas and `.active` class on buttons. |
| `test_components.py` | Component creation via toolbar buttons and keyboard shortcuts (A for generic). Covers: generic blocks, GND, VDD, resistor, capacitor, inductor. Verifies the component lands in `#components-layer`, gets `.is-selected`, has a `data-id`, and (for generics) has `.pin-left` / `.pin-right` text labels. |
| `test_selection.py` | Click-to-select and deselection behavior in select mode. Verifies `.is-selected` toggle, Esc key clears selection, inspector panel updates between "Nothing selected" and component detail views. |
| `test_drag.py` | Drag mode: moving components and line endpoints. Verifies position changes via `transform` attribute, `.is-dragging` class on `#canvas`, and grid-snapped final positions (grid = 25 units). |
| `test_connect.py` | Connect mode: drawing orthogonal net lines. Verifies preview appearance after first click, `.net-line` creation after second click, orthogonality (horizontal or vertical), overlap rejection, component-body collision rejection, and Escape-cancel behavior. |
| `test_inspector.py` | Inspector sidebar panel rendering. Verifies per-type panels (generic shows pin labels/width/rows/labels; passive shows label/rotation; VDD shows label; GND shows read-only info; line shows coords). Tests that editing fields (fill + Enter) updates the live component. |
| `test_deletion.py` | Element deletion. Covers: sidebar "Delete Component" button, X key, Backspace key, Delete key. Verifies element removal from DOM, cleared selection, and inspector reset to "Nothing selected". Also tests deletion of net lines. |
| `test_viewport.py` | Viewport zoom (Ctrl+wheel) and pan (Shift+wheel, regular scroll). Verifies `viewBox` attribute changes, world-bound clamping (0–1500 × 0–1000), and scale limits (0.1x–8.0x). |
| `test_portal.py` | Data Portal export/import. Verifies that "Export Schema" populates the textarea with SVG, that exported text contains expected elements, and that "Import Schema" restores components. Also tests import of empty/malformed text produces an error status. |
| `test_integration.py` | Full end-to-end workflow. Adds multiple components, labels them, draws nets between them, drags a component, exports, resets, imports, and verifies round-trip fidelity. |

## 4. Conventions for Adding New Tests

### File Structure
Every test file must follow this pattern:

```python
#!/usr/bin/env python3
"""
Test: <Brief description of what's tested>.

Features tested:
  - <Feature 1>
  - <Feature 2>
"""

from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:8080"
CDP_URL = "http://localhost:9876"


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(CDP_URL)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(APP_URL)
        page.wait_for_load_state("networkidle")

        # Test logic here...
```

### Registration
After creating a new test file, register it in `browser.py`:
1. Import the `run` function at the top of the file.
2. Add an entry to the `ALL_SUITES` dictionary with a `(name, fn)` tuple.

### Accessing the App State
* The `<svg id="canvas">` element and its children are the source of truth.
* Common selectors:
  * `#canvas` — the main SVG workspace.
  * `#components-layer` — container for all placed components.
  * `#nets-layer` — container for all net lines.
  * `#overlay-layer` — container for preview lines (`line.net-preview`).
  * `#inspector-body` — sidebar content panel.
  * `.is-selected` — CSS class on the currently selected element.
  * `.is-dragging` — CSS class on `#canvas` during drag operations.
  * `.generic-component`, `.gnd-component`, `.vdd-component`, `.resistor-component`, `.capacitor-component`, `.inductor-component` — component CSS classes.
  * `line.net-line` — drawn net line elements.
  * `.mode-btn[data-mode='select']`, `.mode-btn[data-mode='drag']`, `.mode-btn[data-mode='connect']` — toolbar mode buttons.

### Wait Strategy
* The test suite uses explicit `page.wait_for_timeout(ms)` calls (not Playwright's built-in auto-waits). Typical waits are 100ms after DOM mutations.
* This is intentional — the app uses custom events and synchronous DOM updates, so Playwright's `waitForSelector` can't always detect state transitions reliably.
* Keep wait times as low as possible while maintaining reliability. If a test is flaky, increase the wait slightly before asserting.

### Assertions
* Use standard Python `assert` statements with descriptive error messages.
* Helper functions for repeated logic (e.g., `assert_one_selected_component`, `get_viewbox`, `parse_viewbox`) are acceptable and encouraged.
* Do NOT use `pytest` or `unittest` — the suite is designed to run as plain Python scripts.

### Grid Awareness
* The app's grid constant is `GRID = 25`. Coordinate assertions should account for grid snapping.
* To snap a value: `round(v / 25) * 25`.

## 5. Debugging Notes

* Tests connect to an already-open Chrome instance. You can interact with the browser manually to reproduce failures.
* Test output is printed to stdout. Failures include the exception message string.
* The `__pycache__/` directory is auto-generated by Python and is gitignored.
* If tests fail with a CDP connection error, ensure Chrome is running with the correct remote debugging port and that no other process is occupying port 9876.
