// process_videos.js
// Этот файл содержит логику взаимодействия с бэкендом для обработки и получения статусов видео.

const API_BASE_URL = 'https://video-meta-api.onrender.com';

/**
 * Универсальная функция для выполнения API-запросов.
 * @param {string} endpoint - Конечная точка API (например, '/user-videos').
 * @param {object} options - Опции для fetch() (method, headers, body).
 * @returns {Promise<any>} Результат запроса в формате JSON.
 */
async function request(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { message: (await response.text()) || 'Произошла неизвестная ошибка сервера.' };
            }
            throw new Error(errorData.message);
        }

        if (response.status === 204) { // No Content
            return null;
        }
        return response.json();

    } catch (error) {
        console.error(`Ошибка API запроса к ${API_BASE_URL}${endpoint}:`, error);
        throw error;
    }
}

/**
 * Отправляет запрос на бэкенд для получения статуса задачи (любой).
 * @param {string} taskId - ID задачи.
 * @returns {Promise<Object>} Объект с обновленным статусом задачи.
 */
export function getTaskStatus(taskId) {
    if (!taskId || typeof taskId !== 'string') {
        console.warn(`Некорректный taskId: ${taskId}`);
        return Promise.reject(new Error('Некорректный ID задачи.'));
    }
    // Мы объединили getSingleVideoStatus и getConcatenatedVideoStatus,
    // так как бэкенд все равно обрабатывает их через один эндпоинт.
    return request(`/task-status/${taskId}`);
}

/**
 * Инициирует обработку или объединение видео.
 * @param {string[]} taskIdsToProcess - Массив ID видео.
 * @param {boolean} shouldConnect - Флаг, указывающий, нужно ли объединять видео.
 * @param {object} userIdentifier - Объект с данными пользователя (instagram_username, email, etc.).
 * @returns {Promise<Object>} Объект с результатом операции.
 */
export function initiateVideoProcessing(taskIdsToProcess, shouldConnect, userIdentifier) {
    if (!taskIdsToProcess || taskIdsToProcess.length === 0) {
        return Promise.reject(new Error('Нет видео для обработки.'));
    }

    const payload = {
        task_ids: taskIdsToProcess,
        connect_videos: shouldConnect,
        ...userIdentifier
    };

    return request('/process_videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/**
 * Получает список видео пользователя с бэкенда.
 * @param {object} userIdentifier - Объект с одним ключом: instagram_username, email или linkedin_profile.
 * @returns {Promise<Array>} Массив объектов видео.
 */
export function fetchUserVideosFromBackend(userIdentifier) {
    if (!userIdentifier || Object.keys(userIdentifier).length === 0) {
        return Promise.reject(new Error('Необходимо предоставить идентификатор пользователя.'));
    }
    // Используем URLSearchParams для безопасного создания строки запроса
    const params = new URLSearchParams(userIdentifier);
    return request(`/user-videos?${params.toString()}`);
}

/**
 * Отправляет запрос на бэкенд для удаления видео.
 * @param {string} videoId - Идентификатор видео для удаления (Cloudinary public_id).
 * @param {object} userIdentifier - Идентификаторы пользователя для проверки прав.
 * @returns {Promise<Object>} Результат операции удаления.
 */
export function deleteVideo(videoId, userIdentifier) {
    const params = new URLSearchParams(userIdentifier);
    return request(`/delete_video/${videoId}?${params.toString()}`, {
        method: 'DELETE'
    });
}
