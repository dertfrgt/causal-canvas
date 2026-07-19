import { state } from './state.js';
import { draw } from './draw.js';
import { fetchWithCSRF } from './utils.js';

export async function createNodeAt(x, y) {
    const name = prompt('Введите имя нового узла:', 'Новый узел');
    if (!name) return;
    const color = prompt('Введите цвет (HEX, например #ff5733):', '#3498db');
    try {
        const resp = await fetchWithCSRF('/api/node/', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                x: x,
                y: y,
                color: color || '#3498db',
                value: 0,
                transform_type: 'linear',
                transform_formula: ''
            })
        });
        const data = await resp.json();
        if (resp.ok) {
            state.nodes.push(data);
            draw();
        } else {
            alert('Ошибка создания узла: ' + JSON.stringify(data));
        }
    } catch (err) {
        alert('Ошибка: ' + err);
    }
}

export async function deleteNode(nodeId) {
    try {
        const resp = await fetchWithCSRF(`/api/node/${nodeId}/delete/`, { method: 'DELETE' });
        if (resp.ok) {
            state.nodes = state.nodes.filter(n => n.id !== nodeId);
            state.edges = state.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
            draw();
        } else {
            alert('Ошибка удаления узла');
        }
    } catch (err) {
        alert('Ошибка: ' + err);
    }
}

export async function createEdge(sourceId, targetId) {
    try {
        const resp = await fetchWithCSRF('/api/edge/', {
            method: 'POST',
            body: JSON.stringify({ source: sourceId, target: targetId, weight: 1.0 })
        });
        const data = await resp.json();
        if (resp.ok) {
            state.edges.push(data);
            draw();
        } else {
            alert('Ошибка создания связи: ' + JSON.stringify(data));
        }
    } catch (err) {
        alert('Ошибка: ' + err);
    }
}

export async function deleteEdge(edgeId) {
    try {
        const resp = await fetchWithCSRF(`/api/edge/${edgeId}/delete/`, { method: 'DELETE' });
        if (resp.ok) {
            state.edges = state.edges.filter(e => e.id !== edgeId);
            draw();
        } else {
            alert('Ошибка удаления связи');
        }
    } catch (err) {
        alert('Ошибка: ' + err);
    }
}

export async function updateEdgeWeight(edgeId, newWeight) {
    try {
        const resp = await fetchWithCSRF(`/api/edge/${edgeId}/`, {
            method: 'PUT',
            body: JSON.stringify({ weight: newWeight })
        });
        const data = await resp.json();
        if (resp.ok) {
            const edge = state.edges.find(e => e.id === edgeId);
            if (edge) { edge.weight = data.weight; draw(); }
        } else {
            alert('Ошибка обновления веса: ' + JSON.stringify(data));
        }
    } catch (err) {
        alert('Ошибка: ' + err);
    }
}