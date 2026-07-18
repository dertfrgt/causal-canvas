// state.js
export const state = {
    nodes: [],
    edges: [],
    dragNode: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    ghostData: {},
    flashes: {},
    animations: [],
    animationId: null,
    isSimulation: true,
    edgeSourceNode: null,
    editingNodeId: null,
    hoveredEdgeId: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panOffsetX: 0,
    panOffsetY: 0,
    tooltipNode: null,
    deltas: {},
    deltaTimeout: null,
    changedNodes: {},
    highlightAncestors: [],
    highlightDescendants: [],
    clickedNodeId: null,
    spacePressed: false,
};

// Также экспортируем функции для обновления состояния (опционально)
export function updateState(newState) {
    Object.assign(state, newState);
}