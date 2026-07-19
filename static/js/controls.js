import { state } from './state.js';
import { draw } from './draw.js';
import { createNodeAt } from './constructor.js';

export function initConstructorControls() {
    // ----- Переключение режимов (Симуляция/Конструктор) -----
    document.getElementById('modeToggle').addEventListener('click', () => {
        state.isSimulation = !state.isSimulation;
        document.getElementById('modeToggle').textContent = state.isSimulation ? '🔁 Режим: Симуляция' : '🔁 Режим: Конструктор';
        document.getElementById('status').textContent = state.isSimulation ? '⚡ Режим: симуляция' : '🛠️ Режим: конструктор';
        document.getElementById('addNodeBtn').style.display = state.isSimulation ? 'none' : 'inline-block';
        document.getElementById('addEdgeBtn').style.display = state.isSimulation ? 'none' : 'inline-block';
        // При переключении выключаем режим выделения
        state.selectionMode = false;
        document.getElementById('selectionToggle').textContent = '🔲 Режим выделения';
        state.selectedNodes = [];
        state.selectionRect = null;
        state.isSelecting = false;
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

    // ----- Кнопка добавления связи -----
    document.getElementById('addEdgeBtn').addEventListener('click', () => {
        state.edgeSourceNode = null;
        alert('Кликните на узел-источник, затем на узел-цель. Клик по тому же узлу или по пустому месту отменяет выбор.');
        draw();
    });

    // ----- Кнопка добавления узла -----
    document.getElementById('addNodeBtn').addEventListener('click', () => {
        if (!state.isSimulation) {
            createNodeAt(0, 0);
        }
    });

    // ----- Кнопка сброса -----
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('Сбросить все значения на 0?')) {
            location.reload();
        }
    });

    // ----- Кнопка принятия изменений -----
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

    // ----- НОВОЕ: Переключение режима выделения -----
    const selectionToggle = document.getElementById('selectionToggle');
    if (selectionToggle) {
        selectionToggle.addEventListener('click', () => {
            // Включаем/выключаем только в режиме конструктора
            if (state.isSimulation) {
                alert('Режим выделения доступен только в режиме конструктора.');
                return;
            }
            state.selectionMode = !state.selectionMode;
            selectionToggle.textContent = state.selectionMode ? '🔲 Режим выделения (вкл)' : '🔲 Режим выделения';
            // Сбрасываем выделение при выключении
            if (!state.selectionMode) {
                state.selectedNodes = [];
                state.selectionRect = null;
                state.isSelecting = false;
            }
            draw();
        });
    }

    // ----- Обработка клавиши Delete для удаления выделенных узлов -----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Del') {
            // Удаляем только если есть выделенные узлы и режим выделения включён
            if (state.selectionMode && state.selectedNodes.length > 0) {
                deleteSelectedNodes();
            }
        }
    });
}

// ---------- Функция удаления выделенных узлов ----------
async function deleteSelectedNodes() {
    const nodeIds = state.selectedNodes;
    if (nodeIds.length === 0) return;
    if (!confirm(`Удалить ${nodeIds.length} выделенных узлов и все связанные с ними рёбра?`)) return;

    try {
        // Удаляем последовательно
        for (let id of nodeIds) {
            const resp = await fetch(`/api/node/${id}/delete/`, { method: 'DELETE' });
            if (!resp.ok) {
                console.warn('Не удалось удалить узел', id);
            }
        }
        // Обновляем локальное состояние
        state.nodes = state.nodes.filter(n => !nodeIds.includes(n.id));
        state.edges = state.edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));
        state.selectedNodes = [];
        state.selectionRect = null;
        state.isSelecting = false;
        draw();
        alert('Выделенные узлы удалены.');
    } catch (err) {
        alert('Ошибка при удалении: ' + err);
    }
}