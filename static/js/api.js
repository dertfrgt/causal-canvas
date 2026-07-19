import { state } from './state.js';
import { draw } from './draw.js';
import { centerGraph } from './controls.js';

export async function loadGraph() {
    try {
        const resp = await fetch('/api/graph/');
        const data = await resp.json();
        state.nodes = Array.isArray(data.nodes) ? data.nodes : [];
        state.edges = Array.isArray(data.edges) ? data.edges : [];
        draw();
        // Автоматически центрируем граф после загрузки, если есть узлы
        if (state.nodes.length > 0) {
            // Вызываем центрирование, но с небольшой задержкой, чтобы холст уже был отрисован
            setTimeout(() => {
                centerGraph();
            }, 50);
        }
        await loadScenariosList();
    } catch (e) {
        console.error('Ошибка загрузки графа:', e);
        alert('Ошибка загрузки графа. Проверьте, что сервер запущен.');
    }
}

export async function loadScenariosList() {
    try {
        const resp = await fetch('/api/scenarios/');
        const data = await resp.json();
        const select = document.getElementById('scenarioSelect');
        select.innerHTML = '<option value="">-- Выберите --</option>';
        data.forEach(sc => {
            const opt = document.createElement('option');
            opt.value = sc.id;
            opt.textContent = sc.name + (sc.description ? ' (' + sc.description + ')' : '');
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Ошибка загрузки списка сценариев:', e);
    }
}

export async function updateNodeProps(nodeId, data) {
    try {
        const resp = await fetch(`/api/node/${nodeId}/`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (resp.ok) return result;
        else { alert('Ошибка обновления: ' + JSON.stringify(result)); return null; }
    } catch (err) { alert('Ошибка: ' + err); return null; }
}