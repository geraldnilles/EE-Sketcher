#!/usr/bin/env python3
import time
import re
from playwright.sync_api import sync_playwright, expect

# Global configuration variables
APP_URL = "http://localhost:8080"
CDP_URL = "http://localhost:9876"

def log_section(title):
    print("\n" + "=" * 60)
    print(f"  TEST MODULE: {title}")
    print("=" * 60)

def get_client_coords(page, svg_x, svg_y):
    """
    Translates logical SVG canvas grid coordinates into screen-space client coordinates
    dynamically using the browser's current viewport CTM matrix.
    """
    return page.evaluate(f"""
        (() => {{
            const svg = document.getElementById('canvas');
            const pt = svg.createSVGPoint();
            pt.x = {svg_x}; pt.y = {svg_y};
            const ctm = svg.getScreenCTM();
            const screenPt = pt.matrixTransform(ctm);
            return [screenPt.x, screenPt.y];
        }})()
    """)

def get_element_origin(page, selector):
    """ Extracts logical coordinates from an element's SVG transform translate property. """
    return page.evaluate(f"""
        (() => {{
            const el = document.querySelector('{selector}');
            if (!el) return null;
            const m = /translate\(\s*(-?\d+(?:\.\d+)?)\s*,?\s*(-?\d+(?:\.\d+)?)\s*\)/.exec(el.getAttribute('transform') || '');
            if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
            return [0, 0];
        }})()
    """)

def run_regression_suite():
    with sync_playwright() as p:
        print(f"Connecting to Chrome via CDP on {CDP_URL}...")
        browser = p.chromium.connect_over_cdp(CDP_URL)
        
        # Access target browser context and clear canvas space safely
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = context.pages[0] if context.pages else context.new_page()
        
        print(f"Navigating to webapp: {APP_URL}")
        page.goto(APP_URL)
        page.wait_for_selector("#canvas")
        
        # Guarantee workspace begins completely unpopulated
        page.evaluate("""() => {
            ['nets-layer', 'components-layer', 'junctions-layer', 'overlay-layer'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });
            window.dispatchEvent(new CustomEvent('selection-change', { detail: { selected: null } }));
        }""")
        
        # ---------------------------------------------------------------------
        # MODULE 1: Toolbar Operating Modes & Key Shortcuts
        # ---------------------------------------------------------------------
        log_section("1. Toolbar Mode Controls & Hotkeys")
        
        canvas = page.locator("#canvas")
        select_btn = page.locator('.mode-btn[data-mode="select"]')
        drag_btn = page.locator('.mode-btn[data-mode="drag"]')
        connect_btn = page.locator('.mode-btn[data-mode="connect"]')
        
        print("Verifying initial interface state default configuration...")
        expect(select_btn).to_have_class(re.compile(r"\bactive\b"))
        expect(canvas).to_have_class(re.compile(r"\bmode-select\b"))
        
        print("Testing direct toolbar click adjustments...")
        drag_btn.click()
        expect(drag_btn).to_have_class(re.compile(r"\bactive\b"))
        expect(canvas).to_have_class(re.compile(r"\bmode-drag\b"))
        
        connect_btn.click()
        expect(connect_btn).to_have_class(re.compile(r"\bactive\b"))
        expect(canvas).to_have_class(re.compile(r"\bmode-connect\b"))
        
        print("Testing keyboard hotkey overrides (Pressing 'S')...")
        page.keyboard.press("s")
        expect(select_btn).to_have_class(re.compile(r"\bactive\b"))
        expect(canvas).to_have_class(re.compile(r"\bmode-select\b"))
        
        # ---------------------------------------------------------------------
        # MODULE 2: Instantiation & Rendering (All Library Types)
        # ---------------------------------------------------------------------
        log_section("2. Structural Component Instantiation")
        
        components = [
            ("add-component-btn", "g.generic-component:not(.gnd-component):not(.vdd-component):not(.passive-component)", "Generic Block"),
            ("add-gnd-btn", "g.gnd-component", "Ground Node (GND)"),
            ("add-vdd-btn", "g.vdd-component", "Power Rail Node (VDD)"),
            ("add-resistor-btn", "g.passive-component[data-type='resistor']", "Resistor Primitive"),
            ("add-capacitor-btn", "g.passive-component[data-type='capacitor']", "Capacitor Primitive"),
            ("add-inductor-btn", "g.passive-component[data-type='inductor']", "Inductor Primitive")
        ]
        
        for btn_id, selector, label in components:
            print(f"Deploying node artifact: {label} via #{btn_id}")
            page.locator(f"#{btn_id}").click()
            expect(page.locator(selector).first).to_be_visible()
        
        # Verify component-layer collection population count matches expectations
        total_comps = page.locator("#components-layer > g.generic-component").count()
        print(f"Total verified rendering nodes on canvas layer: {total_comps}")
        assert total_comps == 6, f"Expected 6 blocks, detected {total_comps}"
        
        # ---------------------------------------------------------------------
        # MODULE 3: Inspector Panel Mutations & Attribute Transformations
        # ---------------------------------------------------------------------
        log_section("3. Inspector Panel Form Properties & Attribute Scales")
        
        print("Wiping temporary artifacts to isolate target Generic Block mutations...")
        page.evaluate("document.getElementById('components-layer').innerHTML = ''")
        page.locator("#add-component-btn").click()
        
        target_selector = "g.generic-component"
        page.locator(target_selector).click()
        
        # Mutate labels inside inspector sidecar
        print("Applying character updates to tracking string headers...")
        top_input = page.locator('input[placeholder="e.g. U1"]')
        bottom_input = page.locator('input[placeholder="e.g. 74HC00"]')
        
        top_input.fill("U1_REG")
        bottom_input.fill("LM7805")
        
        expect(page.locator(target_selector)).to_have_attribute("data-label-top", "U1_REG")
        expect(page.locator(target_selector)).to_have_attribute("data-label-bottom", "LM7805")
        
        # Test row count modifications
        print("Testing row structure increments/decrements...")
        expect(page.locator(target_selector)).to_have_attribute("data-rows", "2")
        page.locator('button:has-text("+ Row")').click()
        expect(page.locator(target_selector)).to_have_attribute("data-rows", "3")
        
        # Validate side grid fields match structural modification counts
        expect(page.locator('.pin-grid input[data-side="L"]')).to_have_count(3)
        page.locator('.pin-grid input[data-side="L"]').nth(2).fill("V_OUT")
        expect(page.locator("text=V_OUT")).to_be_visible()
        
        # Test dimension scale modifications
        print("Testing horizontal dimension tracking modifiers...")
        expect(page.locator(target_selector)).to_have_attribute("data-width", "100")
        page.locator('button:has-text("Expand (+50)")').click()
        expect(page.locator(target_selector)).to_have_attribute("data-width", "150")
        
        # Test passive component properties inspector mutations
        print("Testing passive components rotation selectors...")
        page.locator("#add-resistor-btn").click()
        page.locator("g.passive-component").click()
        
        rot_select = page.locator("select")
        rot_select.select_option("90")
        expect(page.locator("g.passive-component")).to_have_attribute("data-rotate", "90")
        
        # ---------------------------------------------------------------------
        # MODULE 4: Network Routing & 3-Pass Topology Validations
        # ---------------------------------------------------------------------
        log_section("4. Network Routing & 3-Pass Graph Topology Pipeline")
        
        print("Re-initializing blank map workspace for interconnect routing configurations...")
        page.evaluate("""() => {
            document.getElementById('components-layer').innerHTML = '';
            document.getElementById('nets-layer').innerHTML = '';
            document.getElementById('junctions-layer').innerHTML = '';
        }""")
        
        # Set explicitly positioned anchors via JS directly to bypass layout variance
        page.evaluate("""() => {
            window.EE_COMP_A = window.geomMod.createComponent(100, 100, 100, 2);
            window.EE_COMP_B = window.geomMod.createComponent(400, 100, 100, 2);
        }""")
        
        page.keyboard.press("c")  # Enter connect mode
        
        print("Drawing baseline segments...")
        # Segment 1: Horizontal route from (200, 100) to (400, 100)
        c1_start = get_client_coords(page, 200, 100)
        c1_end = get_client_coords(page, 400, 100)
        page.mouse.click(c1_start[0], c1_start[1])
        page.mouse.click(c1_end[0], c1_end[1])
        
        # Segment 2: Intersecting vertical T-route splitting from (300, 100) to (300, 200)
        c2_start = get_client_coords(page, 300, 100)
        c2_end = get_client_coords(page, 300, 200)
        page.mouse.click(c2_start[0], c2_start[1])
        page.mouse.click(c2_end[0], c2_end[1])
        
        # Assert net tracking elements exist inside the container layer
        net_lines = page.locator("#nets-layer line.net-line")
        print(f"Discovered line path fragments following split execution: {net_lines.count()}")
        
        # Pass 1 & 2 Execution Verification: Splitting and Merging
        # Original segment (200,100 -> 400,100) must split into two pieces at intersection node (300,100)
        expect(net_lines).to_have_count(3)
        
        # Pass 3 Execution Verification: Automatic T-Junction Indicators
        print("Checking for automated structural node junction dot compilation...")
        junctions = page.locator("#junctions-layer circle.junction")
        expect(junctions).to_have_count(1)
        expect(junctions).to_have_attribute("data-coord", "300,100")
        print("Graph junction pipeline compiled successfully without alignment drops.")
        
        # ---------------------------------------------------------------------
        # MODULE 5: Element Repositioning & Pointer Bounds Constraints
        # ---------------------------------------------------------------------
        log_section("5. Element Translation & Constraint Clamping")
        
        page.keyboard.press("d")  # Switch to Drag mode
        
        print("Testing bounded object translation mapping...")
        origin_init = get_element_origin(page, "g.generic-component")
        
        # Target internal coordinate within the first block boundary to drag it
        drag_source = get_client_coords(page, origin_init[0] + 30, origin_init[1] + 10)
        drag_dest = get_client_coords(page, origin_init[0] + 130, origin_init[1] + 60) # Shift +100X, +50Y
        
        page.mouse.move(drag_source[0], drag_source[1])
        page.mouse.down()
        page.mouse.move(drag_dest[0], drag_dest[1], steps=10)
        page.mouse.up()
        
        origin_final = get_element_origin(page, "g.generic-component")
        print(f"Component reposition vector output coordinates: {origin_init} -> {origin_final}")
        assert origin_final[0] == origin_init[0] + 100, "Horizontal movement failed grid adjustment limits"
        assert origin_final[1] == origin_init[1] + 50, "Vertical movement failed grid adjustment limits"
        
        # ---------------------------------------------------------------------
        # MODULE 6: Data Serialization Portal (Export/Import Roundtrip)
        # ---------------------------------------------------------------------
        log_section("6. Vector Schema Serialization & Portal Assembly")
        
        portal_textarea = page.locator("#data-portal")
        export_button = page.locator("#export-btn")
        import_button = page.locator("#import-btn")
        
        print("Triggering graph model schema export...")
        export_button.click()
        schema_text = portal_textarea.input_value()
        
        # Ensure schema structure output valid text definitions
        assert "<svg" in schema_text and "</svg>" in schema_text, "Failed valid markup declaration checks"
        print(f"Successfully serialized tracking footprint output buffer ({len(schema_text)} bytes)")
        
        print("Executing context drop and clearing workspace layout...")
        page.evaluate("""() => {
            ['nets-layer', 'components-layer', 'junctions-layer'].forEach(id => {
                document.getElementById(id).innerHTML = '';
            });
        }""")
        expect(page.locator("#components-layer g.generic-component")).to_have_count(0)
        
        print("Restoring topology map from data portal clipboard block...")
        portal_textarea.fill(schema_text)
        import_button.click()
        
        # Confirm diagram layout recovery matches original state
        expect(page.locator("#components-layer g.generic-component")).to_have_count(2)
        expect(page.locator("#nets-layer line.net-line")).to_have_count(3)
        expect(page.locator("#junctions-layer circle.junction")).to_have_count(1)
        print("Re-import processing completed. Vector map state matches original footprint.")
        
        # ---------------------------------------------------------------------
        # MODULE 7: Deletion Vectors
        # ---------------------------------------------------------------------
        log_section("7. Deletion Vector Dispatches")
        
        page.keyboard.press("s")  # Enter select mode
        
        print("Testing keyboard hotkey deletion logic on wire segments...")
        page.locator("#nets-layer line.net-line").first.click()
        page.keyboard.press("Delete")
        expect(page.locator("#nets-layer line.net-line")).to_have_count(2)
        
        print("Testing inspector structural button deletion logic on components...")
        page.locator("g.generic-component").first.click()
        page.locator('button:has-text("Delete Component")').click()
        expect(page.locator("g.generic-component")).to_have_count(1)
        
        print("\n" + "=" * 60)
        print("  ALL REGRESSION MODULE PASS CODES VERIFIED [SUCCESS]")
        print("=" * 60)

if __name__ == "__main__":
    run_regression_suite()
