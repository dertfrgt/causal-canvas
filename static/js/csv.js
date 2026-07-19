import { state } from './state.js';
import { draw } from './draw.js';

// ---------- Вспомогательная функция для получения CSRF-токена ----------
function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

// ---------- Вспомогательная функция для fetch с CSRF ----------
async function fetchWithCSRF(url, options = {}) {
    const csrfToken = getCSRFToken();
    const headers = options.headers || {};
    // Добавляем CSRF-токен в заголовки для методов, изменяющих состояние
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase())) {
        headers['X-CSRFToken'] = csrfToken;
    }
    // Устанавливаем Content-Type, если не передан
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    const config = {
        ...options,
        headers: headers,
        credentials: 'include', // важно для отправки cookies
    };
    return fetch(url, config);
}

export function initCsvControls() {
    const uploadBtn = document.getElementById('uploadCsvBtn');
    const fileInput = document.getElementById('csvFileInput');
    const modal = document.getElementById('columnSelectModal');
    const container = document.getElementById('columnCheckboxes');

    if (!uploadBtn || !fileInput || !modal || !container) {
        console.error('Элементы не найдены');
        return;
    }

    // ---------- Загрузка CSV ----------
    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);

        try {
            const resp = await fetchWithCSRF('/api/upload-csv/', {
                method: 'POST',
                body: formData,
                // не устанавливаем Content-Type, браузер сам установит для FormData
            });
            const data = await resp.json();
            if (resp.ok) {
                container.innerHTML = '';

                // Превью
                if (data.preview && data.preview.length > 0) {
                    const previewDiv = document.createElement('div');
                    previewDiv.innerHTML = '<h4 style="margin:10px 0 5px;">📋 Превью (первые 5 строк):</h4>';
                    const table = document.createElement('table');
                    table.style.borderCollapse = 'collapse';
                    table.style.width = '100%';
                    table.style.margin = '8px 0 15px';
                    table.style.fontSize = '13px';

                    const thead = document.createElement('thead');
                    const headerRow = document.createElement('tr');
                    data.columns.forEach(col => {
                        const th = document.createElement('th');
                        th.textContent = col;
                        th.style.border = '1px solid #ccc';
                        th.style.padding = '4px 8px';
                        th.style.background = '#f0f0f0';
                        headerRow.appendChild(th);
                    });
                    thead.appendChild(headerRow);
                    table.appendChild(thead);

                    const tbody = document.createElement('tbody');
                    data.preview.forEach(row => {
                        const tr = document.createElement('tr');
                        data.columns.forEach(col => {
                            const td = document.createElement('td');
                            td.textContent = row[col] !== undefined ? row[col] : '';
                            td.style.border = '1px solid #ccc';
                            td.style.padding = '4px 8px';
                            tr.appendChild(td);
                        });
                        tbody.appendChild(tr);
                    });
                    table.appendChild(tbody);
                    previewDiv.appendChild(table);
                    container.appendChild(previewDiv);
                }

                // Выбор столбцов
                const labelHeader = document.createElement('p');
                labelHeader.textContent = 'Выберите столбцы для построения графа (минимум 2):';
                labelHeader.style.fontWeight = 'bold';
                container.appendChild(labelHeader);

                if (!data.numeric_columns || data.numeric_columns.length === 0) {
                    alert('Нет числовых столбцов');
                    return;
                }
                data.numeric_columns.forEach(col => {
                    const label = document.createElement('label');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = col;
                    checkbox.checked = true;
                    label.appendChild(checkbox);
                    label.appendChild(document.createTextNode(' ' + col));
                    container.appendChild(label);
                    container.appendChild(document.createElement('br'));
                });

                // Настройки алгоритма
                const settingsDiv = document.createElement('div');
                settingsDiv.style.marginTop = '20px';
                settingsDiv.style.borderTop = '1px solid #eee';
                settingsDiv.style.paddingTop = '15px';

                // Алгоритм
                const algLabel = document.createElement('label');
                algLabel.textContent = 'Алгоритм:';
                settingsDiv.appendChild(algLabel);
                const algSelect = document.createElement('select');
                algSelect.id = 'algorithmSelect';
                algSelect.innerHTML = `
                    <option value="notears">NOTEARS (линейный)</option>
                    <option value="pc">PC</option>
                    <option value="ges">GES</option>
                    <option value="golem">GOLEM (устойчивый)</option>
                `;
                settingsDiv.appendChild(algSelect);
                settingsDiv.appendChild(document.createElement('br'));

                // Порог
                const threshLabel = document.createElement('label');
                threshLabel.textContent = 'Порог значимости (0.01–0.5):';
                settingsDiv.appendChild(threshLabel);
                const threshInput = document.createElement('input');
                threshInput.type = 'range';
                threshInput.id = 'thresholdInput';
                threshInput.min = '0.01';
                threshInput.max = '0.5';
                threshInput.step = '0.01';
                threshInput.value = '0.05';
                settingsDiv.appendChild(threshInput);
                const threshValue = document.createElement('span');
                threshValue.id = 'thresholdValue';
                threshValue.textContent = '0.05';
                settingsDiv.appendChild(threshValue);
                threshInput.addEventListener('input', () => {
                    threshValue.textContent = parseFloat(threshInput.value).toFixed(2);
                });
                settingsDiv.appendChild(document.createElement('br'));

                // Максимальное число итераций
                const iterLabel = document.createElement('label');
                iterLabel.textContent = 'Макс. итераций (для NOTEARS/GOLEM):';
                settingsDiv.appendChild(iterLabel);
                const iterInput = document.createElement('input');
                iterInput.type = 'number';
                iterInput.id = 'maxIterInput';
                iterInput.value = '100000';
                iterInput.min = '100';
                iterInput.max = '1000000';
                iterInput.style.width = '120px';
                settingsDiv.appendChild(iterInput);
                settingsDiv.appendChild(document.createTextNode(' (по умолчанию 100000)'));

                container.appendChild(settingsDiv);

                // Сохраняем колонки для пометки "из данных"
                window._csvColumns = data.columns;

                modal.style.display = 'flex';
            } else {
                alert('Ошибка загрузки CSV: ' + JSON.stringify(data));
            }
        } catch (err) {
            alert('Ошибка: ' + err);
        }
        fileInput.value = '';
    });

    // ---------- Построение графа (асинхронное) ----------
    const buildBtn = document.getElementById('buildGraphBtn');
    if (buildBtn) {
        buildBtn.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('#columnCheckboxes input[type="checkbox"]:checked');
            const selectedColumns = Array.from(checkboxes).map(cb => cb.value);
            if (selectedColumns.length < 2) {
                alert('Выберите минимум 2 столбца');
                return;
            }

            const algorithm = document.getElementById('algorithmSelect')?.value || 'notears';
            const threshold = parseFloat(document.getElementById('thresholdInput')?.value || 0.05);
            const maxIter = parseInt(document.getElementById('maxIterInput')?.value || 100000);

            modal.style.display = 'none';

            // Показываем спиннер
            const overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                color: white;
                font-size: 18px;
            `;
            overlay.innerHTML = `
                <div class="spinner"></div>
                <p style="margin-top:20px;">⏳ Выполняется алгоритм ${algorithm.toUpperCase()}...</p>
                <p style="font-size:14px; opacity:0.8;">Это может занять до 60 секунд в зависимости от данных и итераций.</p>
            `;
            document.body.appendChild(overlay);

            try {
                const resp = await fetchWithCSRF('/api/discover-graph/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        columns: selectedColumns,
                        algorithm: algorithm,
                        threshold: threshold,
                        max_iter: maxIter
                    })
                });
                const data = await resp.json();

                if (resp.ok) {
                    // Если результат уже есть (из кэша или синхронно)
                    if (data.nodes && data.edges) {
                        applyGraphResult(data);
                        overlay.remove();
                        alert(`✅ Граф построен (${algorithm.toUpperCase()})`);
                        return;
                    }

                    // Если задача запущена асинхронно
                    if (data.status === 'processing' && data.task_id) {
                        pollTask(data.task_id, overlay);
                        return;
                    }

                    overlay.remove();
                    alert('Неизвестный ответ сервера: ' + JSON.stringify(data));
                } else {
                    overlay.remove();
                    alert('Ошибка: ' + JSON.stringify(data));
                }
            } catch (err) {
                overlay.remove();
                alert('Ошибка при отправке запроса: ' + err);
            }
        });
    }

    // ---------- Отмена ----------
    const cancelBtn = document.getElementById('columnCancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => modal.style.display = 'none');
    }
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

// ---------- Вспомогательная функция: опрос статуса задачи ----------
function pollTask(taskId, overlay) {
    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(async () => {
        attempts++;
        try {
            const resp = await fetchWithCSRF(`/api/task/${taskId}/`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!resp.ok) {
                clearInterval(interval);
                overlay.remove();
                alert(`Ошибка получения статуса (${resp.status})`);
                return;
            }
            const data = await resp.json();

            if (data.status === 'completed') {
                clearInterval(interval);
                overlay.remove();
                applyGraphResult(data.result);
                alert('✅ Граф построен!');
            } else if (data.status === 'error') {
                clearInterval(interval);
                overlay.remove();
                alert('Ошибка выполнения: ' + data.error);
            } else if (data.status === 'processing') {
                if (data.progress) {
                    const progressMsg = document.querySelector('#loadingOverlay p:last-child');
                    if (progressMsg) {
                        progressMsg.textContent = `⏳ Выполняется... (${data.progress})`;
                    }
                }
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                overlay.remove();
                alert('Превышено время ожидания (2 минуты). Попробуйте позже.');
            }
        } catch (err) {
            clearInterval(interval);
            overlay.remove();
            alert('Ошибка при опросе статуса: ' + err);
        }
    }, 2000);
}

// ---------- Применение результата к графу ----------
function applyGraphResult(result) {
    state.nodes = result.nodes;
    state.edges = result.edges;
    state.ghostData = {};
    state.flashes = {};
    state.deltas = {};
    state.changedNodes = {};
    state.clickedNodeId = null;
    state.highlightAncestors = [];
    state.highlightDescendants = [];
    draw();
}