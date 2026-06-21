#!/usr/bin/env python3
"""
Test: Data Portal — Export and Import functionality.

Features tested:
  - Clicking "Export Schema" populates the textarea with SVG data.
  - Exported text is non-empty and contains expected SVG structure.
  - Comment components survive export/import round-trip.
  - Clicking "Import Schema" with valid SVG text restores elements.
  - Status messages appear after export/import (success/error).
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

        # Add some components so we have something to export
        page.click("#add-component-btn")
        page.wait_for_timeout(100)
        page.click("#add-resistor-btn")
        page.wait_for_timeout(100)
        page.click("#add-gnd-btn")
        page.wait_for_timeout(100)
        # Add a comment component with some text
        page.click("#add-comment-btn")
        page.wait_for_timeout(100)
        # Type text into the comment so it survives auto-delete
        comment_input = page.locator("#inspector-body input[type='text']").first
        comment_input.fill("Test Comment")
        page.wait_for_timeout(100)

        components_layer = page.locator("#components-layer")
        initial_component_count = components_layer.locator(".generic-component").count()
        assert initial_component_count >= 4, (
            f"Expected at least 4 components, got {initial_component_count}"
        )

        # ------------------------------------------------------------------
        # 1. Export Schema
        # ------------------------------------------------------------------
        page.click("#export-btn")
        page.wait_for_timeout(100)

        # The textarea should now contain exported SVG
        textarea = page.locator("#data-portal")
        exported_text = textarea.input_value()

        assert len(exported_text) > 100, (
            f"Exported text too short ({len(exported_text)} chars): '{exported_text[:100]}...'"
        )
        assert "svg" in exported_text.lower(), (
            "Exported text should contain 'svg'"
        )
        assert "generic-component" in exported_text or "component" in exported_text.lower(), (
            "Exported text should contain component data"
        )
        assert "comment-component" in exported_text, (
            "Exported text should contain comment-component data"
        )
        assert "Test Comment" in exported_text, (
            "Exported text should contain the comment text 'Test Comment'"
        )

        # Status message should appear
        msg = page.locator("#data-portal-msg")
        msg_text = msg.inner_text()
        assert "Export" in msg_text or "Exported" in msg_text or "bytes" in msg_text, (
            f"Expected export status message, got: '{msg_text}'"
        )

        # ------------------------------------------------------------------
        # 2. Clear the canvas by reloading, then Import
        # ------------------------------------------------------------------
        page.goto(APP_URL)
        page.wait_for_load_state("networkidle")

        # Verify canvas is empty
        empty_count = components_layer.locator(".generic-component").count()
        assert empty_count == 0, f"Canvas should be empty after reload, got {empty_count}"

        # Paste the exported text and import
        textarea = page.locator("#data-portal")
        textarea.fill(exported_text)
        page.wait_for_timeout(50)

        page.click("#import-btn")
        page.wait_for_timeout(200)

        # Verify components were restored
        imported_count = components_layer.locator(".generic-component").count()
        assert imported_count >= initial_component_count, (
            f"Import should restore at least {initial_component_count} components, "
            f"got {imported_count}"
        )

        # Verify comment component was restored with its text
        imported_comments = components_layer.locator(".comment-component")
        assert imported_comments.count() >= 1, (
            f"Import should restore the comment component, got {imported_comments.count()}"
        )
        # Check that the comment text survived
        restored_comment_text = imported_comments.first.locator("text.comment-line").first.text_content().strip()
        assert restored_comment_text == "Test Comment", (
            f"Comment text should be 'Test Comment' after import, got '{restored_comment_text}'"
        )

        # Status message for import
        msg_text = page.locator("#data-portal-msg").inner_text()
        assert "Import" in msg_text or "imported" in msg_text.lower(), (
            f"Expected import status message, got: '{msg_text}'"
        )

        # ------------------------------------------------------------------
        # 3. Import with invalid text should show error
        # ------------------------------------------------------------------
        textarea.fill("not valid SVG content")
        page.click("#import-btn")
        page.wait_for_timeout(100)

        msg_text = page.locator("#data-portal-msg").inner_text()
        assert "fail" in msg_text.lower() or "error" in msg_text.lower(), (
            f"Expected error message for invalid import, got: '{msg_text}'"
        )

        print("  ✓ All data portal assertions passed")


if __name__ == "__main__":
    run()
