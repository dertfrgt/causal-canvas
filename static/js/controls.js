import { state } from './state.js';
import { draw } from './draw.js';
import { createNodeAt } from './constructor.js';

export function initConstructorControls() {
    // Переключение режимов
    document.getElementById('modeToggle').addEventListener('click', () => {
        state.isSimulation = !state.isSimulation;
        document.getElementById('modeToggle').textContent = state.isSimulation ? '🔁 Режим: Симуляция' : '🔁 Режим: Конструктор';
        document.getElementById('status').textContent = state.isSimulation ? '⚡ Режим: симуляция' : '🛠️ Режим: конструктор';
        document.getElementById('addNodeBtn').style.display = state.isSimulation ? 'none' : 'inline-block';
        document.getElementById('addEdgeBtn').style.display = state.isSimulation ? 'none' : 'inline-block';
        state.edgeSourceNode = null;
        if (!state.isSimulation) {
            state.ghostData = {};
            state.flashes = {};
            state.changedNodes = {};
            state.deltas = {};
            state.clickedNodeId = null;
            state.highlightAncestors = [];
            state.highlightDescendants = [];
        }
        draw();
    });

    // Кнопка "Добавить связь"
    document.getElementById('addEdgeBtn').addEventListener('click', () => {
        state.edgeSourceNode = null;
        alert('Кликните на узел-источник, затем на узел-цель. Клик по тому же узлу или по пустому месту отменяет выбор.');
        draw();
    });

    // Кнопка "Добавить узел"
    document.getElementById('addNodeBtn').addEventListener('click', () => {
        if (!state.isSimulation) {
            createNodeAt(0, 0);
        }
    });

    // Кнопка "Сбросить значения"
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('Сбросить все значения на 0?')) {
            location.reload();
        }
    });

    // Кнопка "Принять изменения"
    document.getElementById('acceptBtn').addEventListener('click', () => {
        if (!state.isSimulation) {
            alert('Принятие изменений доступно только в режиме симуляции.');
            return;
        }
        state.ghostData = {};
        state.flashes = {};
        state.deltas = {};
        state.changedNodes = {};
        state.clickedNodeId = null;
        state.highlightAncestors = [];
        state.highlightDescendants = [];
        draw();
        alert('✅ Изменения приняты. Призраки, вспышки, дельты и градиенты убраны.');
    });
}