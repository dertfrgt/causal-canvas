import { state } from './state.js';
import { loadGraph } from './api.js';
import { draw } from './draw.js';
import { initInteractions } from './interactions.js';
import { initScenarioControls } from './scenarios.js';
import { initConstructorControls, centerGraph } from './controls.js';
import { initCsvControls } from './csv.js';
import { initModals } from './modals.js';

/**
 * Обновляет интерфейс в зависимости от статуса авторизации пользователя
 */
function updateUIForAuth() {
    const isAuth = window.userIsAuthenticated;
    const controls = document.getElementById('controls');
    const scenarioBlock = document.getElementById('scenario-block');

    if (!isAuth) {
        // Скрываем все элементы управления для анонимных пользователей
        if (controls) controls.style.display = 'none';
        if (scenarioBlock) scenarioBlock.style.display = 'none';
        // Также можно скрыть кнопку центрирования и другие элементы
        const centerBtn = document.getElementById('centerGraphBtn');
        if (centerBtn) centerBtn.style.display = 'none';
    } else {
        // Показываем все элементы для авторизованных
        if (controls) controls.style.display = 'flex';
        if (scenarioBlock) scenarioBlock.style.display = 'flex';
        const centerBtn = document.getElementById('centerGraphBtn');
        if (centerBtn) centerBtn.style.display = 'inline-block';
    }
}

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

    // Если есть узлы — центрируем граф
    if (state.nodes.length > 0) {
        centerGraph();
    }

    // Обновляем UI в зависимости от авторизации
    updateUIForAuth();

    // Инициализация контроллеров
    initInteractions();      // обработчики мыши (внутри проверяют isAuth)
    initScenarioControls();  // сценарии
    initConstructorControls(); // режимы, кнопки
    initCsvControls();       // загрузка CSV
    initModals();            // модальные окна

    draw();

    // ---------- Аутентификация: выпадающее меню ----------
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

    // ---------- Сценарии: выпадающее меню ----------
    const scenarioToggle = document.getElementById('scenarioToggle');
    const scenarioMenu = document.getElementById('scenarioMenu');
    if (scenarioToggle && scenarioMenu) {
        scenarioToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            scenarioMenu.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!scenarioMenu.contains(e.target) && e.target !== scenarioToggle) {
                scenarioMenu.classList.remove('show');
            }
        });
        scenarioMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                scenarioMenu.classList.remove('show');
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', initApp);