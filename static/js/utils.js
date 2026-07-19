// ---------- CSRF-токен ----------
export function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

/**
 * Обёртка для fetch с автоматической подстановкой CSRF-токена
 * для методов POST, PUT, DELETE, PATCH.
 */
export async function fetchWithCSRF(url, options = {}) {
    const csrfToken = getCSRFToken();
    const headers = options.headers || {};

    // Добавляем CSRF-токен только для методов, изменяющих состояние
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        headers['X-CSRFToken'] = csrfToken;
    }

    // Если тело не FormData, устанавливаем Content-Type: application/json
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const config = {
        ...options,
        headers: headers,
        credentials: 'include', // обязательно для отправки cookies
    };

    return fetch(url, config);
}

// ---------- Остальные утилиты ----------
export function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1,
        dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx,
        projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
}