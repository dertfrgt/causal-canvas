import { state } from './state.js';
import { draw } from './draw.js';
import { createNodeAt } from './constructor.js';
import { fetchWithCSRF } from './utils.js';

export function initConstructorControls() {
    const constructorTools = document.getElementById('constructorTools');

    // ----- Переключение режимов -----
    document.getElementById('modeToggle').addEventListener('click', () => {
        state.isSimulation = !state.isSimulation;
        document.getElementById('modeToggle').textContent = state.isSimulation ? '🔁 Режим: Симуляция' : '🔁 Режим: Конструктор';
        document.getElementById('status').textContent = state.isSimulation ? '⚡ Режим: симуляция' : '🛠️ Режим: конструктор';

        if (constructorTools) {
            constructorTools.style.display = state.isSimulation ? 'none' : 'flex';
        }

        state.selectionMode = false;
        const selectionToggle = document.getElementById('selectionToggle');
        if (selectionToggle) {
            selectionToggle.textContent = '🔲 Режим выделения';
        }
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

    // ----- Остальные кнопки (без изменений) -----
    document.getElementById('addEdgeBtn').addEventListener('click', () => {
        state.edgeSourceNode = null;
        alert('Кликните на узел-источник, затем на узел-цель. Клик по тому же узлу или по пустому месту отменяет выбор.');
        draw();
    });

    document.getElementById('addNodeBtn').addEventListener('click', () => {
        if (!state.isSimulation) {
            createNodeAt(0, 0);
        }
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('Сбросить все значения на 0?')) {
            location.reload();
        }
    });

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
        alert('✅ Изменения приняты.');
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

    // ----- Удалить выделенные -----
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => {
            if (state.selectionMode && state.selectedNodes.length > 0) {
                deleteSelectedNodes();
            } else {
                alert('Нет выделенных узлов или режим выделения выключен.');
            }
        });
    }

    // ----- Центрирование -----
    const centerBtn = document.getElementById('centerGraphBtn');
    if (centerBtn) {
        centerBtn.addEventListener('click', () => {
            centerGraph();
        });
    }

    window.centerGraph = centerGraph;
}

// ---------- Центрирование ----------
export function centerGraph() {
    if (state.nodes.length === 0) {
        alert('Нет узлов для центрирования.');
        return;
    }
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
    for (let node of state.nodes) {
        if (node.x < minX) minX = node.x;
        if (node.x > maxX) maxX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.y > maxY) maxY = node.y;
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = maxX - minX;
    const height = maxY - minY;
    const maxDim = Math.max(width, height);
    const canvas = document.getElementById('canvas');
    const padding = 50;
    const newScale = Math.min((canvas.width - padding * 2) / maxDim, (canvas.height - padding * 2) / maxDim, 5);
    const worldCenter = { x: canvas.width / 2, y: canvas.height / 2 };
    state.offsetX = worldCenter.x - centerX * newScale;
    state.offsetY = worldCenter.y - centerY * newScale;
    state.scale = Math.min(Math.max(newScale, 0.2), 5);
    localStorage.setItem('causal_scale', state.scale);
    localStorage.setItem('causal_offsetX', state.offsetX);
    localStorage.setItem('causal_offsetY', state.offsetY);
    draw();
}

// ---------- Удаление выделенных узлов (с CSRF) ----------
async function deleteSelectedNodes() {
    const nodeIds = state.selectedNodes;
    if (nodeIds.length === 0) return;
    if (!confirm(`Удалить ${nodeIds.length} выделенных узлов и все связанные с ними рёбра?`)) return;

    try {
        for (let id of nodeIds) {
            const resp = await fetchWithCSRF(`/api/node/${id}/delete/`, { method: 'DELETE' });
            if (!resp.ok) {
                console.warn('Не удалось удалить узел', id);
            }
        }
        state.nodes = state.nodes.filter(n => !nodeIds.includes(n.id));
        state.edges = state.edges.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target));
        state.selectedNodes = [];
        draw();
        alert('Выделенные узлы удалены.');
    } catch (err) {
        alert('Ошибка при удалении: ' + err);
    }
}