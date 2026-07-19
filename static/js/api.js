import { state } from './state.js';
import { draw } from './draw.js';
import { fetchWithCSRF } from './utils.js';

export async function loadGraph() {
    try {
        const resp = await fetch('/api/graph/');
        const data = await resp.json();
        state.nodes = data.nodes;
        state.edges = data.edges;
        draw();
        await loadScenariosList();
    } catch (e) {
        console.error('Ошибка загрузки графа:', e);
        alert('Ошибка загрузки графа. Проверьте, что сервер запущен.');
    }
}

export async function updateNodeProps(nodeId, data) {
    try {
        const resp = await fetchWithCSRF(`/api/node/${nodeId}/`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (resp.ok) return result;
        else { alert('Ошибка обновления: ' + JSON.stringify(result)); return null; }
    } catch (err) { alert('Ошибка: ' + err); return null; }
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