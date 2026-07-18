import { state } from './state.js';
import { draw, screenToWorld } from './draw.js';
import { pointToSegmentDist } from './utils.js';
import { applyCascade } from './cascade.js';
import { createNodeAt, deleteNode, createEdge, deleteEdge, updateEdgeWeight } from './constructor.js';
import { updateNodeProps } from './api.js';
import { findAncestors, findDescendants } from './scenarios.js';

export function initInteractions() {
    const canvas = document.getElementById('canvas');

    // ---------- Перетаскивание (только перемещение, БЕЗ изменения значения) ----------
    canvas.addEventListener('mousedown', (e) => {
        if (state.spacePressed) {
            state.isPanning = true;
            const rect = canvas.getBoundingClientRect();
            state.panStartX = e.clientX - rect.left;
            state.panStartY = e.clientY - rect.top;
            state.panOffsetX = state.offsetX;
            state.panOffsetY = state.offsetY;
            canvas.style.cursor = 'grabbing';
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);
        for (let node of state.nodes) {
            const radius = Math.sqrt(node.value + 1) * 10;
            const dx = world.x - node.x, dy = world.y - node.y;
            if (dx*dx + dy*dy <= radius*radius + 15) {
                state.dragNode = node;
                state.dragOffsetX = world.x - node.x;
                state.dragOffsetY = world.y - node.y;
                canvas.style.cursor = 'grabbing';
                break;
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);

        if (state.isPanning && state.spacePressed) {
            const dx = mouseX - state.panStartX;
            const dy = mouseY - state.panStartY;
            state.offsetX = state.panOffsetX + dx;
            state.offsetY = state.panOffsetY + dy;
            localStorage.setItem('causal_offsetX', state.offsetX);
            localStorage.setItem('causal_offsetY', state.offsetY);
            draw();
            return;
        }

        if (state.dragNode) {
            // Перемещаем узел, НО НЕ МЕНЯЕМ ЕГО ЗНАЧЕНИЕ
            state.dragNode.x = Math.max(-500, Math.min(1500, world.x - state.dragOffsetX));
            state.dragNode.y = Math.max(-500, Math.min(1500, world.y - state.dragOffsetY));
            // Если есть призрак – синхронизируем его координаты
            if (state.isSimulation && state.ghostData[state.dragNode.id]) {
                state.ghostData[state.dragNode.id].oldX = state.dragNode.x;
                state.ghostData[state.dragNode.id].oldY = state.dragNode.y;
            }
            draw();
            return;
        }

        // Подсветка ребра
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

        // Подсказка для узла
        let foundNode = null;
        for (let node of state.nodes) {
            const radius = Math.sqrt(node.value + 1) * 10;
            const dx = world.x - node.x, dy = world.y - node.y;
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
        if (state.dragNode) {
            // Сохраняем только координаты, значение НЕ МЕНЯЕМ
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
        if (state.isPanning) {
            state.isPanning = false;
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (state.dragNode) {
            state.dragNode = null;
            canvas.style.cursor = 'default';
            draw();
        }
        if (state.isPanning) {
            state.isPanning = false;
            canvas.style.cursor = 'default';
        }
        state.tooltipNode = null;
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

    // ---------- Пробел для панорамирования ----------
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
            if (state.isPanning) state.isPanning = false;
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
            const dx = world.x - node.x, dy = world.y - node.y;
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
            // Показать/скрыть поле формулы
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
        if (state.isSimulation) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);

        if (!state.edgeSourceNode) {
            for (let node of state.nodes) {
                const radius = Math.sqrt(node.value + 1) * 10;
                const dx = world.x - node.x, dy = world.y - node.y;
                if (dx*dx + dy*dy <= radius*radius + 15) {
                    state.edgeSourceNode = node;
                    draw();
                    return;
                }
            }
        } else {
            for (let node of state.nodes) {
                const radius = Math.sqrt(node.value + 1) * 10;
                const dx = world.x - node.x, dy = world.y - node.y;
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
            const dx = world.x - node.x, dy = world.y - node.y;
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
        if (!state.isSimulation) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);
        let hitNode = null;
        for (let node of state.nodes) {
            const radius = Math.sqrt(node.value + 1) * 10;
            const dx = world.x - node.x, dy = world.y - node.y;
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