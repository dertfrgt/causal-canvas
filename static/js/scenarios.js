import { state } from './state.js';
import { draw } from './draw.js';
import { loadScenariosList } from './api.js';
import { fetchWithCSRF } from './utils.js';

export function initScenarioControls() {
    document.getElementById('saveScenarioBtn').addEventListener('click', () => {
        document.getElementById('saveScenarioModal').style.display = 'flex';
    });
    document.getElementById('saveScenarioConfirm').addEventListener('click', async () => {
        const name = document.getElementById('scenarioNameInput').value.trim();
        const desc = document.getElementById('scenarioDescInput').value.trim();
        if (!name) { alert('Введите название'); return; }
        document.getElementById('saveScenarioModal').style.display = 'none';
        await saveScenario(name, desc);
    });
    document.getElementById('saveScenarioCancel').addEventListener('click', () => {
        document.getElementById('saveScenarioModal').style.display = 'none';
    });
    document.getElementById('saveScenarioModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('saveScenarioModal'))
            document.getElementById('saveScenarioModal').style.display = 'none';
    });

    document.getElementById('loadScenarioBtn').addEventListener('click', () => {
        const sel = document.getElementById('scenarioSelect');
        loadScenario(sel.value);
    });

    document.getElementById('deleteScenarioBtn').addEventListener('click', () => {
        const sel = document.getElementById('scenarioSelect');
        deleteScenario(sel.value);
    });

    document.getElementById('exportScenarioBtn').addEventListener('click', () => {
        const sel = document.getElementById('scenarioSelect');
        exportScenario(sel.value);
    });

    document.getElementById('importScenarioBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importScenario(e.target.files[0]);
            e.target.value = '';
        }
    });
}

async function saveScenario(name, description) {
    try {
        const resp = await fetchWithCSRF('/api/scenarios/save/', {
            method: 'POST',
            body: JSON.stringify({ name, description })
        });
        const data = await resp.json();
        if (resp.ok) {
            alert('Сценарий "' + name + '" сохранён!');
            loadScenariosList();
        } else {
            alert('Ошибка: ' + JSON.stringify(data));
        }
    } catch (err) { alert('Ошибка: ' + err); }
}

async function loadScenario(scenarioId) {
    if (!scenarioId) return alert('Выберите сценарий');
    if (!confirm('Загрузка сценария заменит текущий граф. Продолжить?')) return;
    try {
        const resp = await fetchWithCSRF(`/api/scenarios/${scenarioId}/load/`, { method: 'POST' });
        const data = await resp.json();
        if (resp.ok) {
            state.nodes = data.nodes;
            state.edges = data.edges;
            state.ghostData = {};
            state.flashes = {};
            state.deltas = {};
            state.changedNodes = {};
            state.clickedNodeId = null;
            state.highlightAncestors = [];
            state.highlightDescendants = [];
            draw();
            alert('Сценарий загружен!');
        } else {
            alert('Ошибка загрузки: ' + JSON.stringify(data));
        }
    } catch (err) { alert('Ошибка: ' + err); }
}

async function deleteScenario(scenarioId) {
    if (!scenarioId) return alert('Выберите сценарий');
    if (!confirm('Удалить выбранный сценарий?')) return;
    try {
        const resp = await fetchWithCSRF(`/api/scenarios/${scenarioId}/delete/`, { method: 'DELETE' });
        if (resp.ok) {
            alert('Сценарий удалён');
            loadScenariosList();
        } else {
            alert('Ошибка удаления');
        }
    } catch (err) { alert('Ошибка: ' + err); }
}

async function exportScenario(scenarioId) {
    if (!scenarioId) return alert('Выберите сценарий');
    try {
        const resp = await fetchWithCSRF(`/api/scenarios/${scenarioId}/export/`);
        const data = await resp.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scenario_${scenarioId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) { alert('Ошибка экспорта: ' + err); }
}

function importScenario(file) {
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            const name = prompt('Введите имя для импортируемого сценария:', 'Imported');
            if (!name) return;
            const resp = await fetchWithCSRF(`/api/scenarios/import/?name=${encodeURIComponent(name)}`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            const result = await resp.json();
            if (resp.ok) {
                alert('Сценарий импортирован!');
                loadScenariosList();
            } else {
                alert('Ошибка импорта: ' + JSON.stringify(result));
            }
        } catch (err) { alert('Ошибка чтения файла: ' + err); }
    };
    reader.readAsText(file);
}

export function findAncestors(nodeId) {
    const visited = new Set();
    const queue = [nodeId];
    while (queue.length) {
        const id = queue.shift();
        const incoming = state.edges.filter(e => e.target === id);
        for (let e of incoming) {
            if (!visited.has(e.source)) {
                visited.add(e.source);
                queue.push(e.source);
            }
        }
    }
    return Array.from(visited);
}

export function findDescendants(nodeId) {
    const visited = new Set();
    const queue = [nodeId];
    while (queue.length) {
        const id = queue.shift();
        const outgoing = state.edges.filter(e => e.source === id);
        for (let e of outgoing) {
            if (!visited.has(e.target)) {
                visited.add(e.target);
                queue.push(e.target);
            }
        }
    }
    return Array.from(visited);
}