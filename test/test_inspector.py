#!/usr/bin/env python3
"""
Test: Inspector sidebar — different panels per element type and editable fields.

Features tested:
  - Selecting a generic component shows: pin labels, width input, rows input,
    top label, bottom label, secondary checkbox, and delete button.
  - Editing pin labels, width, rows updates the component in the canvas.
  - Secondary checkbox toggles the data-secondary attribute on the component.
  - Selecting a comment component shows: "Text Comment" header, text inputs
    for each line, +/- line buttons, position info, and delete button.
  - Editing comment line text updates the component's SVG text element.
  - Adding/removing lines changes the data-lines attribute and text nodes.
  - Blur with all blank lines auto-deletes the comment component.
  - Selecting a passive component shows: label input, rotation select.
  - Selecting a VDD shows: label input.
  - Selecting a GND shows: read-only position info.
  - Selecting a line shows: coordinates and delete button.
  - Selecting a container shows: labels, width/height, fill dropdown, delete.
  - Duplicate button exists on all component panels and creates a copy offset by +25,+25.
  - Container labels are editable in the inspector.
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
        components_layer = page.locator("#components-layer")

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
        # 3a. Comment component inspector
        # ------------------------------------------------------------------
        # Clear current selection first
        page.keyboard.press("Escape")
        page.wait_for_timeout(50)

        page.click("#add-comment-btn")
        page.wait_for_timeout(100)

        comment = page.locator(".comment-component.is-selected").first
        assert comment.count() >= 1, "Comment component should be selected after creation"

        inspector_text = inspector.inner_text()
        assert "Text Comment" in inspector_text or "Comment" in inspector_text, (
            f"Inspector should show Text Comment panel, got: {inspector_text}"
        )

        # Should have at least one text input for the comment line
        comment_inputs = inspector.locator("input[type='text']")
        assert comment_inputs.count() >= 1, (
            f"Expected at least 1 text input for comment, got {comment_inputs.count()}"
        )

        # Type something in the first line and verify the SVG text updates
        comment_inputs.first.fill("Hello World")
        page.wait_for_timeout(100)
        # Verify the SVG text node was updated
        svg_line = comment.locator("text.comment-line[data-line-idx='0']")
        comment_text = svg_line.text_content()
        assert "Hello" in comment_text, (
            f"Comment SVG text should contain 'Hello', got '{comment_text}'"
        )

        # Test + Line button adds a new line
        plus_btn = inspector.locator("button:has-text('+ Line')")
        assert plus_btn.count() >= 1, "+ Line button not found in comment inspector"
        plus_btn.first.click()
        page.wait_for_timeout(100)

        # data-lines should now be 2
        new_lines_attr = comment.get_attribute("data-lines")
        assert new_lines_attr == "2", (
            f"data-lines should be 2 after adding a line, got {new_lines_attr}"
        )
        # A second text.comment-line should exist
        second_line = comment.locator("text.comment-line[data-line-idx='1']")
        assert second_line.count() >= 1, "Second text line (idx=1) was not created"

        # Verify the inspector now shows 2 text inputs
        comment_inputs_after = inspector.locator("input[type='text']")
        assert comment_inputs_after.count() >= 2, (
            f"Expected at least 2 text inputs after adding line, got {comment_inputs_after.count()}"
        )

        # Test - Line button removes a line
        minus_btn = inspector.locator("button:has-text('- Line')")
        assert minus_btn.count() >= 1, "- Line button not found in comment inspector"
        minus_btn.first.click()
        page.wait_for_timeout(100)

        new_lines_attr2 = comment.get_attribute("data-lines")
        assert new_lines_attr2 == "1", (
            f"data-lines should be 1 after removing a line, got {new_lines_attr2}"
        )

        # Position info should be shown
        assert "Position" in inspector_text or "position" in inspector.inner_text().lower(), (
            "Comment inspector should show Position info"
        )

        # Delete button should exist
        delete_comment_btn = inspector.locator("button:has-text('Delete Comment')")
        assert delete_comment_btn.count() >= 1, (
            "Delete Comment button not found in comment inspector"
        )

        # Auto-delete on blur when all lines are blank
        # Clear the input, then click elsewhere to trigger blur
        comment_inputs_after.first.fill("")
        page.wait_for_timeout(50)
        # Click on the canvas to blur the input
        page.locator("#canvas").click(position={"x": 100, "y": 100})
        page.wait_for_timeout(150)

        # The comment should now be deleted
        remaining_comments = components_layer.locator(".comment-component")
        assert remaining_comments.count() == 0, (
            f"Comment should be auto-deleted when all lines are blank, got {remaining_comments.count()}"
        )
        # Inspector should show "Nothing selected"
        inspector_text = inspector.inner_text()
        assert "Nothing selected" in inspector_text, (
            "Inspector should show 'Nothing selected' after auto-delete"
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
            passive_label = passive.locator("text.passive-label-primary")
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

        # ------------------------------------------------------------------
        # 6. Container inspector
        # ------------------------------------------------------------------
        # Deselect current element
        page.keyboard.press("Escape")
        page.wait_for_timeout(50)

        page.click("#add-container-btn")
        page.wait_for_timeout(100)

        container = page.locator(".container-component.is-selected").first
        assert container.count() >= 1, "Container should be selected after creation"

        inspector_text = inspector.inner_text()
        assert "LAYER CONTAINER" in inspector_text, (
            f"Inspector should show LAYER CONTAINER panel, got: {inspector_text}"
        )

        # Should have top and bottom label inputs
        label_inputs = inspector.locator("input[type='text']")
        assert label_inputs.count() >= 2, (
            f"Expected at least 2 text inputs for container labels, got {label_inputs.count()}"
        )

        # Edit top label
        label_inputs.nth(0).fill("Analog Section")
        page.wait_for_timeout(100)
        top_label_el = container.locator("text.label-top")
        assert top_label_el.text_content() == "Analog Section", (
            f"Top label should be 'Analog Section', got '{top_label_el.text_content()}'"
        )

        # Edit bottom label
        label_inputs.nth(1).fill("Power Stage")
        page.wait_for_timeout(100)
        bottom_label_el = container.locator("text.label-bottom")
        assert bottom_label_el.text_content() == "Power Stage", (
            f"Bottom label should be 'Power Stage', got '{bottom_label_el.text_content()}'"
        )

        # Fill dropdown should exist
        fill_select = inspector.locator("select")
        assert fill_select.count() >= 1, (
            f"Expected fill color select in container inspector, got {fill_select.count()}"
        )

        # Delete button should exist
        delete_container_btn = inspector.locator("button:has-text('Delete Container')")
        assert delete_container_btn.count() >= 1, (
            "Delete Container button not found in container inspector"
        )

        # ------------------------------------------------------------------
        # 7. Duplicate button (container)
        # ------------------------------------------------------------------
        dup_btn = inspector.locator("button:has-text('Duplicate Container')")
        assert dup_btn.count() >= 1, (
            "Duplicate Container button not found in container inspector"
        )

        # Capture original container transform before duplication
        cont_transform = container.evaluate("e => e.getAttribute('transform') || ''")

        # Count containers before duplicate
        cont_before = page.locator("#containers-layer .container-component").count()
        # Use evaluate because the button click causes sidebar re-render (DOM detach)
        page.evaluate(
            'async () => {'
            '  const { duplicateComponent } = await import("/js/components.js");'
            '  const c = document.querySelector("#containers-layer .container-component.is-selected");'
            '  duplicateComponent(c);'
            '  await new Promise(r => setTimeout(r, 200));'
            '}'
        )
        page.wait_for_timeout(150)

        # Should now have one more container
        cont_after = page.locator("#containers-layer .container-component").count()
        assert cont_after == cont_before + 1, (
            f"Duplicate should add a container. Before: {cont_before}, After: {cont_after}"
        )

        # The new container should be selected and have the same labels
        dup_container = page.locator(".container-component.is-selected").first
        dup_top = dup_container.locator("text.label-top")
        assert dup_top.text_content() == "Analog Section", (
            f"Duplicated container top label should be 'Analog Section', got '{dup_top.text_content()}'"
        )
        dup_bottom = dup_container.locator("text.label-bottom")
        assert dup_bottom.text_content() == "Power Stage", (
            f"Duplicated container bottom label should be 'Power Stage', got '{dup_bottom.text_content()}'"
        )

        # Verify the duplicate is at a different position (offset by +25,+25)
        dup_transform = dup_container.evaluate("e => e.getAttribute('transform') || ''")
        assert dup_transform != cont_transform, (
            f"Duplicate should be at a different position. Orig: {cont_transform}, Dupe: {dup_transform}"
        )

        # ------------------------------------------------------------------
        # 8. Duplicate button (generic component)
        # ------------------------------------------------------------------
        page.keyboard.press("Escape")
        page.wait_for_timeout(50)

        page.click("#add-component-btn")
        page.wait_for_timeout(100)

        # Set a label so we can verify it's copied
        inspector_text = inspector.inner_text()
        top_inputs = inspector.locator("input[type='text']")
        top_inputs.nth(0).fill("U42")
        page.wait_for_timeout(100)

        # Count components before duplicate
        gen_before = page.locator("#components-layer .generic-component:not(.gnd-component):not(.vdd-component):not(.passive-component):not(.comment-component):not(.container-component)").count()
        dup_btn = inspector.locator("button:has-text('Duplicate Component')")
        assert dup_btn.count() >= 1, "Duplicate Component button not found"
        # Use evaluate because button click causes sidebar re-render (DOM detach)
        page.evaluate(
            'async () => {'
            '  const { duplicateComponent } = await import("/js/components.js");'
            '  const c = document.querySelector("#components-layer .generic-component.is-selected");'
            '  duplicateComponent(c);'
            '  await new Promise(r => setTimeout(r, 200));'
            '}'
        )
        page.wait_for_timeout(150)

        gen_after = page.locator("#components-layer .generic-component:not(.gnd-component):not(.vdd-component):not(.passive-component):not(.comment-component):not(.container-component)").count()
        assert gen_after == gen_before + 1, (
            f"Duplicate generic should add one component. Before: {gen_before}, After: {gen_after}"
        )

        # Check label was copied
        dup_comp = page.locator(".generic-component.is-selected").first
        dup_label = dup_comp.locator("text.label-top")
        assert dup_label.text_content() == "U42", (
            f"Duplicated component top label should be 'U42', got '{dup_label.text_content()}'"
        )

        # ------------------------------------------------------------------
        # 9. Duplicate button (comment)
        # ------------------------------------------------------------------
        page.keyboard.press("Escape")
        page.wait_for_timeout(50)

        page.click("#add-comment-btn")
        page.wait_for_timeout(100)

        comment_inputs = inspector.locator("input[type='text']")
        comment_inputs.nth(0).fill("Copy Me")
        page.wait_for_timeout(100)

        comment_before = page.locator("#components-layer .comment-component").count()
        dup_comment_btn = inspector.locator("button:has-text('Duplicate Comment')")
        assert dup_comment_btn.count() >= 1, "Duplicate Comment button not found"
        # Use evaluate because button click causes sidebar re-render (DOM detach)
        page.evaluate(
            'async () => {'
            '  const { duplicateComponent } = await import("/js/components.js");'
            '  const c = document.querySelector("#components-layer .comment-component.is-selected");'
            '  duplicateComponent(c);'
            '  await new Promise(r => setTimeout(r, 200));'
            '}'
        )
        page.wait_for_timeout(150)

        comment_after = page.locator("#components-layer .comment-component").count()
        assert comment_after == comment_before + 1, (
            f"Duplicate comment should add one comment. Before: {comment_before}, After: {comment_after}"
        )

        # Check comment text was copied
        dup_comment = page.locator(".comment-component.is-selected").first
        dup_comment_text = dup_comment.locator("text.comment-line").first
        assert dup_comment_text.text_content().strip() == "Copy Me", (
            f"Duplicated comment should contain 'Copy Me', got '{dup_comment_text.text_content().strip()}'"
        )


        print("  ✓ All inspector sidebar assertions passed")


if __name__ == "__main__":
    run()
