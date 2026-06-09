# Agent Context: Net Routing & Topology Subsystem

This isolated directory handles line routing constraints, bounding collisions, connectivity graphs, and connection point tracking.

## 1. Codebase Sub-Module Roles


```

js/nets/
├── net-crud.js        <- Creation & structural deletion vectors
├── net-factory.js     <- Pure element generation (Factory)
├── net-interaction.js <- Line modification & drag alignment logic
├── net-topology.js    <- 3-Pass evaluation engine
└── net-validation.js  <- Dynamic intersection checks

```

### `net-factory.js`
* Contains pure factory configurations. Generates layout vectors and touch components (`.endpoint-hit`) with absolute safety profiles.

### `net-crud.js`
* Oversees the creation and safe teardown of canvas paths. Ensures target lines snap precisely to grid spaces before running verification logic.

### `net-validation.js`
* Ensures design path rules are maintained.
* **Rule 1 (No Overlaps):** Prevents overlapping lines from matching axis space spans.
* **Rule 2 (No Box Collisions):** Prevents wire vectors from cutting through active component boundary layout areas. `GND` and `VDD` components are excluded from this rule.

### `net-interaction.js`
* Ensures coordinate translations and structural properties are updated correctly.
* **Orthogonal Dragging Logic:** Modifying layout locations updates adjacent paths to preserve wire squaring. Moving a horizontal point scales its Y value across matching endpoints, while moving vertical segments adjusts shared X bounds.

### `net-topology.js`
* Processes entire graph layouts over a three-stage tracking cycle to resolve structural modifications clean of local change trackers.

## 2. The 3-Pass Topology Pipeline Details
When `refreshNetTopology()` executes, it runs the following operations sequentially across the active DOM:


```

[Pass 1: splitAllLines()] ──► [Pass 2: mergeLines()] ──► [Pass 3: recomputeJunctions()]

```

### Pass 1: Line Splitting (`splitAllLines`)
Scans all elements to look for intersections where wire terminals cross separate layout paths. When found, paths break out into two distinct elements linked at that coordinate space. This repeats iteratively until paths are parsed cleanly.

### Pass 2: Segment Merging (`mergeLines`)
Scans pairs of paths along matching directions to group overlapping lines. Overlapping lines expand to encompass the total combined layout run. Shared single connection points merge if they form a simple, linear run without T-junction structures.

### Pass 3: Connection Points (`recomputeJunctions`)
Counts the total number of line endpoints meeting at each grid point. Points with exactly **3 or 4 endpoints** automatically receive a terminal indicator dot (`<circle r="4" class="junction">`). Points with 2 or fewer endpoints have their terminal circles removed automatically.

