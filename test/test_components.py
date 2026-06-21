#!/usr/bin/env python3
"""
Test: Component creation via toolbar buttons and keyboard shortcuts.

Features tested:
  - + Component button (and key A) creates a generic block with left/right pins
  - + GND button creates a ground symbol
  - + VDD button creates a power bus with label
  - + Resistor / + Capacitor / + Inductor / + Diode create passive components
  - + Comment button creates a text comment component
  - Component appears in the components-layer
  - Component gets auto-selected (.is-selected)
  - Component has data-id attribute
"""

from playwright.sync_api import sync_playwright

APP_URL = "http://localhost:8080"
CDP_URL = "http://localhost:9876"


def assert_one_selected_component(page):
    """Waits briefly and checks that exactly one element has .is-selected."""
    page.wait_for_timeout(100)
    sel_count = page.locator(".is-selected").count()
    assert sel_count == 1, f"Expected 1 selected element, got {sel_count}"


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(CDP_URL)
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(APP_URL)
        page.wait_for_load_state("networkidle")

        components_layer = page.locator("#components-layer")
        initial_count = components_layer.locator(".generic-component").count()

        # ------------------------------------------------------------------
        # 1. Generic component via toolbar button
        # ------------------------------------------------------------------
        page.click("#add-component-btn")
        assert_one_selected_component(page)
        generic_components = components_layer.locator(".generic-component")
        assert generic_components.count() == initial_count + 1, (
            "Generic component was not added"
        )
        # The newly created component should have pins
        new_comp = generic_components.last
        assert new_comp.get_attribute("data-id"), "Component missing data-id"
        left_pins = new_comp.locator("text.pin-left")
        right_pins = new_comp.locator("text.pin-right")
        assert left_pins.count() > 0, "Generic component missing left pins"
        assert right_pins.count() > 0, "Generic component missing right pins"

        # ------------------------------------------------------------------
        # 2. Generic component via keyboard shortcut A
        # ------------------------------------------------------------------
        page.keyboard.press("a")
        assert_one_selected_component(page)
        assert generic_components.count() == initial_count + 2, (
            "Component via keyboard A was not added"
        )

        # ------------------------------------------------------------------
        # 3. GND component via button
        # ------------------------------------------------------------------
        page.click("#add-gnd-btn")
        assert_one_selected_component(page)
        gnd_comps = components_layer.locator(".gnd-component")
        assert gnd_comps.count() >= 1, "GND component was not added"
        assert gnd_comps.last.get_attribute("data-id"), "GND missing data-id"

        # ------------------------------------------------------------------
        # 4. VDD component via button
        # ------------------------------------------------------------------
        page.click("#add-vdd-btn")
        assert_one_selected_component(page)
        vdd_comps = components_layer.locator(".vdd-component")
        assert vdd_comps.count() >= 1, "VDD component was not added"
        assert vdd_comps.last.get_attribute("data-id"), "VDD missing data-id"
        # Default label is VDD
        vdd_label_el = vdd_comps.last.locator("text.vdd-label")
        assert vdd_label_el.count() >= 1, "VDD label not found"

        # ------------------------------------------------------------------
        # 5. Resistor button
        # ------------------------------------------------------------------
        page.click("#add-resistor-btn")
        assert_one_selected_component(page)
        resistor = components_layer.locator(".passive-component[data-type='resistor']")
        assert resistor.count() >= 1, "Resistor was not added"

        # ------------------------------------------------------------------
        # 6. Capacitor button
        # ------------------------------------------------------------------
        page.click("#add-capacitor-btn")
        assert_one_selected_component(page)
        capacitor = components_layer.locator(".passive-component[data-type='capacitor']")
        assert capacitor.count() >= 1, "Capacitor was not added"

        # ------------------------------------------------------------------
        # 7. Inductor button
        # ------------------------------------------------------------------
        page.click("#add-inductor-btn")
        assert_one_selected_component(page)
        inductor = components_layer.locator(".passive-component[data-type='inductor']")
        assert inductor.count() >= 1, "Inductor was not added"

        # ------------------------------------------------------------------
        # 8. Diode button
        # ------------------------------------------------------------------
        page.click("#add-diode-btn")
        assert_one_selected_component(page)
        diode = components_layer.locator(".passive-component[data-type='diode']")
        assert diode.count() >= 1, "Diode was not added"

        # ------------------------------------------------------------------
        # 10. Comment component via toolbar button
        # ------------------------------------------------------------------
        page.click("#add-comment-btn")
        assert_one_selected_component(page)
        comment = components_layer.locator(".comment-component")
        assert comment.count() >= 1, "Comment component was not added"
        assert comment.last.get_attribute("data-id"), "Comment missing data-id"
        assert comment.last.get_attribute("data-lines") == "1", "Comment should have data-lines=1"

        # Verify the comment has a background rect and an initial text line
        rect = comment.last.locator("rect.comment-body")
        assert rect.count() >= 1, "Comment missing rect.comment-body"
        line = comment.last.locator("text.comment-line[data-line-idx='0']")
        assert line.count() >= 1, "Comment missing initial text line (data-line-idx=0)"

        # ------------------------------------------------------------------
        # 11. All passives have a use element referencing the correct SVG def
        # ------------------------------------------------------------------
        for ptype in ("resistor", "capacitor", "inductor", "diode"):
            comp = components_layer.locator(f".passive-component[data-type='{ptype}']").last
            use_el = comp.locator("use")
            assert use_el.count() >= 1, f"{ptype} missing <use> element"
            href = use_el.get_attribute("href")
            assert href == f"#{ptype}", (
                f"{ptype} use href expected '#{ptype}', got '{href}'"
            )

        print("  ✓ All component creation assertions passed")


if __name__ == "__main__":
    run()
