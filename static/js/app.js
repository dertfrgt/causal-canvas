import { state } from './state.js';
import { loadGraph } from './api.js';
import { draw } from './draw.js';
import { initInteractions } from './interactions.js';
import { initScenarioControls } from './scenarios.js';
import { initConstructorControls, centerGraph } from './controls.js';  // добавлен centerGraph
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
        // Центрирование сработает, только если не было сохранённого масштаба (пользователь не панорамировал)
        // Можно добавить флаг, чтобы не перезаписывать пользовательский вид.
        // Для простоты: центрируем всегда при загрузке, если узлы есть.
        centerGraph();
    }

    // Инициализация всех контроллеров
    initInteractions();
    initScenarioControls();
    initConstructorControls();
    initCsvControls();
    initModals();

    draw();
}

document.addEventListener('DOMContentLoaded', initApp);