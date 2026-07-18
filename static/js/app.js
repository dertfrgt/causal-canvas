import { state } from './state.js';
import { loadGraph } from './api.js';
import { draw } from './draw.js';
import { initInteractions } from './interactions.js';
import { initScenarioControls } from './scenarios.js';
import { initConstructorControls } from './controls.js';
import { initCsvControls } from './csv.js';
import { initModals } from './modals.js';  // <-- НОВОЕ

async function initApp() {
    const savedScale = localStorage.getItem('causal_scale');
    const savedOffsetX = localStorage.getItem('causal_offsetX');
    const savedOffsetY = localStorage.getItem('causal_offsetY');
    if (savedScale) state.scale = parseFloat(savedScale);
    if (savedOffsetX) state.offsetX = parseFloat(savedOffsetX);
    if (savedOffsetY) state.offsetY = parseFloat(savedOffsetY);

    await loadGraph();
    initInteractions();
    initScenarioControls();
    initConstructorControls();
    initCsvControls();
    initModals();  // <-- НОВОЕ
    draw();
}

document.addEventListener('DOMContentLoaded', initApp);