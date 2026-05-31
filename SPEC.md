# SVG Sketcher Specification

## Concept

Make a single-page Web App that can create electrical block diagrams.

## Generic Block

The general block is the most basic, yet flexibie component.  

It is a rectangular block with "pins" on the left and right sides. All of the pins will be aligned to a 25 unit grid.


The top left pin will be the (0,0) origin of the part. 

The rectangular body will extend slightly above first pin and slightly below the last pin

The pins themselves will not have any visual tick or markers.  The pin label will be the only thing that indicates whre teh pins are.  Left side pins will anchor text at the start of the text. Right side pins will anchor text at the end of the text. Both will use a middle dominant baseline

The width of the component rect is not fixed. It can be grown arbitrarily dependng on the length of the pin labels

1. Body: <rect> with class="generic-component"
2. Width must be divisible by 25 units (grid alignment).
3. Pin labels vertically separated by 25 units.
4. Left-side labels: text-anchor="start", x=5
5. Right-side labels: text-anchor="end", x=width-5
6. Use dominant-baseline="middle" so label aligns with pin position

```svg

  <g transform="translate(300,50)" class="generic-component">
    <!-- Width can exceed 100 units if labels are long. Keep divisible by 25. -->
    <rect y="-25" height="75" width="100"/>
    <!-- Left-side pin labels -->
    <text x="5" y="0" text-anchor="start" dominant-baseline="middle">VIN</text>
    <text x="5" y="25" text-anchor="start" dominant-baseline="middle">EN</text>
    <!-- Right-side pin labels -->
    <text x="95" y="0" text-anchor="end" dominant-baseline="middle">SW</text>
    <text x="95" y="25" text-anchor="end" dominant-baseline="middle">FB</text>
  </g>
```

### New Block Creation and Editing

When a new block is created or edited, a pop up form will appear.  It will have 2 columns of text boxes where the pin labels can be added.  

The number of rows will depend on how tall the component is.  There will be a +/- button in the pop up for expanding or deleting rows.


## Net Connections

All net connections will be represented with "line" elements in SVGs

All lines can only be horizontal or vertical

When drawing a new connection, you can enter a connection mode where each mouse click starts and stops a line connection.

If a line end point touches an existing line, a junction symbol will be added indicating the nets are connected. It should also break up the existing line into 2 line items when the junction is added.

## Dragging 

This is probably the more difficult part
