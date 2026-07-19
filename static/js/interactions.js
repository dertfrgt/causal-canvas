import { state } from './state.js';
import { draw, screenToWorld } from './draw.js';
import { pointToSegmentDist } from './utils.js';
import { applyCascade } from './cascade.js';
import { createNodeAt, deleteNode, createEdge, deleteEdge, updateEdgeWeight } from './constructor.js';
import { updateNodeProps } from './api.js';
import { findAncestors, findDescendants } from './scenarios.js';
import { fetchWithCSRF } from './utils.js';

export function initInteractions() {
    const canvas = document.getElementById('canvas');

    // ---------- БЛОКИРОВКА ДЛЯ АНОНИМНЫХ ПОЛЬЗОВАТЕЛЕЙ ----------
    if (!window.userIsAuthenticated) {
        canvas.style.cursor = 'default';
        canvas.addEventListener('click', () => {
            alert('Войдите, чтобы редактировать граф');
        });
        return; // все остальные обработчики не добавляются
    }

    // Локальные переменные для панорамирования
    let isPanningCandidate = false;
    let panStartMouseX = 0;
    let panStartMouseY = 0;
    let panStartOffsetX = 0;
    let panStartOffsetY = 0;
    let wasPanning = false;

    // ---------- Перетаскивание (только перемещение, БЕЗ изменения значения) ----------
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);

        wasPanning = false;

        // ---- 1. Режим выделения (если включён) ----
        if (state.selectionMode) {
            // Проверяем попадание в узел
            let hitNode = null;
            for (let node of state.nodes) {
                const radius = Math.sqrt(node.value + 1) * 10;
                const dx = world.x - node.x;
                const dy = world.y - node.y;
                if (dx*dx + dy*dy <= radius*radius + 15) {
                    hitNode = node;
                    break;
                }
            }
            if (hitNode) {
                // Переключаем выделение узла
                const idx = state.selectedNodes.indexOf(hitNode.id);
                if (idx === -1) {
                    state.selectedNodes.push(hitNode.id);
                } else {
                    state.selectedNodes.splice(idx, 1);
                }
                draw();
                return;
            } else {
                // Начинаем выделение прямоугольником
                state.isSelecting = true;
                state.selectionRect = {
                    x1: world.x,
                    y1: world.y,
                    x2: world.x,
                    y2: world.y
                };
                canvas.style.cursor = 'crosshair';
                return;
            }
        }

        // ---- 2. Панорамирование по пробелу ----
        if (state.spacePressed) {
            state.isPanning = true;
            panStartMouseX = mouseX;
            panStartMouseY = mouseY;
            panStartOffsetX = state.offsetX;
            panStartOffsetY = state.offsetY;
            canvas.style.cursor = 'grabbing';
            return;
        }

        // ---- 3. Перетаскивание узла ----
        let hitNode = null;
        for (let node of state.nodes) {
            const radius = Math.sqrt(node.value + 1) * 10;
            const dx = world.x - node.x;
            const dy = world.y - node.y;
            if (dx*dx + dy*dy <= radius*radius + 15) {
                hitNode = node;
                break;
            }
        }
        if (hitNode) {
            state.dragNode = hitNode;
            state.dragOffsetX = world.x - hitNode.x;
            state.dragOffsetY = world.y - hitNode.y;
            canvas.style.cursor = 'grabbing';
            return;
        }

        // ---- 4. Иначе — кандидат на панорамирование ----
        isPanningCandidate = true;
        panStartMouseX = mouseX;
        panStartMouseY = mouseY;
        panStartOffsetX = state.offsetX;
        panStartOffsetY = state.offsetY;
        canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);

        // ---- 1. Панорамирование по пробелу ----
        if (state.isPanning && state.spacePressed) {
            const dx = mouseX - panStartMouseX;
            const dy = mouseY - panStartMouseY;
            state.offsetX = panStartOffsetX + dx;
            state.offsetY = panStartOffsetY + dy;
            localStorage.setItem('causal_offsetX', state.offsetX);
            localStorage.setItem('causal_offsetY', state.offsetY);
            draw();
            return;
        }

        // ---- 2. Режим выделения: обновление прямоугольника ----
        if (state.isSelecting) {
            state.selectionRect.x2 = world.x;
            state.selectionRect.y2 = world.y;
            draw();
            return;
        }

        // ---- 3. Перетаскивание узла ----
        if (state.dragNode) {
            state.dragNode.x = Math.max(-500, Math.min(1500, world.x - state.dragOffsetX));
            state.dragNode.y = Math.max(-500, Math.min(1500, world.y - state.dragOffsetY));
            if (state.isSimulation && state.ghostData[state.dragNode.id]) {
                state.ghostData[state.dragNode.id].oldX = state.dragNode.x;
                state.ghostData[state.dragNode.id].oldY = state.dragNode.y;
            }
            draw();
            return;
        }

        // ---- 4. Панорамирование по пустому месту ----
        if (isPanningCandidate) {
            const dx = mouseX - panStartMouseX;
            const dy = mouseY - panStartMouseY;
            if (Math.sqrt(dx*dx + dy*dy) > 5) {
                state.isPanning = true;
                isPanningCandidate = false;
                wasPanning = true;
                panStartOffsetX = state.offsetX;
                panStartOffsetY = state.offsetY;
                panStartMouseX = mouseX;
                panStartMouseY = mouseY;
                canvas.style.cursor = 'grabbing';
            }
        }
        if (state.isPanning && !state.spacePressed) {
            const dx = mouseX - panStartMouseX;
            const dy = mouseY - panStartMouseY;
            state.offsetX = panStartOffsetX + dx;
            state.offsetY = panStartOffsetY + dy;
            localStorage.setItem('causal_offsetX', state.offsetX);
            localStorage.setItem('causal_offsetY', state.offsetY);
            draw();
            return;
        }

        // ---- 5. Подсветка ребра и подсказка (если ничего не выделяем) ----
        if (!state.isSelecting) {
            let foundEdge = null;
            for (let edge of state.edges) {
                const src = state.nodes.find(n => n.id === edge.source);
                const tgt = state.nodes.find(n => n.id === edge.target);
                if (!src || !tgt) continue;
                const dist = pointToSegmentDist(world.x, world.y, src.x, src.y, tgt.x, tgt.y);
                if (dist < 15 / state.scale) {
                    foundEdge = edge.id;
                    break;
                }
            }
            if (foundEdge !== state.hoveredEdgeId) {
                state.hoveredEdgeId = foundEdge;
                canvas.style.cursor = foundEdge ? 'pointer' : 'default';
                draw();
            }

            let foundNode = null;
            for (let node of state.nodes) {
                const radius = Math.sqrt(node.value + 1) * 10;
                const dx = world.x - node.x;
                const dy = world.y - node.y;
                if (dx*dx + dy*dy <= radius*radius + 15) {
                    foundNode = node;
                    break;
                }
            }
            if (foundNode !== state.tooltipNode) {
                state.tooltipNode = foundNode;
                draw();
            }
        }
    });

    canvas.addEventListener('mouseup', async (e) => {
        // ---- 1. Завершение выделения прямоугольником ----
        if (state.isSelecting) {
            const rect = state.selectionRect;
            const x1 = Math.min(rect.x1, rect.x2);
            const y1 = Math.min(rect.y1, rect.y2);
            const x2 = Math.max(rect.x1, rect.x2);
            const y2 = Math.max(rect.y1, rect.y2);

            // Очищаем предыдущее выделение (можно сделать с Shift, пока сбрасываем)
            state.selectedNodes = [];
            for (let node of state.nodes) {
                if (node.x >= x1 && node.x <= x2 && node.y >= y1 && node.y <= y2) {
                    state.selectedNodes.push(node.id);
                }
            }
            state.isSelecting = false;
            state.selectionRect = null;
            canvas.style.cursor = 'default';
            draw();
            if (state.selectedNodes.length > 0) {
                alert(`Выделено ${state.selectedNodes.length} узлов. Для удаления нажмите Delete или кнопку "Удалить выделенные".`);
            }
            return;
        }

        // ---- 2. Завершение перетаскивания узла ----
        // ---- 2. Завершение перетаскивания узла ----
if (state.dragNode) {
    const node = state.dragNode;
    try {
        await fetchWithCSRF(`/api/node/${node.id}/`, {
            method: 'PUT',
            body: JSON.stringify({ x: node.x, y: node.y })
        });
    } catch (err) {
        console.warn('Не удалось сохранить координаты узла:', err);
    }
    state.dragNode = null;
    canvas.style.cursor = 'default';
    draw();
}

        // ---- 3. Завершение панорамирования ----
        if (state.isPanning) {
            state.isPanning = false;
            isPanningCandidate = false;
            canvas.style.cursor = 'default';
            draw();
        } else {
            isPanningCandidate = false;
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (state.dragNode) {
            state.dragNode = null;
            draw();
        }
        if (state.isPanning) {
            state.isPanning = false;
            isPanningCandidate = false;
            draw();
        }
        if (state.isSelecting) {
            state.isSelecting = false;
            state.selectionRect = null;
            draw();
        }
        state.tooltipNode = null;
        canvas.style.cursor = 'default';
        draw();
    });

    // ---------- Колесо мыши (зум) ----------
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(state.scale * delta, 0.2), 5);
        const world = screenToWorld(mouseX, mouseY);
        state.offsetX = mouseX - world.x * newScale;
        state.offsetY = mouseY - world.y * newScale;
        state.scale = newScale;
        localStorage.setItem('causal_scale', state.scale);
        localStorage.setItem('causal_offsetX', state.offsetX);
        localStorage.setItem('causal_offsetY', state.offsetY);
        draw();
    }, { passive: false });

    // ---------- Пробел для панорамирования (альтернативный способ) ----------
    document.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Space') {
            e.preventDefault();
            state.spacePressed = true;
            canvas.style.cursor = 'grab';
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Space') {
            e.preventDefault();
            state.spacePressed = false;
            canvas.style.cursor = 'default';
            if (state.isPanning) {
                state.isPanning = false;
                isPanningCandidate = false;
                draw();
            }
        }
    });

    // ---------- Двойной клик (узел или ребро) ----------
    canvas.addEventListener('dblclick', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);
        let hitNode = null;
        for (let node of state.nodes) {
            const radius = Math.sqrt(node.value + 1) * 10;
            const dx = world.x - node.x;
            const dy = world.y - node.y;
            if (dx*dx + dy*dy <= radius*radius + 15) {
                hitNode = node;
                break;
            }
        }
        if (hitNode) {
            state.editingNodeId = hitNode.id;
            document.getElementById('modalTitle').textContent = '✏️ Настройки ' + hitNode.name;
            document.getElementById('modalNodeName').value = hitNode.name;
            document.getElementById('modalNodeColor').value = hitNode.color;
            document.getElementById('modalNodeValue').value = '';
            document.getElementById('modalTransformType').value = hitNode.transform_type || 'linear';
            document.getElementById('modalFormula').value = hitNode.transform_formula || '';
            const type = document.getElementById('modalTransformType').value;
            document.getElementById('formulaField').style.display = (type === 'custom') ? 'block' : 'none';
            document.getElementById('valueSection').style.display = state.isSimulation ? 'block' : 'none';
            document.getElementById('editNodeModal').style.display = 'flex';
            return;
        }

        // Ребро
        let hitEdge = null;
        for (let edge of state.edges) {
            const src = state.nodes.find(n => n.id === edge.source);
            const tgt = state.nodes.find(n => n.id === edge.target);
            if (!src || !tgt) continue;
            const dist = pointToSegmentDist(world.x, world.y, src.x, src.y, tgt.x, tgt.y);
            if (dist < 15 / state.scale) {
                hitEdge = edge;
                break;
            }
        }
        if (hitEdge) {
            const newWeight = prompt(`Введите новый вес для связи (текущий: ${hitEdge.weight.toFixed(2)}):`, hitEdge.weight);
            if (newWeight !== null) {
                const weightNum = parseFloat(newWeight);
                if (!isNaN(weightNum) && weightNum >= 0) {
                    updateEdgeWeight(hitEdge.id, weightNum);
                } else {
                    alert('Введите положительное число');
                }
            }
            return;
        }

        // Пустое место – создаём узел (только в конструкторе)
        if (!state.isSimulation) {
            createNodeAt(world.x, world.y);
        }
    });

    // ---------- Клик для выбора источника связи (конструктор) ----------
    canvas.addEventListener('click', (e) => {
        if (wasPanning) { wasPanning = false; return; }
        if (state.isSimulation || state.selectionMode) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);

        if (!state.edgeSourceNode) {
            for (let node of state.nodes) {
                const radius = Math.sqrt(node.value + 1) * 10;
                const dx = world.x - node.x;
                const dy = world.y - node.y;
                if (dx*dx + dy*dy <= radius*radius + 15) {
                    state.edgeSourceNode = node;
                    draw();
                    return;
                }
            }
        } else {
            for (let node of state.nodes) {
                const radius = Math.sqrt(node.value + 1) * 10;
                const dx = world.x - node.x;
                const dy = world.y - node.y;
                if (dx*dx + dy*dy <= radius*radius + 15) {
                    if (node.id === state.edgeSourceNode.id) {
                        state.edgeSourceNode = null;
                        draw();
                        return;
                    }
                    createEdge(state.edgeSourceNode.id, node.id);
                    state.edgeSourceNode = null;
                    draw();
                    return;
                }
            }
            state.edgeSourceNode = null;
            draw();
        }
    });

    // ---------- Контекстное меню (удаление) ----------
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (state.isSimulation) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);

        for (let node of state.nodes) {
            const radius = Math.sqrt(node.value + 1) * 10;
            const dx = world.x - node.x;
            const dy = world.y - node.y;
            if (dx*dx + dy*dy <= radius*radius + 15) {
                if (confirm(`Удалить узел "${node.name}" и все связанные рёбра?`)) {
                    deleteNode(node.id);
                }
                return;
            }
        }

        for (let edge of state.edges) {
            const src = state.nodes.find(n => n.id === edge.source);
            const tgt = state.nodes.find(n => n.id === edge.target);
            if (!src || !tgt) continue;
            const dist = pointToSegmentDist(world.x, world.y, src.x, src.y, tgt.x, tgt.y);
            if (dist < 15 / state.scale) {
                if (confirm(`Удалить связь между ${src.name} и ${tgt.name}?`)) {
                    deleteEdge(edge.id);
                }
                return;
            }
        }
    });

    // ---------- Клик по узлу для цепочки (только симуляция) ----------
    canvas.addEventListener('click', (e) => {
        if (wasPanning) { wasPanning = false; return; }
        if (!state.isSimulation || state.selectionMode) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);
        let hitNode = null;
        for (let node of state.nodes) {
            const radius = Math.sqrt(node.value + 1) * 10;
            const dx = world.x - node.x;
            const dy = world.y - node.y;
            if (dx*dx + dy*dy <= radius*radius + 15) {
                hitNode = node;
                break;
            }
        }
        if (hitNode) {
            if (state.clickedNodeId === hitNode.id) {
                state.clickedNodeId = null;
                state.highlightAncestors = [];
                state.highlightDescendants = [];
            } else {
                state.clickedNodeId = hitNode.id;
                state.highlightAncestors = findAncestors(hitNode.id);
                state.highlightDescendants = findDescendants(hitNode.id);
            }
            draw();
        } else {
            state.clickedNodeId = null;
            state.highlightAncestors = [];
            state.highlightDescendants = [];
            draw();
        }
    });

    // ---------- Глобальный обработчик Delete для удаления выделенных узлов ----------
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Del') {
            if (state.selectionMode && state.selectedNodes.length > 0) {
                deleteSelectedNodes();
            }
        }
    });
}

// ---------- Функция удаления выделенных узлов (вынесена в глобальную область) ----------
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
        draw();
        alert('Выделенные узлы удалены.');
    } catch (err) {
        alert('Ошибка при удалении: ' + err);
    }
}