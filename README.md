# EE-Sketcher — Electrical Block Diagram Editor

**EE-Sketcher** is a lightweight, single-page web application for creating clean, grid-aligned electrical block diagrams (simplified schematics). It runs entirely in your browser — no installation, no server, no sign-up required.


<p align="center">
  <a href="https://geraldnilles.github.io/EE-Sketcher/">
    <img src="https://img.shields.io/badge/🚀_Launch_EE--Sketcher_Now-Click_Here-2563eb?style=for-the-badge&logo=github" alt="Launch EE-Sketcher Now" height="60">
  </a>
</p>

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

---

## Quick Start

1. **Download or clone** the project files to your computer.
2. **Open `index.html`** in any modern web browser (Chrome, Firefox, Edge, Safari).
3. Start sketching.

That's it. There is no build step, no package manager, and no backend.

---

## What You Can Build

EE-Sketcher is designed for **block-level electrical diagrams** — the kind of drawings you'd sketch on a whiteboard to reason about power distribution, signal flow, or system architecture. Think of it as a specialized vector editor for:

- Power distribution block diagrams
- Signal chain overviews
- System interconnect diagrams
- Simplified one-line schematics

Components are rectangular **Generic Blocks** with labeled pins on the left and right sides. **Nets** (wires) connect pins using orthogonal (horizontal/vertical) line segments.

---

## The Interface

### Toolbar

At the top of the screen, the toolbar lets you switch between three operating modes and add components:

| Button | Shortcut | Purpose |
|---|---|---|
| **Select / Edit** | `S` | Click elements to select them. Edit properties in the sidebar. |
| **Drag** | `D` | Click and drag components or net endpoints to reposition them. |
| **Connect** | `C` | Draw point-to-point wires between pins. |
| **+ Component** | `A` | Add a new Generic Block to the canvas. |

### Canvas

The main drawing area shows a grid. Everything snaps to the grid automatically, keeping your diagram clean and aligned. You can **pan** and **zoom** freely (see below).

### Sidebar — Inspector

When you select an element in **Select/Edit** mode, the sidebar shows its properties:

- **Component selected:** Edit the top label, bottom label, and individual pin labels. Add or remove pin rows, expand or contract the component width. A **Delete** button removes the component.
- **Net selected:** View the line's endpoint coordinates, length, and orientation. A **Delete** button removes the net.

### Sidebar — Data Portal

The **Data Portal** at the bottom of the sidebar is how you save and load your work:

- **Export Schema** — Serializes your diagram to SVG code in the text area. Copy and paste this into a file to save your work.
- **Import Schema** — Paste previously exported SVG code and click this button to restore your diagram.

> **Tip:** Save frequently! There is no auto-save. Use the Export button and save the output to a `.svg` file.

---

## How To Use EE-Sketcher

### Adding Components

1. Press **`A`** or click the **+ Component** button.
2. A new Generic Block appears in the center of your current view.
3. It is automatically selected, so you can immediately edit its labels in the sidebar.

### Editing Components

1. Press **`S`** to enter Select/Edit mode.
2. Click a component on the canvas. It highlights with a blue outline.
3. In the sidebar, you can:
   - Change the **Top Label** (e.g., `U1`, `Main PSU`)
   - Change the **Bottom Label** (e.g., `LM2596`, `24V → 5V`)
   - Edit individual **pin labels** (e.g., `VIN`, `GND`, `+5V`, `EN`)
   - Click **+ Row** / **- Row** to add or remove pin rows
   - Click **Expand (+50)** / **Contract (-50)** to change the component width
4. Click the **Delete Component** button (or press `X`, `Backspace`, or `Delete`) to remove it.

### Drawing Nets (Wires)

1. Press **`C`** to enter Connect mode (cursor changes to a crosshair).
2. **Click once** on a grid point where you want the wire to start.
   - A dashed preview line follows your mouse, constrained to horizontal or vertical.
3. **Click a second time** where you want the wire to end.
   - The wire is created instantly.
4. Wires are automatically validated:
   - If the proposed wire would overlap an existing wire or pass through a component, the preview turns **red** and the second click is cancelled.

> **Important:** Wires do not "stick" to component pins automatically. Align wire endpoints with pin positions manually by snapping to the grid. Junction dots (small filled circles) appear automatically wherever 3 or more wire endpoints meet.

### Moving Things

1. Press **`D`** to enter Drag mode.
2. **Drag a component** to reposition it. It snaps to the grid and can't leave the drawing area.
3. **Drag a wire endpoint** (small invisible hit target at each end) to reposition it. Wire endpoints stay on their original axis — dragging a horizontal wire's endpoint moves it vertically, and vice versa.

### Selecting and Deleting

- In **Select/Edit** mode (`S`), click any component or wire to select it.
- Wires have "near-miss" detection — clicking within 10 pixels of a wire still selects it.
- Press **`X`**, **`Backspace`**, or **`Delete`** to delete the selected element.
- Press **`Escape`** to clear your selection (or cancel an in-progress action).

### Panning and Zooming

| Action | How |
|---|---|
| **Pan (any direction)** | Scroll wheel (plain) |
| **Pan horizontally only** | `Shift` + Scroll wheel |
| **Zoom in / out** | `Ctrl` + Scroll wheel (or `Cmd` + Scroll wheel on Mac), or trackpad pinch-to-zoom |

- Zoom range: 0.1× (far out) to 8× (close in).
- Panning is clamped — you can't scroll beyond the drawing area.
- The view adjusts automatically when you resize the browser window.

### Saving and Loading Diagrams

**To save your work:**
1. Click the **Export Schema** button in the Data Portal.
2. The text area fills with SVG code representing your diagram.
3. Select all the text (`Ctrl+A` / `Cmd+A`), copy it, and paste it into a text file.
4. Save the file with an `.svg` extension. You can also open this file directly in a browser to view the diagram (without the editor).

**To load saved work:**
1. Open your saved `.svg` file in a text editor and copy its contents.
2. Paste the SVG code into the Data Portal text area.
3. Click **Import Schema**.
4. Your diagram is restored, including all components, wires, labels, and junction dots.

---

## Keyboard Shortcuts Reference

| Key | Action |
|---|---|
| `S` | Switch to **Select/Edit** mode |
| `D` | Switch to **Drag** mode |
| `C` | Switch to **Connect** mode |
| `A` | Add a new **Component** |
| `X`, `Backspace`, `Delete` | Delete selected element |
| `Escape` | Cancel action or clear selection |

> Keyboard shortcuts are disabled while you're typing in a text field (sidebar inputs, Data Portal text area).

---

## Example Workflow: Your First Diagram

Here's how to create a simple diagram in under a minute:

1. Open `index.html` in your browser.
2. Press **`A`** to add a component. In the sidebar, set:
   - **Top Label:** `Source`
   - **Pin 0 (left):** `VOUT`
   - **Pin 0 (right):** (leave blank)
3. Press **`A`** again for a second component. Click and drag it to the right. Set:
   - **Top Label:** `Load`
   - **Pin 0 (left):** `VIN`
4. Press **`C`** for Connect mode. Click on the grid point aligned with `Source`'s right-side `VOUT` pin, then click on the grid point aligned with `Load`'s left-side `VIN` pin.
5. Press **`S`** to return to Select mode. Click each component to fine-tune labels.
6. Click **Export Schema**, copy the SVG, and save it.

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for the full text.

---

## TODOs

- Duplicate Componet

