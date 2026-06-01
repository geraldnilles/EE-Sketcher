# SVG Sketcher Specification

## Concept

Make a single-page Web App that can create electrical block diagrams.

## Generic Block

The general block is the most basic, yet flexibie component.  

It is a rectangular block with "pins" on the left and right sides. All of the pins will be aligned to a 25 unit grid.

The top left pin will be the (0,0) origin of the component `<g>` group. 

The rectangular body will extend 25 units above first pin and 25 units below the last pin.

The pins themselves will not have any visual tick or markers.  The pin label will be the only thing that indicates whre the pins are located.  Left side pins will anchor text at the start of the text. Right side pins will anchor text at the end of the text. Both will use a middle dominant baseline so the center of the text aligns with the pin connection point.

The width of the component rect is not fixed. It can be grown arbitrarily in order to fit longer pin labels.

1. Body: <rect> with class="generic-component"
2. Width must be divisible by 25 units (grid alignment).
3. Pin labels vertically separated by 25 units.
4. Left-side labels: text-anchor="start", x=5
5. Right-side labels: text-anchor="end", x=width-5
6. Use dominant-baseline="middle" so label aligns with pin position

```svg

  <g transform="translate(25,25)" class="generic-component">
    <!-- Width can exceed 100 units if labels are long. Keep divisible by 25. -->
    <rect y="-25" height="50" width="100"/>
    <!-- Left-side pin labels -->
    <text x="5" y="0" text-anchor="start" dominant-baseline="middle">VIN</text>
    <text x="5" y="25" text-anchor="start" dominant-baseline="middle">EN</text>
    <!-- Right-side pin labels -->
    <text x="95" y="0" text-anchor="end" dominant-baseline="middle">SW</text>
    <text x="95" y="25" text-anchor="end" dominant-baseline="middle">FB</text>
  </g>
```

### Creation and Editing

A button on the side bar will be used to create a new block.  It will place a 2 pin block with placeholder values ("IN" and "OUT")

When a block is clicked, an edit form will appear on the side bar.  It will have 2 columns of text boxes where the pin labels can be added.  

The number of rows will depend on how tall the component is.  There will be a + and - buttons in the side bar for expanding or deleting rows.  Each click will increase/decrease the height of the block, adding or subtracting a row of pin labels.

There will also be two buttons for increasing and decreasing the width of the block.  Each click will expand/contract the width by 50 units so that the pin connection points can remain on the grid.

## Net Connections

All net connections will be represented with "line" elements in SVGs

All lines must be horizontal or vertical

There will be a button on the side bar that lets you switch to "Connection" mode.

When drawing a new connection, you can enter a connection mode where each mouse click starts and stops a line connection.

If a line end point touches an existing line, a junction symbol (a 4 unit circle) will be added indicating the nets are connected. It should also break up the existing line into 2 line segments when the junction is added.

All line end points must snap to the 25 unit grid

## Dragging 

There will be a button on the side bar that lets you switch to "Drag" mode.

Components can be moved by first selecting a component and then dragging it with the mouse. 

Connection lines can also be moved in the same way.  You must select the line first, and then drag and drop one of the point.  Remember that all nets must be horizontal or vertical.  So if you attempt to drag a horizontal line end-point down one grid slot, it will move the other end point down as well. 

All dragging movements must snap to the 25 unit grid.


