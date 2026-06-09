#!/usr/bin/env python3
"""
Test: Element deletion via sidebar button and keyboard shortcuts.

Features tested:
  - Generic component deleted via sidebar "Delete Component" button.
  - Component deleted via X key.
  - Component deleted via Backspace / Delete key.
  - Line deleted via X key.
  - Selection is cleared after deletion.
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

        components_layer = page.locator("#components-layer")

        # ------------------------------------------------------------------
        # 1. Delete via sidebar button
        # ------------------------------------------------------------------
        page.click("#add-component-btn")
        page.wait_for_timeout(100)
        comp_count_before = components_layer.locator(".generic-component").count()
        comp_id = page.locator(".is-selected").first.get_attribute("data-id")

        # Click the "Delete Component" button in the sidebar
        delete_btn = page.locator("#inspector-body button.danger")
        assert delete_btn.count() >= 1, (
            "Delete button not found in inspector"
        )
        delete_btn.first.click()
        page.wait_for_timeout(100)

        # Verify the component is gone
        comp_count_after = components_layer.locator(".generic-component").count()
        assert comp_count_after == comp_count_before - 1, (
            f"Component should be removed. Before: {comp_count_before}, After: {comp_count_after}"
        )
        # Verify selection is cleared
        assert page.locator(".is-selected").count() == 0, (
            "Selection should be cleared after deletion"
        )
        # Inspector should show empty message
        inspector_text = page.locator("#inspector-body").inner_text()
        assert "Nothing selected" in inspector_text, (
            "Inspector should show 'Nothing selected' after deletion"
        )

        # ------------------------------------------------------------------
        # 2. Delete via X key
        # ------------------------------------------------------------------
        page.click("#add-component-btn")
        page.wait_for_timeout(100)
        comp_count_before = components_layer.locator(".generic-component").count()

        page.keyboard.press("x")
        page.wait_for_timeout(100)

        comp_count_after = components_layer.locator(".generic-component").count()
        assert comp_count_after == comp_count_before - 1, (
            f"Component should be removed via X key. Before: {comp_count_before}, After: {comp_count_after}"
        )

        # ------------------------------------------------------------------
        # 3. Delete via Delete key
        # ------------------------------------------------------------------
        page.click("#add-component-btn")
        page.wait_for_timeout(100)
        comp_count_before = components_layer.locator(".generic-component").count()

        page.keyboard.press("Delete")
        page.wait_for_timeout(100)

        comp_count_after = components_layer.locator(".generic-component").count()
        assert comp_count_after == comp_count_before - 1, (
            f"Component should be removed via Delete key. Before: {comp_count_before}, After: {comp_count_after}"
        )

        # ------------------------------------------------------------------
        # 4. Delete via Backspace key
        # ------------------------------------------------------------------
        page.click("#add-component-btn")
        page.wait_for_timeout(100)
        comp_count_before = components_layer.locator(".generic-component").count()

        page.keyboard.press("Backspace")
        page.wait_for_timeout(100)

        comp_count_after = components_layer.locator(".generic-component").count()
        assert comp_count_after == comp_count_before - 1, (
            f"Component should be removed via Backspace. Before: {comp_count_before}, After: {comp_count_after}"
        )

        # ------------------------------------------------------------------
        # 5. Delete a line via X key
        # ------------------------------------------------------------------
        # Draw a line
        page.locator(".mode-btn[data-mode='connect']").click()
        page.wait_for_timeout(50)
        svg = page.locator("#canvas")
        svg.click(position={"x": 600, "y": 600})
        svg.click(position={"x": 800, "y": 600})
        page.wait_for_timeout(100)

        # Select the line
        page.locator(".mode-btn[data-mode='select']").click()
        page.wait_for_timeout(50)

        # Click on the line to select it — use the line's midpoint SVG coords
        line = page.locator("#nets-layer line.net-line").last
        x1 = int(line.get_attribute("x1"))
        y1 = int(line.get_attribute("y1"))
        x2 = int(line.get_attribute("x2"))
        y2 = int(line.get_attribute("y2"))
        mx = (x1 + x2) / 2
        my = (y1 + y2) / 2
        screen_pos = line.evaluate("""(el, coords) => {
                const [x, y] = coords;
                const svg = el.closest('svg');
                const pt = svg.createSVGPoint();
                pt.x = x; pt.y = y;
                const ctm = svg.getScreenCTM();
                const sp = pt.matrixTransform(ctm);
                return { x: sp.x, y: sp.y };
            }""", [mx, my])
        page.mouse.click(screen_pos["x"], screen_pos["y"])
        page.wait_for_timeout(100)

        nets_layer = page.locator("#nets-layer")
        line_count_before = nets_layer.locator("line.net-line").count()

        page.keyboard.press("x")
        page.wait_for_timeout(100)

        line_count_after = nets_layer.locator("line.net-line").count()
        assert line_count_after == line_count_before - 1, (
            f"Line should be removed. Before: {line_count_before}, After: {line_count_after}"
        )

        print("  ✓ All deletion assertions passed")


if __name__ == "__main__":
    run()
