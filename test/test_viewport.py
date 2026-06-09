#!/usr/bin/env python3
"""
Test: Viewport zoom and pan via mouse wheel.

Features tested:
  - Ctrl+wheel zooms the canvas (viewBox changes).
  - Shift+wheel pans horizontally.
  - Regular scroll pans.
  - Viewport remains within the world bounds (0–1500 x 0–1000).
"""

from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:8080"
CDP_URL = "http://localhost:9876"


def get_viewbox(page):
    """Return the viewBox string from the SVG element."""
    return page.locator("#canvas").get_attribute("viewBox") or ""


def parse_viewbox(vb_str):
    """Parse 'x y w h' into floats."""
    parts = vb_str.split()
    if len(parts) == 4:
        return tuple(float(p) for p in parts)
    return None


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(CDP_URL)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(APP_URL)
        page.wait_for_load_state("networkidle")

        svg = page.locator("#canvas")

        # Read initial viewBox
        initial_vb = get_viewbox(page)
        initial = parse_viewbox(initial_vb)
        assert initial is not None, f"Could not parse initial viewBox: '{initial_vb}'"
        x0, y0, w0, h0 = initial

        # ------------------------------------------------------------------
        # 1. Ctrl+wheel zoom out (negative deltaY = zoom out in this app)
        # ------------------------------------------------------------------
        bbox = svg.bounding_box()
        assert bbox is not None, "SVG has no bounding box"
        center_x = bbox["x"] + bbox["width"] / 2
        center_y = bbox["y"] + bbox["height"] / 2

        # The app zooms with factor = exp(-deltaY * 0.003).
        # deltaY=100 → factor = exp(-0.3) ≈ 0.74 (zoom in since factor < 1 makes newW smaller?)
        # Actually: newW = view.w / factor. With factor > 1 (positive deltaY), newW shrinks (zoom in).
        # Let's use deltaY=100 (positive = zoom in, factor≈1.35)
        page.mouse.move(center_x, center_y)
        # Dispatch wheel with Ctrl held for zoom
        page.mouse.move(center_x, center_y)
        page.evaluate("""
            ([x, y]) => {
                const el = document.elementFromPoint(x, y);
                el.dispatchEvent(new WheelEvent('wheel', {
                    deltaX: 0, deltaY: -120, ctrlKey: true, clientX: x, clientY: y,
                    bubbles: true, cancelable: true
                }));
            }
        """, [center_x, center_y])
        page.wait_for_timeout(100)

        zoomed_vb = get_viewbox(page)
        zoomed = parse_viewbox(zoomed_vb)
        assert zoomed is not None, f"Could not parse zoomed viewBox: '{zoomed_vb}'"
        _, _, wz, _ = zoomed

        # After zoom in with deltaY=100 (factor=exp(0.3)≈1.35), viewBox width should be smaller
        assert wz < w0, (
            f"Zoom in should reduce viewBox width. Initial: {w0}, After: {wz}"
        )

        # Zoom back out
        # Dispatch wheel with Ctrl held for zoom out
        page.mouse.move(center_x, center_y)
        page.evaluate("""
            ([x, y]) => {
                const el = document.elementFromPoint(x, y);
                el.dispatchEvent(new WheelEvent('wheel', {
                    deltaX: 0, deltaY: 120, ctrlKey: true, clientX: x, clientY: y,
                    bubbles: true, cancelable: true
                }));
            }
        """, [center_x, center_y])
        page.wait_for_timeout(100)

        restored_vb = get_viewbox(page)
        restored = parse_viewbox(restored_vb)
        assert restored is not None, "Could not parse restored viewBox"
        _, _, wr, _ = restored

        # Width should be closer to original
        assert abs(wr - w0) < 10, (
            f"ViewBox width should be close to original after zoom out. "
            f"Initial: {w0}, After restore: {wr}"
        )

        # ------------------------------------------------------------------
        # 2. Shift+wheel pans horizontally
        # ------------------------------------------------------------------
        page.mouse.move(center_x, center_y)
        page.evaluate("""
            ([x, y]) => {
                const el = document.elementFromPoint(x, y);
                el.dispatchEvent(new WheelEvent('wheel', {
                    deltaX: 0, deltaY: 50, shiftKey: true, clientX: x, clientY: y,
                    bubbles: true, cancelable: true
                }));
            }
        """, [center_x, center_y])
        page.wait_for_timeout(100)
        shifted_vb = get_viewbox(page)
        shifted = parse_viewbox(shifted_vb)
        assert shifted is not None, "Could not parse shifted viewBox"
        xs, _, _, _ = shifted

        # Horizontal pan: Shift+wheel moves viewBox.x
        # deltaY=50 with shift → horizontal pan by deltaY pixels in screen space
        # The direction depends on the app's implementation. We just verify it changed.
        assert xs != restored[0], (
            f"Shift+wheel should change X. Before: {restored[0]}, After: {xs}"
        )

        # ------------------------------------------------------------------
        # 3. Regular scroll pans
        # ------------------------------------------------------------------
        page.mouse.wheel(delta_x=0, delta_y=30)
        page.wait_for_timeout(100)
        scroll_vb = get_viewbox(page)
        scrolled = parse_viewbox(scroll_vb)
        assert scrolled is not None, "Could not parse scrolled viewBox"
        ys = scrolled[1]
        # Regular wheel moves in Y
        assert ys != shifted[1], (
            f"Regular scroll should change Y. Before: {shifted[1]}, After: {ys}"
        )

        # ------------------------------------------------------------------
        # 4. Viewport stays within world bounds (0,0)-(1500,1000)
        # ------------------------------------------------------------------
        # Pan far left and up by many scrolls
        for _ in range(10):
            page.mouse.wheel(delta_x=-100, delta_y=-100)
            page.wait_for_timeout(30)

        bounded_vb = get_viewbox(page)
        bounded = parse_viewbox(bounded_vb)
        assert bounded is not None, "Could not parse bounded viewBox"
        bx, by, bw, bh = bounded

        assert bx >= 0, f"viewBox x should be >= 0, got {bx}"
        assert by >= 0, f"viewBox y should be >= 0, got {by}"
        assert bx + bw <= 1500 + 1, f"viewBox right edge ({bx+bw}) should be <= 1500"
        assert by + bh <= 1000 + 1, f"viewBox bottom edge ({by+bh}) should be <= 1000"

        print("  ✓ All viewport assertions passed")


if __name__ == "__main__":
    run()
