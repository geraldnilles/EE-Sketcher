#!/usr/bin/env python3
"""
Test: Pointer / cursor behavior across all modes and hover states.

Features tested:
  - Canvas cursor in Select, Drag, and Connect modes.
  - Cursor over endpoint-hit rects in each mode (notably: crosshair in Connect).
  - Cursor over components and net lines in each mode.
  - is-dragging class changes cursor during a drag operation.
  - Blue-square hover highlight on endpoint-hit rects remains in all modes.
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

        svg = page.locator("#canvas")
        nets_layer = page.locator("#nets-layer")
        mode_buttons = page.locator(".mode-btn")

        # ------------------------------------------------------------------
        # Helper: get computed cursor style for an element via its selector
        # ------------------------------------------------------------------
        def get_cursor(selector):
            return page.evaluate(
                """(sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    return window.getComputedStyle(el).cursor;
                }""",
                selector,
            )

        # Helper: switch to a mode by clicking its toolbar button
        def switch_mode(mode_name):
            mode_buttons.filter(has_text=mode_name).click()
            page.wait_for_timeout(100)

        # Helper: check whether endpoint-hit rect has blue highlight on hover
        def endpoint_hit_has_hover_style(net_selector, endpoint):
            """Check the computed fill/stroke of an endpoint-hit rect in hover state."""
            return page.evaluate(
                """({ sel, which }) => {
                    const line = document.querySelector(sel);
                    if (!line) return null;
                    const netId = line.getAttribute('data-id');
                    const rect = document.querySelector(
                        `rect.endpoint-hit[data-net-id="${netId}"][data-endpoint="${which}"]`
                    );
                    if (!rect) return null;
                    const style = window.getComputedStyle(rect);
                    return {
                        fill: style.fill,
                        stroke: style.stroke,
                        cursor: style.cursor,
                    };
                }""",
                {"sel": net_selector, "which": endpoint},
            )

        # ------------------------------------------------------------------
        # Setup: add a component and a net line (so we have endpoint-hit rects)
        # ------------------------------------------------------------------
        switch_mode("Select")
        page.click("#add-component-btn")
        page.wait_for_timeout(100)

        # Add a resistor for variety (has passive-component class)
        page.click("#add-resistor-btn")
        page.wait_for_timeout(100)

        # Switch to Connect and draw a line to create endpoint-hit rects
        switch_mode("Connect")
        # Click at (300, 300) then (500, 300) to create a horizontal line
        svg.click(position={"x": 300, "y": 300})
        page.wait_for_timeout(50)
        svg.click(position={"x": 500, "y": 300})
        page.wait_for_timeout(100)

        # Verify a line was created and has endpoint-hit rects
        line_count = nets_layer.locator("line.net-line").count()
        assert line_count >= 1, f"Expected at least 1 net line, got {line_count}"

        endpoint_count = nets_layer.locator("rect.endpoint-hit").count()
        assert endpoint_count >= 2, (
            f"Expected at least 2 endpoint-hit rects, got {endpoint_count}"
        )

        # Get the selector for the first line
        line_selector = "line.net-line"
        # Verify endpoint-hit rects exist for this line
        eps = nets_layer.locator("rect.endpoint-hit").all()
        assert len(eps) >= 2, "Should have at least 2 endpoint-hit rects"

        # ------------------------------------------------------------------
        # 1. Select Mode — Canvas cursor
        # ------------------------------------------------------------------
        switch_mode("Select")
        assert get_cursor("#canvas") == "default", (
            f"Select mode canvas cursor should be 'default', got '{get_cursor('#canvas')}'"
        )

        # ------------------------------------------------------------------
        # 2. Select Mode — Cursor over endpoint-hit rects
        # ------------------------------------------------------------------
        # In select mode, endpoint-hit has cursor: grab (its own rule)
        ep_cursor_sel = page.evaluate(
            """() => {
                const rect = document.querySelector('rect.endpoint-hit');
                if (!rect) return null;
                return window.getComputedStyle(rect).cursor;
            }"""
        )
        # The endpoint-hit rule says cursor: grab; that's the intended
        # behavior in select mode (user can grab endpoints to drag them
        # even from select mode via pointerdown handling).
        assert ep_cursor_sel == "grab", (
            f"Select mode endpoint-hit cursor should be 'grab', got '{ep_cursor_sel}'"
        )

        # ------------------------------------------------------------------
        # 3. Select Mode — Cursor over a component
        # ------------------------------------------------------------------
        comp_cursor = page.evaluate(
            """() => {
                const comp = document.querySelector('.generic-component');
                if (!comp) return null;
                return window.getComputedStyle(comp).cursor;
            }"""
        )
        # Components don't set cursor explicitly, inherit from canvas = default
        assert comp_cursor == "default", (
            f"Select mode component cursor should be 'default', got '{comp_cursor}'"
        )

        # ------------------------------------------------------------------
        # 4. Select Mode — Cursor over a net line
        # ------------------------------------------------------------------
        line_cursor_sel = get_cursor(line_selector)
        assert line_cursor_sel == "default", (
            f"Select mode line cursor should be 'default', got '{line_cursor_sel}'"
        )

        # ------------------------------------------------------------------
        # 5. Drag Mode — Canvas cursor
        # ------------------------------------------------------------------
        switch_mode("Drag")
        assert get_cursor("#canvas") == "grab", (
            f"Drag mode canvas cursor should be 'grab', got '{get_cursor('#canvas')}'"
        )

        # ------------------------------------------------------------------
        # 6. Drag Mode — Cursor over endpoint-hit rects
        # ------------------------------------------------------------------
        ep_cursor_drag = page.evaluate(
            """() => {
                const rect = document.querySelector('rect.endpoint-hit');
                if (!rect) return null;
                return window.getComputedStyle(rect).cursor;
            }"""
        )
        assert ep_cursor_drag == "grab", (
            f"Drag mode endpoint-hit cursor should be 'grab', got '{ep_cursor_drag}'"
        )

        # ------------------------------------------------------------------
        # 7. Drag Mode — During active drag, cursor becomes grabbing
        # ------------------------------------------------------------------
        # Start a drag on a component
        comp_box = page.locator(".generic-component").first.bounding_box()
        assert comp_box is not None, "Component should have a bounding box"
        cx = comp_box["x"] + comp_box["width"] / 2
        cy = comp_box["y"] + comp_box["height"] / 2

        page.mouse.move(cx, cy)
        page.mouse.down()
        page.wait_for_timeout(50)

        # Verify is-dragging class on canvas
        has_dragging = page.evaluate(
            """() => document.getElementById('canvas').classList.contains('is-dragging')"""
        )
        assert has_dragging, "Canvas should have 'is-dragging' class during drag"

        # During drag, canvas cursor should be 'grabbing'
        drag_cursor = get_cursor("#canvas")
        assert drag_cursor == "grabbing", (
            f"During drag, canvas cursor should be 'grabbing', got '{drag_cursor}'"
        )

        page.mouse.up()
        page.wait_for_timeout(50)

        # After drag, cursor returns to grab
        assert get_cursor("#canvas") == "grab", (
            "After drag ends, canvas cursor should return to 'grab'"
        )

        # ------------------------------------------------------------------
        # 8. Connect Mode — Canvas cursor (THE MAIN FIX)
        # ------------------------------------------------------------------
        switch_mode("Connect")
        assert get_cursor("#canvas") == "crosshair", (
            f"Connect mode canvas cursor should be 'crosshair', got '{get_cursor('#canvas')}'"
        )

        # ------------------------------------------------------------------
        # 9. Connect Mode — Cursor over endpoint-hit rects (THE MAIN FIX)
        # ------------------------------------------------------------------
        ep_cursor_connect = page.evaluate(
            """() => {
                const rect = document.querySelector('rect.endpoint-hit');
                if (!rect) return null;
                return window.getComputedStyle(rect).cursor;
            }"""
        )
        assert ep_cursor_connect == "crosshair", (
            f"Connect mode endpoint-hit cursor MUST be 'crosshair' (not 'grab'), got '{ep_cursor_connect}'"
        )

        # ------------------------------------------------------------------
        # 10. Connect Mode — Cursor over a net line
        # ------------------------------------------------------------------
        line_cursor_connect = get_cursor(line_selector)
        # Net lines don't set cursor explicitly, inherit from canvas = crosshair
        assert line_cursor_connect == "crosshair", (
            f"Connect mode line cursor should be 'crosshair', got '{line_cursor_connect}'"
        )

        # ------------------------------------------------------------------
        # 11. Connect Mode — Cursor over a component
        # ------------------------------------------------------------------
        comp_cursor_connect = page.evaluate(
            """() => {
                const comp = document.querySelector('.generic-component');
                if (!comp) return null;
                return window.getComputedStyle(comp).cursor;
            }"""
        )
        assert comp_cursor_connect == "crosshair", (
            f"Connect mode component cursor should be 'crosshair', got '{comp_cursor_connect}'"
        )

        # ------------------------------------------------------------------
        # 12. Endpoint-hit blue-square hover highlight remains in all modes
        # ------------------------------------------------------------------
        # The hover styles (fill: rgba(37,99,235,0.18); stroke: rgba(37,99,235,0.45))
        # are defined on .endpoint-hit:hover and should remain active regardless
        # of mode since we only override cursor, not fill/stroke.

        # Force hover on an endpoint-hit rect via Playwright and check computed style
        ep_rect = nets_layer.locator("rect.endpoint-hit").first
        ep_rect.hover()
        page.wait_for_timeout(100)

        ep_computed = page.evaluate(
            """() => {
                const rect = document.querySelector('rect.endpoint-hit');
                if (!rect) return null;
                const s = window.getComputedStyle(rect);
                return { fill: s.fill, stroke: s.stroke, cursor: s.cursor };
            }"""
        )
        assert ep_computed is not None, "Should find endpoint-hit rect"

        # The fill should indicate the blue highlight (non-transparent)
        # rgba(37, 99, 235, 0.18) in RGB form: rgb(37, 99, 235) with alpha 0.18
        fill_val = ep_computed["fill"]
        assert fill_val != "rgba(0, 0, 0, 0)" and "transparent" not in fill_val.lower(), (
            f"Endpoint-hit hover should have visible blue fill, got '{fill_val}'"
        )

        # The stroke should be the blue highlight
        stroke_val = ep_computed["stroke"]
        assert "235" in stroke_val or "blue" in stroke_val.lower(), (
            f"Endpoint-hit hover should have blue stroke, got '{stroke_val}'"
        )

        # Verify cursor in connect mode on hovered endpoint
        assert ep_computed["cursor"] == "crosshair", (
            f"Hovered endpoint-hit in connect mode should be 'crosshair', got '{ep_computed['cursor']}'"
        )

        # Switch to select mode and verify hover highlight still works
        switch_mode("Select")
        ep_rect.hover()
        page.wait_for_timeout(100)
        ep_computed_sel = page.evaluate(
            """() => {
                const rect = document.querySelector('rect.endpoint-hit');
                if (!rect) return null;
                const s = window.getComputedStyle(rect);
                return { fill: s.fill, stroke: s.stroke, cursor: s.cursor };
            }"""
        )
        assert ep_computed_sel is not None
        fill_sel = ep_computed_sel["fill"]
        assert fill_sel != "rgba(0, 0, 0, 0)" and "transparent" not in fill_sel.lower(), (
            f"Endpoint-hit hover in select mode should still have blue fill, got '{fill_sel}'"
        )

        # ------------------------------------------------------------------
        # 13. Mode change properly updates canvas cursor class
        # ------------------------------------------------------------------
        # Verify the mode-* class is present on the canvas for each mode
        switch_mode("Select")
        classes = page.evaluate("""() => document.getElementById('canvas').getAttribute('class') || ''""")
        assert "mode-select" in classes, f"Canvas should have mode-select, got '{classes}'"

        switch_mode("Drag")
        classes = page.evaluate("""() => document.getElementById('canvas').getAttribute('class') || ''""")
        assert "mode-drag" in classes, f"Canvas should have mode-drag, got '{classes}'"

        switch_mode("Connect")
        classes = page.evaluate("""() => document.getElementById('canvas').getAttribute('class') || ''""")
        assert "mode-connect" in classes, f"Canvas should have mode-connect, got '{classes}'"

        print("  ✓ All pointer / cursor behavior assertions passed")


if __name__ == "__main__":
    run()
