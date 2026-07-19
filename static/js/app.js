import { state } from './state.js';
import { loadGraph } from './api.js';
import { draw } from './draw.js';
import { initInteractions } from './interactions.js';
import { initScenarioControls } from './scenarios.js';
import { initConstructorControls, centerGraph } from './controls.js';
import { initCsvControls } from './csv.js';
import { initModals } from './modals.js';

async function initApp() {
    // Восстанавливаем масштаб и смещение из localStorage
    const savedScale = localStorage.getItem('causal_scale');
    const savedOffsetX = localStorage.getItem('causal_offsetX');
    const savedOffsetY = localStorage.getItem('causal_offsetY');
    if (savedScale) state.scale = parseFloat(savedScale);
    if (savedOffsetX) state.offsetX = parseFloat(savedOffsetX);
    if (savedOffsetY) state.offsetY = parseFloat(savedOffsetY);

    // Загружаем граф
    await loadGraph();

    // Если есть узлы — центрируем граф (авто-центрирование)
    if (state.nodes.length > 0) {
        centerGraph();
    }

    // Инициализация всех контроллеров
    initInteractions();
    initScenarioControls();
    initConstructorControls();
    initCsvControls();
    initModals();

    draw();

    // ----- Аутентификация: выпадающее меню -----
    const toggle = document.getElementById('userMenuToggle');
    const dropdown = document.getElementById('userDropdown');
    if (toggle && dropdown) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== toggle) {
                dropdown.classList.remove('show');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initApp);