#!/usr/bin/env python3
"""
Test: End-to-end integration — full user workflow.

Workflow:
  1. Add a generic component, a resistor, a GND, and a comment.
  2. Label the generic "U1" and resistor "R1".
  3. Add text to the comment.
  4. Draw net lines.
  5. Drag the generic component to a new position.
  6. Export the schema.
  7. Reset the page, import the schema.
  8. Verify all elements (including comment) are restored.
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

        # ------------------------------------------------------------------
        # 1. Add components
        # ------------------------------------------------------------------
        page.click("#add-component-btn")   # generic block
        page.wait_for_timeout(100)

        # Label it
        inspector = page.locator("#inspector-body")
        top_input = inspector.locator("input").first
        top_input.fill("U1")
        top_input.press("Enter")
        page.wait_for_timeout(100)

        page.click("#add-resistor-btn")
        page.wait_for_timeout(100)

        # Label resistor
        res_input = inspector.locator("input[type='text']").first
        res_input.fill("R1")
        res_input.press("Enter")
        page.wait_for_timeout(100)

        page.click("#add-gnd-btn")
        page.wait_for_timeout(100)

        # Add a comment component with text
        page.click("#add-comment-btn")
        page.wait_for_timeout(100)
        comment_input = page.locator("#inspector-body input[type='text']").first
        comment_input.fill("Design Note: VDD = 3.3V")
        page.wait_for_timeout(100)

        # ------------------------------------------------------------------
        # 2. Connect with nets
        # ------------------------------------------------------------------
        page.locator(".mode-btn[data-mode='connect']").click()
        page.wait_for_timeout(50)
        svg = page.locator("#canvas")

        # Connect from somewhere above the generic comp (where VDD might go)
        # Draw a vertical line down toward the component
        svg.click(position={"x": 250, "y": 100})
        page.wait_for_timeout(50)
        svg.click(position={"x": 250, "y": 200})
        page.wait_for_timeout(100)

        # Draw another line horizontally from left to the component
        svg.click(position={"x": 100, "y": 300})
        page.wait_for_timeout(50)
        svg.click(position={"x": 250, "y": 300})
        page.wait_for_timeout(100)

        # Draw a GND connection line
        svg.click(position={"x": 250, "y": 500})
        page.wait_for_timeout(50)
        svg.click(position={"x": 250, "y": 700})
        page.wait_for_timeout(100)

        # ------------------------------------------------------------------
        # 3. Drag the generic component
        # ------------------------------------------------------------------
        page.locator(".mode-btn[data-mode='drag']").click()
        page.wait_for_timeout(50)

        # Select the generic component (U1)
        # Find it by label text content
        comp = page.locator(".generic-component").first
        comp.click(force=True)
        page.wait_for_timeout(100)

        # Drag it
        bbox = comp.bounding_box()
        assert bbox is not None, "Component has no bounding box"
        start_x = bbox["x"] + bbox["width"] / 2
        start_y = bbox["y"] + bbox["height"] / 2

        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move(start_x + 50, start_y + 25, steps=5)
        page.mouse.up()
        page.wait_for_timeout(100)

        # ------------------------------------------------------------------
        # 4. Export the schema
        # ------------------------------------------------------------------
        page.click("#export-btn")
        page.wait_for_timeout(100)

        textarea = page.locator("#data-portal")
        exported = textarea.input_value()
        assert len(exported) > 100, "Exported schema too short"
        assert "U1" in exported, "Exported schema should contain component label 'U1'"
        assert "Design Note" in exported, "Exported schema should contain comment text"
        assert "comment-component" in exported, "Exported schema should contain comment component"

        # ------------------------------------------------------------------
        # 5. Reset and import
        # ------------------------------------------------------------------
        # Record counts before reset
        comp_count_before = page.locator("#components-layer .generic-component").count()
        line_count_before = page.locator("#nets-layer line.net-line").count()

        page.goto(APP_URL)
        page.wait_for_load_state("networkidle")

        # Canvas should be empty
        assert page.locator("#components-layer .generic-component").count() == 0
        assert page.locator("#nets-layer line.net-line").count() == 0

        # Import
        textarea = page.locator("#data-portal")
        textarea.fill(exported)
        page.click("#import-btn")
        page.wait_for_timeout(200)

        # ------------------------------------------------------------------
        # 6. Verify restoration
        # ------------------------------------------------------------------
        restored_comps = page.locator("#components-layer .generic-component").count()
        restored_lines = page.locator("#nets-layer line.net-line").count()

        assert restored_comps >= comp_count_before, (
            f"Components not fully restored. Before: {comp_count_before}, After: {restored_comps}"
        )
        assert restored_lines >= line_count_before, (
            f"Lines not fully restored. Before: {line_count_before}, After: {restored_lines}"
        )

        # Verify the label survived the round-trip
        page_text = page.evaluate("() => document.querySelector('#components-layer')?.innerHTML || ''")
        assert "U1" in page_text, "Component label 'U1' should survive export/import round-trip"

        # Verify comment component survived round-trip
        imported_comments = page.locator("#components-layer .comment-component")
        assert imported_comments.count() >= 1, (
            f"Comment should survive export/import, got {imported_comments.count()}"
        )
        comment_text = imported_comments.first.locator("text.comment-line").first.text_content()
        assert "Design Note" in comment_text, (
            f"Comment text should survive round-trip, got '{comment_text}'"
        )

        # ------------------------------------------------------------------
        # 7. Selection and deletion still work after import
        # ------------------------------------------------------------------
        page.locator(".mode-btn[data-mode='select']").click()
        page.wait_for_timeout(50)

        # Click a component to select it
        imported_comp = page.locator("#components-layer .generic-component").first
        imported_comp.click(force=True)
        page.wait_for_timeout(100)

        assert page.locator(".is-selected").count() >= 1, (
            "Component should be selectable after import"
        )

        # Delete it
        page.keyboard.press("Delete")
        page.wait_for_timeout(100)
        assert page.locator(".is-selected").count() == 0, (
            "Selection should clear after deleting imported component"
        )

        print("  ✓ All integration workflow assertions passed")


if __name__ == "__main__":
    run()
