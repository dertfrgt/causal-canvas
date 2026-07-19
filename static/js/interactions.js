import { state } from './state.js';
import { draw, screenToWorld } from './draw.js';
import { pointToSegmentDist } from './utils.js';
import { applyCascade } from './cascade.js';
import { createNodeAt, deleteNode, createEdge, deleteEdge, updateEdgeWeight } from './constructor.js';
import { updateNodeProps } from './api.js';
import { findAncestors, findDescendants } from './scenarios.js';

export function initInteractions() {
    const canvas = document.getElementById('canvas');

    // Локальные переменные для отслеживания состояния панорамирования
    let isPanningCandidate = false;
    let panStartMouseX = 0;
    let panStartMouseY = 0;
    let panStartOffsetX = 0;
    let panStartOffsetY = 0;
    let wasPanning = false; // чтобы отличить клик от панорамирования

    // ---------- Перетаскивание (только перемещение, БЕЗ изменения значения) ----------
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);

        // Сброс флагов перед новым действием
        wasPanning = false;

        // 1. Проверяем, не зажат ли пробел (приоритет)
        if (state.spacePressed) {
            state.isPanning = true;
            panStartMouseX = mouseX;
            panStartMouseY = mouseY;
            panStartOffsetX = state.offsetX;
            panStartOffsetY = state.offsetY;
            canvas.style.cursor = 'grabbing';
            return;
        }

        // 2. Проверяем попадание в узел
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
            // Начинаем перетаскивание узла
            state.dragNode = hitNode;
            state.dragOffsetX = world.x - hitNode.x;
            state.dragOffsetY = world.y - hitNode.y;
            canvas.style.cursor = 'grabbing';
            return;
        }

        // 3. Иначе — кандидат на панорамирование (по пустому месту)
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

        // ---- 1. Обработка панорамирования по пробелу (если активно) ----
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

        // ---- 2. Перетаскивание узла ----
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

        // ---- 3. Панорамирование по пустому месту (без пробела) ----
        if (isPanningCandidate) {
            const dx = mouseX - panStartMouseX;
            const dy = mouseY - panStartMouseY;
            // Начинаем панорамирование, только если сдвиг > 5px (чтобы не мешать кликам)
            if (Math.sqrt(dx*dx + dy*dy) > 5) {
                // Переключаемся в режим панорамирования
                state.isPanning = true;
                isPanningCandidate = false;
                wasPanning = true;
                // Обновляем начальные смещения, чтобы панорамирование было плавным
                panStartOffsetX = state.offsetX;
                panStartOffsetY = state.offsetY;
                panStartMouseX = mouseX;
                panStartMouseY = mouseY;
                canvas.style.cursor = 'grabbing';
                // Не выходим, продолжаем движение
            }
        }

        if (state.isPanning && !state.spacePressed) {
            // Панорамирование без пробела
            const dx = mouseX - panStartMouseX;
            const dy = mouseY - panStartMouseY;
            state.offsetX = panStartOffsetX + dx;
            state.offsetY = panStartOffsetY + dy;
            localStorage.setItem('causal_offsetX', state.offsetX);
            localStorage.setItem('causal_offsetY', state.offsetY);
            draw();
            return;
        }

        // ---- 4. Подсветка ребра (если ничего не перетаскивается) ----
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

        // ---- 5. Подсказка для узла ----
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
    });

    canvas.addEventListener('mouseup', async (e) => {
        // ---- 1. Завершение перетаскивания узла ----
        if (state.dragNode) {
            const node = state.dragNode;
            try {
                await fetch(`/api/node/${node.id}/`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x: node.x, y: node.y })
                });
            } catch (err) {
                console.warn('Не удалось сохранить координаты узла:', err);
            }
            state.dragNode = null;
            canvas.style.cursor = 'default';
            draw();
        }

        // ---- 2. Завершение панорамирования ----
        if (state.isPanning) {
            state.isPanning = false;
            isPanningCandidate = false;
            canvas.style.cursor = 'default';
            draw();
        } else {
            // Если не было панорамирования, сбрасываем кандидата
            isPanningCandidate = false;
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        // Сброс всех состояний при уходе мыши с холста
        if (state.dragNode) {
            state.dragNode = null;
            draw();
        }
        if (state.isPanning) {
            state.isPanning = false;
            isPanningCandidate = false;
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
        // Если было панорамирование — игнорируем клик
        if (wasPanning) {
            wasPanning = false;
            return;
        }
        if (state.isSimulation) return;
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
        // Если было панорамирование — игнорируем клик
        if (wasPanning) {
            wasPanning = false;
            return;
        }
        if (!state.isSimulation) return;
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
}