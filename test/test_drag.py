#!/usr/bin/env python3
"""
Test: Drag mode — moving components and line endpoints.

Features tested:
  - Drag mode is active after clicking the Drag button.
  - Component can be dragged to a new position.
  - Line endpoint can be dragged to reshape a line.
  - Canvas gets .is-dragging class during drag operations.
"""

from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:8080"
CDP_URL = "http://localhost:9876"
GRID = 25  # matches the app's GRID constant


def snap(v):
    """Snap to grid, matching the app's snap() logic."""
    return round(v / GRID) * GRID


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(CDP_URL)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(APP_URL)
        page.wait_for_load_state("networkidle")

        # ------------------------------------------------------------------
        # 1. Create a component and drag it to a new position
        # ------------------------------------------------------------------
        page.click("#add-component-btn")
        page.wait_for_timeout(100)

        # Read initial position (transform attribute)
        def get_transform(el):
            return el.evaluate("e => e.getAttribute('transform') || ''")

        def parse_translate(transform_str):
            """Extract (x, y) from 'translate(x y)' or 'translate(x, y)'."""
            import re
            m = re.search(r"translate\(\s*(-?\d+)\s*,?\s*(-?\d+)\s*\)", transform_str)
            if m:
                return int(m.group(1)), int(m.group(2))
            return None, None

        comp = page.locator(".generic-component.is-selected").first
        orig_transform = get_transform(comp)
        orig_x, orig_y = parse_translate(orig_transform)
        assert orig_x is not None, "Could not read initial component position"

        # Switch to drag mode
        page.locator(".mode-btn[data-mode='drag']").click()
        page.wait_for_timeout(100)

        # Drag the component by a known delta
        bbox = comp.bounding_box()
        assert bbox is not None, "Component has no bounding box"
        start_x = bbox["x"] + bbox["width"] / 2
        start_y = bbox["y"] + bbox["height"] / 2

        # Drag it by 100 screen pixels right and 50 down
        page.mouse.move(start_x, start_y)
        page.mouse.down()
        # Verify is-dragging class appeared
        page.wait_for_timeout(50)
        svg_class = page.locator("#canvas").evaluate("el => el.getAttribute('class') || ''")
        assert "is-dragging" in svg_class, (
            f"Canvas should have 'is-dragging' class, got: {svg_class}"
        )
        page.mouse.move(start_x + 100, start_y + 50, steps=5)
        page.mouse.up()
        page.wait_for_timeout(100)

        # Verify position changed
        new_transform = get_transform(comp)
        new_x, new_y = parse_translate(new_transform)
        assert new_x is not None, "Could not read new component position"
        assert (new_x != orig_x) or (new_y != orig_y), (
            f"Component did not move: ({orig_x},{orig_y}) -> ({new_x},{new_y})"
        )
        # New position should be snapped to grid
        assert new_x % GRID == 0, f"New X {new_x} is not on grid"
        assert new_y % GRID == 0, f"New Y {new_y} is not on grid"

        # is-dragging should be cleared
        svg_class = page.locator("#canvas").evaluate("el => el.getAttribute('class') || ''")
        assert "is-dragging" not in svg_class, "is-dragging class should be removed after drag"

        # ------------------------------------------------------------------
        # 2. Create a line via evaluate and reshape one endpoint
        # ------------------------------------------------------------------

        # Create a line at known SVG coords using the app's createLine
        result = page.evaluate("""
            async () => {
                const m = await import('/js/nets/net-crud.js');
                const s = await import('/js/state.js');
                s.setMode('drag');
                const line = m.createLine(100, 200, 175, 200);
                if (!line) return null;
                return {
                    id: line.getAttribute('data-id'),
                    x1: +line.getAttribute('x1'),
                    y1: +line.getAttribute('y1'),
                    x2: +line.getAttribute('x2'),
                    y2: +line.getAttribute('y2'),
                };
            }
        """)
        assert result is not None, "Failed to create line programmatically"

        # Call shiftLineForEndpointDrag to reshape the line
        result2 = page.evaluate("""
            async (info) => {
                const ni = await import('/js/nets/net-interaction.js');
                const nt = await import('/js/nets/net-topology.js');
                const line = document.querySelector('line.net-line[data-id="' + info.id + '"]');
                if (!line) return null;
                ni.shiftLineForEndpointDrag(line, 'end', 50, 350);
                nt.refreshNetTopology();
                return {
                    x1: +line.getAttribute('x1'),
                    y1: +line.getAttribute('y1'),
                    x2: +line.getAttribute('x2'),
                    y2: +line.getAttribute('y2'),
                };
            }
        """, result)
        assert result2 is not None, "Line vanished after programmatic drag"

        assert (
            result["x1"] != result2["x1"] or
            result["y1"] != result2["y1"] or
            result["x2"] != result2["x2"] or
            result["y2"] != result2["y2"]
        ), f"Line coords did not change: before={result}, after={result2}"

        print("  ✓ All drag mode assertions passed")


if __name__ == "__main__":
    run()
