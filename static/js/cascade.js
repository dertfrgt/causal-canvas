import { state } from './state.js';
import { draw } from './draw.js';

export async function applyCascade(nodeId, newValue, oldValuesMap) {
    if (!state.isSimulation) return;
    try {
        const resp = await fetch(`/api/apply_cascade/${nodeId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: newValue })
        });
        const data = await resp.json();

        const oldValues = oldValuesMap || {};
        const newGhostData = {};
        const newChanged = {};
        for (let [id, val] of Object.entries(data.changes)) {
            const node = state.nodes.find(n => n.id == id);
            if (node) {
                const oldVal = oldValues[id] !== undefined ? oldValues[id] : node.value;
                if (Math.abs(oldVal - val) > 0.001) {
                    newGhostData[id] = {
                        oldValue: oldVal,
                        oldX: node.x,
                        oldY: node.y,
                        color: node.color
                    };
                    state.deltas[id] = { value: val - oldVal };
                    newChanged[id] = { oldValue: oldVal, newValue: val, delta: val - oldVal };
                }
            }
        }

        // Анимация значений
        if (state.animationId) {
            cancelAnimationFrame(state.animationId);
            state.animationId = null;
        }
        state.animations = [];
        for (let [id, newVal] of Object.entries(data.changes)) {
            const node = state.nodes.find(n => n.id == id);
            if (node) {
                const startVal = oldValues[id] !== undefined ? oldValues[id] : node.value;
                state.animations.push({
                    node: node,
                    startValue: startVal,
                    endValue: newVal,
                    progress: 0,
                    duration: 400
                });
            }
        }
        if (state.animations.length > 0) {
            startAnimation();
        } else {
            draw();
        }

        state.flashes = {};
        for (let [id, origins] of Object.entries(data.origins)) {
            if (origins.length > 0) {
                const colors = origins.map(oid => {
                    const srcNode = state.nodes.find(n => n.id == oid);
                    return srcNode ? srcNode.color : '#ccc';
                });
                state.flashes[id] = colors;
            }
        }
        state.ghostData = newGhostData;
        state.changedNodes = newChanged;

        if (state.deltaTimeout) clearTimeout(state.deltaTimeout);
        state.deltaTimeout = setTimeout(() => {
            state.deltas = {};
            draw();
        }, 2000);

        // ... (вывод сообщения в консоль)
    } catch (err) {
        alert('Ошибка при обновлении: ' + err);
    }
}

function startAnimation() {
    function animate(timestamp) {
        let anyActive = false;
        for (let anim of state.animations) {
            if (anim.progress < 1) {
                anyActive = true;
                anim.progress += 16 / anim.duration;
                if (anim.progress > 1) anim.progress = 1;
                // Easing (ease-in-out кубическое)
                const eased = anim.progress < 0.5 ? 4 * anim.progress * anim.progress * anim.progress : 1 - Math.pow(-2 * anim.progress + 2, 3) / 2;
                const currentValue = anim.startValue + (anim.endValue - anim.startValue) * eased;
                anim.node.value = currentValue;
            }
        }
        draw();
        if (anyActive) {
            state.animationId = requestAnimationFrame(animate);
        } else {
            state.animationId = null;
        }
    }
    state.animationId = requestAnimationFrame(animate);
}