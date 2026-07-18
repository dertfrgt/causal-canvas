import { state } from './state.js';
import { draw } from './draw.js';
import { applyCascade } from './cascade.js';
import { updateNodeProps } from './api.js';

export function initModals() {
    const modal = document.getElementById('editNodeModal');
    const applyBtn = document.getElementById('modalApplyBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const transformSelect = document.getElementById('modalTransformType');
    const formulaField = document.getElementById('formulaField');

    if (transformSelect) {
        transformSelect.addEventListener('change', () => {
            formulaField.style.display = (transformSelect.value === 'custom') ? 'block' : 'none';
        });
    }

    if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
            const node = state.nodes.find(n => n.id === state.editingNodeId);
            if (!node) return;

            const newName = document.getElementById('modalNodeName').value.trim();
            const newColor = document.getElementById('modalNodeColor').value;
            const newTransformType = document.getElementById('modalTransformType').value;
            const newFormula = document.getElementById('modalFormula').value.trim();
            const newValueInput = document.getElementById('modalNodeValue').value;
            const newValue = newValueInput !== '' ? parseFloat(newValueInput) : null;

            if (!newName) {
                alert('Имя не может быть пустым');
                return;
            }

            const updateData = {
                name: newName,
                color: newColor,
                transform_type: newTransformType,
                transform_formula: (newTransformType === 'custom') ? newFormula : ''
            };
            const updated = await updateNodeProps(state.editingNodeId, updateData);
            if (updated) {
                node.name = updated.name;
                node.color = updated.color;
                node.transform_type = updated.transform_type;
                node.transform_formula = updated.transform_formula;
            } else {
                modal.style.display = 'none';
                return;
            }

            if (state.isSimulation && newValue !== null && !isNaN(newValue) && newValue >= 0) {
                const oldValues = {};
                state.nodes.forEach(n => { oldValues[n.id] = n.value; });
                await applyCascade(state.editingNodeId, newValue, oldValues);
            }

            modal.style.display = 'none';
            draw();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // ----- Добавляем пометку "из данных" при открытии модалки -----
    const originalModalTitle = document.getElementById('modalTitle');
    // Перехватываем открытие модалки из interactions.js (через изменение display)
    // Делаем это через MutationObserver или просто при каждом открытии проверяем.
    // Проще: добавим в обработчик открытия в interactions.js, но лучше здесь через наблюдение.
    const observer = new MutationObserver(() => {
        if (modal.style.display === 'flex') {
            const node = state.nodes.find(n => n.id === state.editingNodeId);
            if (node && window._csvColumns && window._csvColumns.includes(node.name)) {
                // Узел из данных
                const title = document.getElementById('modalTitle');
                if (!title.textContent.includes('📊')) {
                    title.textContent = '📊 ' + title.textContent.replace('✏️ ', '') + ' (из данных)';
                }
            }
        }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
}