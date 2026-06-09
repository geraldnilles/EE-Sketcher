/* =====================================================================
   nets.js
   Barrel module — re-exports the entire nets subsystem.
   ===================================================================== */

export { createLine, deleteLine }            from './nets/net-crud.js';
export { validateNewLine }                   from './nets/net-validation.js';
export { refreshNetTopology, mergeLines, recomputeJunctions, splitAllLines } from './nets/net-topology.js';
export { readLineCoords, setEndpoint, shiftLineForEndpointDrag, findLineNearPoint } from './nets/net-interaction.js';
export { newLineEl, newEndpointHit }         from './nets/net-factory.js';
