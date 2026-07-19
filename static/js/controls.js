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
        state.selectionMode = false;
        const selToggle = document.getElementById('selectionToggle');
        if (selToggle) selToggle.textContent = '🔲 Режим выделения';
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

    // ----- Режим выделения -----
    const selectionToggle = document.getElementById('selectionToggle');
    if (selectionToggle) {
        selectionToggle.addEventListener('click', () => {
            if (state.isSimulation) {
                alert('Режим выделения доступен только в режиме конструктора.');
                return;
            }
            state.selectionMode = !state.selectionMode;
            selectionToggle.textContent = state.selectionMode ? '🔲 Режим выделения (вкл)' : '🔲 Режим выделения';
            if (!state.selectionMode) {
                state.selectedNodes = [];
                state.selectionRect = null;
                state.isSelecting = false;
            }
            draw();
        });
    }

    // ----- Кнопка центрирования графа -----
    document.getElementById('centerBtn').addEventListener('click', () => {
        centerGraph();
    });

    // ----- Обработка Delete для удаления выделенных узлов -----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Del') {
            if (state.selectionMode && state.selectedNodes.length > 0) {
                deleteSelectedNodes();
            }
        }
    });
}

// ---------- Функция центрирования графа ----------
export function centerGraph() {
    if (state.nodes.length === 0) {
        // Если нет узлов, просто сбрасываем вид
        state.offsetX = 0;
        state.offsetY = 0;
        state.scale = 1;
        localStorage.setItem('causal_scale', state.scale);
        localStorage.setItem('causal_offsetX', state.offsetX);
        localStorage.setItem('causal_offsetY', state.offsetY);
        draw();
        return;
    }

    // Вычисляем центр всех узлов
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let node of state.nodes) {
        if (node.x < minX) minX = node.x;
        if (node.x > maxX) maxX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.y > maxY) maxY = node.y;
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const padding = 100; // отступы в пикселях экрана

    // Вычисляем масштаб так, чтобы граф поместился с отступами
    const canvas = document.getElementById('canvas');
    const canvasWidth = canvas.width - padding * 2;
    const canvasHeight = canvas.height - padding * 2;
    const scaleX = canvasWidth / (width + padding);
    const scaleY = canvasHeight / (height + padding);
    let newScale = Math.min(scaleX, scaleY, 5); // ограничиваем максимальный масштаб 5
    newScale = Math.max(newScale, 0.2); // минимальный масштаб 0.2

    // Смещение так, чтобы центр графа был в центре холста
    const screenCenterX = canvas.width / 2;
    const screenCenterY = canvas.height / 2;
    state.offsetX = screenCenterX - centerX * newScale;
    state.offsetY = screenCenterY - centerY * newScale;
    state.scale = newScale;

    localStorage.setItem('causal_scale', state.scale);
    localStorage.setItem('causal_offsetX', state.offsetX);
    localStorage.setItem('causal_offsetY', state.offsetY);
    draw();
}

// ---------- Функция удаления выделенных узлов ----------
async function deleteSelectedNodes() {
    const nodeIds = state.selectedNodes;
    if (nodeIds.length === 0) return;
    if (!confirm(`Удалить ${nodeIds.length} выделенных узлов и все связанные с ними рёбра?`)) return;

    try {
        for (let id of nodeIds) {
            const resp = await fetch(`/api/node/${id}/delete/`, { method: 'DELETE' });
            if (!resp.ok) {
                console.warn('Не удалось удалить узел', id);
            }
        }
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