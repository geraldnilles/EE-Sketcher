#!/usr/bin/env python3
"""
Test: Toolbar mode toggling and keyboard shortcuts.

Features tested:
  - Clicking Select / Drag / Connect buttons changes the active mode.
  - Keyboard shortcuts S, D, C switch modes.
  - The .mode-{select,drag,connect} class is applied to the SVG canvas.
  - The active button gets the .active CSS class.
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
        mode_buttons = page.locator(".mode-btn")

        # ------------------------------------------------------------------
        # 1. Click each button and verify active class and canvas cursor class
        # ------------------------------------------------------------------
        def assert_mode(expected_mode: str):
            # Wait for the DOM attribute to settle
            page.wait_for_timeout(100)
            # Active button
            active_btn = page.locator(".mode-btn.active")
            assert active_btn.count() == 1, (
                f"Expected exactly 1 active mode button, got {active_btn.count()}"
            )
            actual = active_btn.get_attribute("data-mode")
            assert actual == expected_mode, (
                f"Expected active mode '{expected_mode}', got '{actual}'"
            )
            # Canvas cursor class
            classes = svg.evaluate("el => el.getAttribute('class') || ''")
            assert f"mode-{expected_mode}" in classes, (
                f"Canvas missing class 'mode-{expected_mode}', got '{classes}'"
            )

        # Start with select (default)
        assert_mode("select")

        # Switch to drag via button
        mode_buttons.filter(has_text="Drag").click()
        assert_mode("drag")

        # Switch to connect via button
        mode_buttons.filter(has_text="Connect").click()
        assert_mode("connect")

        # Switch back to select via button
        mode_buttons.filter(has_text="Select").click()
        assert_mode("select")

        # ------------------------------------------------------------------
        # 2. Keyboard shortcuts
        # ------------------------------------------------------------------
        # Press D → drag mode
        page.keyboard.press("d")
        assert_mode("drag")

        # Press C → connect mode
        page.keyboard.press("c")
        assert_mode("connect")

        # Press S → select mode
        page.keyboard.press("s")
        assert_mode("select")

        # Capital letters should also work
        page.keyboard.press("D")
        assert_mode("drag")

        page.keyboard.press("S")
        assert_mode("select")

        print("  ✓ All mode toggling assertions passed")


if __name__ == "__main__":
    run()
