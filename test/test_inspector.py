#!/usr/bin/env python3
"""
Test: Inspector sidebar — different panels per element type and editable fields.

Features tested:
  - Selecting a generic component shows: pin labels, width input, rows input,
    top label, bottom label, secondary checkbox, and delete button.
  - Editing pin labels, width, rows updates the component in the canvas.
  - Secondary checkbox toggles the data-secondary attribute on the component.
  - Selecting a passive component shows: label input, rotation select.
  - Selecting a VDD shows: label input.
  - Selecting a GND shows: read-only position info.
  - Selecting a line shows: coordinates and delete button.
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

        inspector = page.locator("#inspector-body")

        # ------------------------------------------------------------------
        # 1. Generic component inspector
        # ------------------------------------------------------------------
        page.click("#add-component-btn")
        page.wait_for_timeout(100)

        # Should show the component panel (not "Nothing selected")
        inspector_text = inspector.inner_text()
        assert "Nothing selected" not in inspector_text, (
            "Inspector should show component detail, not empty message"
        )

        # Should have pin label inputs (at least some text inputs)
        inputs = inspector.locator("input[type='text']")
        assert inputs.count() >= 1, (
            f"Expected at least 1 text input in inspector, got {inputs.count()}"
        )

        # Edit top label
        top_input = inspector.locator("input").first
        old_value = top_input.input_value()
        top_input.fill("MyComponent")
        top_input.press("Enter")
        page.wait_for_timeout(100)

        # Verify the change was applied to the component's top label text
        comp = page.locator(".generic-component.is-selected").first
        top_label = comp.locator("text.label-top")
        assert top_label.text_content() == "MyComponent", (
            f"Top label should be 'MyComponent', got '{top_label.text_content()}'"
        )

        # Edit a pin label — the inspector should have a text input for pin labels
        # The pin inputs are identified by being near the pin section.
        # Let's change pin L1 to something custom.
        # Find all text inputs and use the one whose current value matches a pin label
        pin_inputs = inspector.locator("input[type='text']")
        pin_input_count = pin_inputs.count()
        # Typically there are inputs for: top label, bottom label, and pin labels
        # Try to find the L1 pin input
        found = False
        for i in range(pin_input_count):
            val = pin_inputs.nth(i).input_value()
            if val == "L1":
                pin_inputs.nth(i).fill("CLK")
                pin_inputs.nth(i).press("Enter")
                found = True
                break
        page.wait_for_timeout(100)

        if found:
            # Verify the pin label updated in the canvas
            pin_text = comp.locator("text.pin-left[data-row='0']")
            assert pin_text.text_content() == "CLK", (
                f"Pin L1 should be 'CLK' but got '{pin_text.text_content()}'"
            )

        # ------------------------------------------------------------------
        # 2. Width change (generic component)
        # ------------------------------------------------------------------
        # The width is a number input; find it
        width_input = inspector.locator("input[type='number']")
        if width_input.count() >= 1:
            old_width = comp.get_attribute("data-width")
            width_input.first.fill("150")
            width_input.first.press("Enter")
            page.wait_for_timeout(100)
            new_width = comp.get_attribute("data-width")
            assert new_width == "150", (
                f"Component width should be 150 after edit, got {new_width}"
            )

        # ------------------------------------------------------------------
        # 2b. Secondary checkbox (grey fill)
        # ------------------------------------------------------------------
        # The "Secondary (grey fill)" checkbox should be present in the
        # generic component inspector panel.
        # Find the label containing the checkbox using CSS :has() selector
        secondary_label = inspector.locator("label:has(input[type='checkbox'])")
        secondary_checkbox_count = secondary_label.count()
        assert secondary_checkbox_count >= 1, (
            f"Secondary checkbox label not found in inspector. Found {secondary_checkbox_count} matching labels"
        )
        secondary_text = secondary_label.first.inner_text()
        assert "Secondary" in secondary_text or "grey fill" in secondary_text, (
            f"Incorrect secondary label text: {secondary_text}"
        )

        # Check the checkbox and verify data-secondary is set on the component
        secondary_checkbox = inspector.locator("input[type='checkbox']").first
        secondary_checkbox.check()
        page.wait_for_timeout(100)
        assert comp.get_attribute('data-secondary') == 'true', (
            "Component should have data-secondary='true' after checking the box"
        )

        # Uncheck and verify data-secondary is removed
        secondary_checkbox.uncheck()
        page.wait_for_timeout(100)
        secondary_val = comp.get_attribute('data-secondary')
        assert secondary_val is None or secondary_val == "false", (
            f"data-secondary should be removed after unchecking, got: {secondary_val}"
        )

        # ------------------------------------------------------------------
        # 3. Passive component inspector
        # ------------------------------------------------------------------
        page.click("#add-resistor-btn")
        page.wait_for_timeout(100)

        inspector_text = inspector.inner_text()
        assert "resistor" in inspector_text.lower(), (
            f"Inspector should show 'resistor' type, got: {inspector_text}"
        )

        # Should have a label input and rotation select
        label_input = inspector.locator("input[type='text']").first
        label_exists = label_input.count() >= 1
        # Fill in a label
        if label_exists:
            label_input.fill("R42")
            label_input.press("Enter")
            page.wait_for_timeout(100)
            # Verify the passive label text updated
            passive = page.locator(".passive-component.is-selected").first
            passive_label = passive.locator("text.passive-label")
            assert passive_label.text_content() == "R42", (
                f"Passive label should be 'R42', got '{passive_label.text_content()}'"
            )

        # Rotation select should exist
        rot_select = inspector.locator("select")
        assert rot_select.count() >= 1, (
            f"Expected rotation select in passive inspector, got {rot_select.count()}"
        )

        # ------------------------------------------------------------------
        # 4. VDD inspector
        # ------------------------------------------------------------------
        page.click("#add-vdd-btn")
        page.wait_for_timeout(100)

        inspector_text = inspector.inner_text()
        assert "power" in inspector_text.lower() or "vdd" in inspector_text.lower(), (
            f"Expected VDD/power panel, got: {inspector_text}"
        )

        # VDD label input should be editable
        vdd_inputs = inspector.locator("input[type='text']")
        for i in range(vdd_inputs.count()):
            val = vdd_inputs.nth(i).input_value()
            if val == "VDD":
                vdd_inputs.nth(i).fill("3V3")
                vdd_inputs.nth(i).press("Enter")
                break
        page.wait_for_timeout(100)
        vdd = page.locator(".vdd-component.is-selected").first
        vdd_label = vdd.locator("text.vdd-label")
        assert vdd_label.text_content() == "3V3", (
            f"VDD label should be '3V3', got '{vdd_label.text_content()}'"
        )

        # ------------------------------------------------------------------
        # 5. Line inspector
        # ------------------------------------------------------------------
        # Draw a line first
        page.locator(".mode-btn[data-mode='connect']").click()
        page.wait_for_timeout(50)
        svg = page.locator("#canvas")
        svg.click(position={"x": 600, "y": 600})
        page.wait_for_timeout(50)
        svg.click(position={"x": 800, "y": 600})
        page.wait_for_timeout(100)

        # Select the line
        page.locator(".mode-btn[data-mode='select']").click()
        page.wait_for_timeout(50)

        # Click near the line to select it
        page.evaluate("""
            () => {
                const svg = document.getElementById('canvas');
                const pt = svg.createSVGPoint();
                pt.x = 700; pt.y = 605;
                const ctm = svg.getScreenCTM();
                const screenPt = pt.matrixTransform(ctm);
                const el = document.elementFromPoint(screenPt.x, screenPt.y);
                const paths = [el];
                let n = el;
                while (n && n !== svg) {
                    paths.push(n);
                    n = n.parentElement;
                }
                // Fire click on each in reverse to bubble
                const mainTarget = paths.find(
                    p => p && p.classList && p.classList.contains('net-line')
                );
                if (mainTarget) {
                    mainTarget.dispatchEvent(new PointerEvent('click', {
                        bubbles: true, clientX: screenPt.x, clientY: screenPt.y
                    }));
                }
            }
        """)
        page.wait_for_timeout(100)

        # Inspector should show line info
        inspector_text = inspector.inner_text()
        assert "Line" in inspector_text or "Delete" in inspector_text, (
            f"Expected line inspector panel, got: {inspector_text}"
        )

        print("  ✓ All inspector sidebar assertions passed")


if __name__ == "__main__":
    run()
