import { state } from './state.js';
import { pointToSegmentDist } from './utils.js';

export function draw() {
    const {
        nodes, edges, isSimulation, ghostData, flashes, deltas,
        changedNodes, highlightAncestors, highlightDescendants,
        clickedNodeId, hoveredEdgeId, tooltipNode, dragNode,
        scale, offsetX, offsetY, edgeSourceNode
    } = state;

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Сохраняем контекст для трансформации (масштаб и панорамирование)
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // ===== РЁБРА =====
    const isDash = !isSimulation;
    for (let edge of edges) {
        const src = nodes.find(n => n.id === edge.source);
        const tgt = nodes.find(n => n.id === edge.target);
        if (!src || !tgt) continue;
        const x1 = src.x, y1 = src.y;
        const x2 = tgt.x, y2 = tgt.y;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const targetRadius = Math.sqrt(tgt.value + 1) * 10;
        const endX = x2 - targetRadius * Math.cos(angle);
        const endY = y2 - targetRadius * Math.sin(angle);

        let edgeColor = '#999';
        let edgeWidth = 2;
        if (clickedNodeId !== null) {
            const isAncestorEdge = highlightAncestors.includes(edge.source) && highlightAncestors.includes(edge.target);
            const isDescendantEdge = highlightDescendants.includes(edge.source) && highlightDescendants.includes(edge.target);
            if (isAncestorEdge) { edgeColor = '#3498db'; edgeWidth = 3; }
            else if (isDescendantEdge) { edgeColor = '#27ae60'; edgeWidth = 3; }
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = (hoveredEdgeId === edge.id) ? '#2ecc71' : edgeColor;
        ctx.lineWidth = (hoveredEdgeId === edge.id) ? 3 : edgeWidth;
        if (isDash) ctx.setLineDash([5,5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Стрелка
        const arrowLength = 12, arrowWidth = 6;
        const perpX = -Math.sin(angle), perpY = Math.cos(angle);
        const base1X = endX - arrowLength * Math.cos(angle) + arrowWidth * perpX;
        const base1Y = endY - arrowLength * Math.sin(angle) + arrowWidth * perpY;
        const base2X = endX - arrowLength * Math.cos(angle) - arrowWidth * perpX;
        const base2Y = endY - arrowLength * Math.sin(angle) - arrowWidth * perpY;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(base1X, base1Y);
        ctx.lineTo(base2X, base2Y);
        ctx.closePath();
        ctx.fillStyle = (hoveredEdgeId === edge.id) ? '#2ecc71' : edgeColor;
        ctx.fill();

        // Вес
        const mx = (src.x + tgt.x)/2, my = (src.y + tgt.y)/2;
        ctx.fillStyle = 'black';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(edge.weight.toFixed(1), mx, my-5);
    }

    // ===== ПРИЗРАКИ =====
    if (isSimulation) {
        for (let nodeId in ghostData) {
            const g = ghostData[nodeId];
            const radius = Math.sqrt(g.oldValue + 1) * 10;
            ctx.beginPath();
            ctx.arc(g.oldX, g.oldY, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(128,128,128,0.7)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(200,200,200,0.15)';
            ctx.fill();
            ctx.fillStyle = '#666';
            ctx.font = '13px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('было: ' + g.oldValue.toFixed(1), g.oldX, g.oldY - radius - 6);
        }
    }

    // ===== УЗЛЫ =====
    for (let node of nodes) {
        const radius = Math.sqrt(node.value + 1) * 10;
        let fillColor = node.color;
        let strokeColor = 'black';
        let lineWidth = 2;

        // Градиентная окраска для изменённых узлов
        if (isSimulation && changedNodes[node.id]) {
            const delta = changedNodes[node.id].delta;
            const maxDelta = Math.max(...Object.values(changedNodes).map(d => Math.abs(d.delta)), 0.001);
            const ratio = Math.abs(delta) / maxDelta;
            const r = Math.round(255 * ratio);
            const g = Math.round(255 * (1 - ratio));
            const b = 0;
            fillColor = `rgb(${r},${g},${b})`;
        }

        // Подсветка цепочек
        if (clickedNodeId !== null) {
            if (highlightAncestors.includes(node.id) && node.id !== clickedNodeId) {
                strokeColor = '#3498db';
                lineWidth = 4;
            } else if (highlightDescendants.includes(node.id) && node.id !== clickedNodeId) {
                strokeColor = '#27ae60';
                lineWidth = 4;
            } else if (node.id === clickedNodeId) {
                strokeColor = '#f39c12';
                lineWidth = 5;
            }
        }

        // ---- РАДИАЛЬНЫЙ ГРАДИЕНТ (улучшенный) ----
        const gradient = ctx.createRadialGradient(
            node.x - radius * 0.35, node.y - radius * 0.35, radius * 0.1,
            node.x, node.y, radius
        );
        // Цвета градиента
        const baseColor = fillColor;
        // Преобразуем hex в rgb для работы
        let r, g, b;
        if (baseColor.startsWith('#')) {
            r = parseInt(baseColor.slice(1,3), 16);
            g = parseInt(baseColor.slice(3,5), 16);
            b = parseInt(baseColor.slice(5,7), 16);
        } else if (baseColor.startsWith('rgb')) {
            const matches = baseColor.match(/\d+/g);
            if (matches) {
                r = parseInt(matches[0]);
                g = parseInt(matches[1]);
                b = parseInt(matches[2]);
            } else {
                r = 100; g = 100; b = 100;
            }
        } else {
            r = 100; g = 100; b = 100;
        }
        // Светлый оттенок для блика
        const lightR = Math.min(255, r + 120);
        const lightG = Math.min(255, g + 120);
        const lightB = Math.min(255, b + 120);
        // Тёмный оттенок для тени
        const darkR = Math.max(0, r * 0.4);
        const darkG = Math.max(0, g * 0.4);
        const darkB = Math.max(0, b * 0.4);

        gradient.addColorStop(0, `rgb(${lightR},${lightG},${lightB})`); // яркий центр
        gradient.addColorStop(0.5, `rgb(${r},${g},${b})`);      // основной цвет
        gradient.addColorStop(1, `rgb(${darkR},${darkG},${darkB})`); // тёмный край

        // ---- ТЕНЬ (более реалистичная) ----
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 12;

        // Рисуем узел
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0; // сбрасываем тень для обводки
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // ---- ИМЯ УЗЛА ----
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.name, node.x, node.y);

        // ---- ЗНАЧЕНИЕ ----
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.textBaseline = 'top';
        ctx.fillText(node.value.toFixed(1), node.x, node.y + radius + 4);

        // ---- ВСПЫШКИ ----
        if (isSimulation && flashes[node.id]) {
            const colors = flashes[node.id];
            const startX = node.x - (colors.length * 8) / 2;
            const startY = node.y - radius - 20;
            colors.forEach((color, idx) => {
                ctx.beginPath();
                ctx.arc(startX + idx * 12, startY, 5, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
            if (colors.length > 5) {
                ctx.fillStyle = 'black';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+' + (colors.length - 5), startX + 5*12 + 10, startY);
            }
        }

        // ---- ДЕЛЬТА ----
        if (deltas[node.id]) {
            const d = deltas[node.id];
            const sign = d.value >= 0 ? '+' : '';
            const color = d.value >= 0 ? '#27ae60' : '#e74c3c';
            ctx.fillStyle = color;
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(sign + d.value.toFixed(1), node.x, node.y - radius - 8);
        }
    }

    // ===== TOOLTIP =====
    if (tooltipNode && !dragNode) {
        const node = tooltipNode;
        const radius = Math.sqrt(node.value + 1) * 10;
        const textLines = [
            'Имя: ' + node.name,
            'Значение: ' + node.value.toFixed(2),
            'Трансформация: ' + node.transform_type,
        ];
        const incoming = edges.filter(e => e.target === node.id);
        const outgoing = edges.filter(e => e.source === node.id);
        if (incoming.length) textLines.push('Входящие: ' + incoming.map(e => nodes.find(n => n.id === e.source)?.name || '?').join(', '));
        if (outgoing.length) textLines.push('Исходящие: ' + outgoing.map(e => nodes.find(n => n.id === e.target)?.name || '?').join(', '));

        const lineHeight = 18, padding = 8;
        ctx.font = '13px Arial';
        const widths = textLines.map(line => ctx.measureText(line).width);
        const boxWidth = Math.min(Math.max(...widths) + padding*2, 200);
        const boxHeight = textLines.length * lineHeight + padding*2;

        let tx = node.x + radius + 12;
        let ty = node.y - boxHeight/2;
        const screenPos = worldToScreen(tx, ty);
        const screenWidth = boxWidth * scale;
        const screenHeight = boxHeight * scale;
        if (screenPos.x + screenWidth > canvas.width) {
            tx = node.x - radius - 12 - boxWidth;
        }
        if (screenPos.y + screenHeight > canvas.height) {
            ty = node.y - boxHeight/2;
        }
        if (screenPos.y < 0) ty = node.y - boxHeight/2;

        ctx.fillStyle = 'rgba(50,50,50,0.9)';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(tx, ty, boxWidth, boxHeight, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'white';
        ctx.font = '13px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        textLines.forEach((line, i) => {
            ctx.fillText(line, tx + padding, ty + padding + i * lineHeight);
        });
    }
    // ---------- Прямоугольник выделения (в экранных координатах) ----------
if (isSelectingRect && selectionStartX !== undefined && selectionEndX !== undefined) {
    const x = Math.min(selectionStartX, selectionEndX);
    const y = Math.min(selectionStartY, selectionEndY);
    const w = Math.abs(selectionEndX - selectionStartX);
    const h = Math.abs(selectionEndY - selectionStartY);
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 120, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0, 120, 255, 0.1)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}

// ---------- Подсветка выделенных узлов ----------
if (state.selectionMode && state.selectedNodes.length > 0) {
    for (let node of state.nodes) {
        if (state.selectedNodes.includes(node.id)) {
            const radius = Math.sqrt(node.value + 1) * 10;
            ctx.save();
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 3;
            ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.restore();
        }
    }
}
    ctx.restore();

    // ===== ПОДСКАЗКА ВНИЗУ =====
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    let hint = isSimulation ? '💡 Двойной клик по узлу → настройки, по ребру → вес · Клик по узлу → цепочка' : '🛠️ Конструктор: двойной клик по пустому месту → узел';
    if (!isSimulation && edgeSourceNode) {
        hint += ' · Выбран источник: ' + edgeSourceNode.name;
    }
    ctx.fillText(hint, 20, canvas.height - 10);
}

// Вспомогательные функции преобразования координат (уже есть в state?)
export function worldToScreen(wx, wy) {
    return { x: wx * state.scale + state.offsetX, y: wy * state.scale + state.offsetY };
}
export function screenToWorld(sx, sy) {
    return { x: (sx - state.offsetX) / state.scale, y: (sy - state.offsetY) / state.scale };
}

// Полифил для roundRect (если нужен)
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
        const r = typeof radii === 'number' ? radii : (radii || 0);
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        this.closePath();
        return this;
    };
}