// process_videos.js
// Этот файл содержит логику взаимодействия с бэкендом для обработки и получения статусов видео.

// URL вашего бэкенда. Убедитесь, что он соответствует RENDER_BACKEND_URL в results.js.
// Здесь он также должен быть объявлен, так как это отдельный модуль.
const API_BASE_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

/**
 * Отправляет запрос на бэкенд для получения статуса отдельной задачи.
 * @param {string} taskId - ID задачи (Cloudinary ID или аналогичный).
 * @returns {Promise<Object>} Объект с обновленным статусом задачи и данными видео.
 */
export async function getSingleVideoStatus(taskId) { // ЭТА ФУНКЦИЯ БЫЛА ПЕРЕМЕЩЕНА ИЗ results.js
    if (!taskId || typeof taskId !== 'string') {
        console.warn(`[PROCESS_VIDEOS] Некорректный taskId передан в getSingleVideoStatus: ${taskId}. Пропускаем сетевой запрос.`);
        return { id: taskId, status: 'failed', error: 'Некорректный ID задачи.' };
    }
    try {
        console.log(`DEBUG: [PROCESS_VIDEOS] Запрос статуса для индивидуального видео: ${API_BASE_URL}/task-status/${taskId}`);
        const response = await fetch(`${API_BASE_URL}/task-status/${taskId}`);
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`DEBUG: [PROCESS_VIDEOS] Ошибка HTTP при получении статуса индивидуального видео! Статус: ${response.status}, Данные ошибки:`, errorData);
            throw new Error(`Ошибка HTTP! Статус: ${response.status}, Сообщение: ${errorData.error}`);
        }
        const data = await response.json();
        console.log("DEBUG: [PROCESS_VIDEOS] Получены данные статуса индивидуального видео:", data);
        // Убедимся, что возвращаемый ID всегда является строковым ID задачи,
        // который мы использовали для запроса, даже если бэкенд возвращает другие ID.
        return { ...data, id: data.taskId || taskId };
    } catch (error) {
        console.error(`[PROCESS_VIDEOS] Ошибка сети при проверке статуса задачи ${taskId}:`, error);
        return { id: taskId, status: 'failed', error: error.message || 'Ошибка сети/сервера' };
    }
}

/**
 * Асинхронно проверяет статус объединенного видео на бэкенде.
 * @param {string} concatenatedTaskId ID объединенной задачи (строковый, например, 'concatenated_video_xyz').
 * @returns {Promise<object>} Объект с статусом и URL (если готовы).
 */
export async function getConcatenatedVideoStatus(concatenatedTaskId) { // ЭТА ФУНКЦИЯ БЫЛА ПЕРЕМЕЩЕНА ИЗ results.js
    try {
        console.log(`DEBUG: [PROCESS_VIDEOS] Запрос статуса для объединенного видео: ${API_BASE_URL}/concatenated-video-status/${concatenatedTaskId}`);
        const response = await fetch(`${API_BASE_URL}/concatenated-video-status/${concatenatedTaskId}`);
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`DEBUG: [PROCESS_VIDEOS] Ошибка HTTP при получении статуса объединенного видео! Статус: ${response.status}, Данные ошибки:`, errorData);
            throw new Error(`Ошибка HTTP! Статус: ${response.status}, Сообщение: ${errorData.error}`);
        }
        const data = await response.json();
        console.log("DEBUG: [PROCESS_VIDEOS] Получены данные статуса объединенного видео:", data);
        return data; // Ожидаем { status: 'completed'/'pending'/'failed', cloudinary_url: '...', shotstackUrl: '...', posterUrl: '...' }
    } catch (error) {
        console.error(`[PROCESS_VIDEOS] Ошибка сети при проверке статуса объединенного видео ${concatenatedTaskId}:`, error);
        return { status: 'failed', message: 'Ошибка сети/сервера' };
    }
}


/**
 * Отправляет запрос на бэкенд для инициирования обработки или объединения видео.
 * Эта функция теперь обрабатывает логику, которая ранее была в handleProcessSelectedVideos,
 * но фокусируется только на взаимодействии с бэкендом.
 *
 * @param {string[]} taskIdsToProcess Массив ID видео (Cloudinary IDs), которые нужно обработать/объединить.
 * @param {boolean} shouldConnect Флаг, указывающий, нужно ли объединять видео.
 * @param {string} instagram_username Имя пользователя Instagram (для бэкенда).
 * @param {string} email Email пользователя (для бэкенда).
 * @param {string} linkedin_profile LinkedIn профиль пользователя (для бэкенда).
 * @returns {Promise<Object>} Объект с результатом операции (например, concatenated_task_id, initiated_tasks, error).
 */
export async function initiateVideoProcessing( // ЭТА ФУНКЦИЯ ЯВЛЯЕТСЯ ЭКВИВАЛЕНТОМ processVideosFromSelection, ВЫДЕЛЕННЫМ В ОТДЕЛЬНЫЙ МОДУЛЬ
    taskIdsToProcess,
    shouldConnect,
    instagram_username,
    email,
    linkedin_profile
) {
    console.debug('DEBUG: [PROCESS_VIDEOS] initiateVideoProcessing STARTED.');

    if (taskIdsToProcess.length === 0) {
        console.warn('[PROCESS_VIDEOS] Нет видео для обработки. Пропускаем запрос к бэкенду.');
        return { error: 'Нет видео для обработки.' };
    }

    try {
        const payload = {
            task_ids: taskIdsToProcess,
            connect_videos: shouldConnect,
            instagram_username: instagram_username,
            email: email,
            linkedin_profile: linkedin_profile
        };

        console.debug('DEBUG: [PROCESS_VIDEOS] Отправка запроса на /process_videos с payload:', payload);
        const response = await fetch(`${API_BASE_URL}/process_videos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`ERROR: [PROCESS_VIDEOS] Ошибка HTTP при инициировании обработки: ${response.status} -`, errorData);
            throw new Error(errorData.message || 'Неизвестная ошибка при инициировании обработки.');
        }

        const result = await response.json();
        console.debug('DEBUG: [PROCESS_VIDEOS] Ответ от /process_videos:', result);
        return result;

    } catch (error) {
        console.error('ERROR: [PROCESS_VIDEOS] Не удалось инициировать обработку видео:', error);
        return { error: `Ошибка при инициировании обработки: ${error.message}` };
    } finally {
        console.debug('DEBUG: [PROCESS_VIDEOS] initiateVideoProcessing FINISHED.');
    }
}


/**
 * Получает список видео пользователя с бэкенда.
 * @param {string} identifierValue - Значение идентификатора (например, имя пользователя Instagram).
 * @param {string} identifierType - Тип идентификатора (например, 'instagram_username').
 * @returns {Promise<Array>} Массив объектов видео.
 */
export async function fetchUserVideosFromBackend(identifierValue, identifierType) { // ЭТА ФУНКЦИЯ БЫЛА ПЕРЕМЕЩЕНА ИЗ results.js
    console.log(`DEBUG: [PROCESS_VIDEOS] fetchUserVideosFromBackend вызвана с identifierValue: "${identifierValue}", identifierType: "${identifierType}"`);

    let url = `${API_BASE_URL}/user-videos?`;
    if (identifierType === 'instagram_username' && identifierValue) {
        url += `instagram_username=${encodeURIComponent(identifierValue)}`;
    } else if (identifierType === 'email' && identifierValue) {
        url += `email=${encodeURIComponent(identifierValue)}`;
    } else if (identifierType === 'linkedin_profile' && identifierValue) {
        url += `linkedin_profile=${encodeURIComponent(identifierValue)}`;
    } else {
        console.error('ERROR: [PROCESS_VIDEOS] Неверный тип идентификатора или пустое значение.');
        throw new Error('Неверный тип идентификатора или пустое значение.');
    }

    try {
        console.log(`DEBUG: [PROCESS_VIDEOS] Отправка запроса на: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`ERROR: [PROCESS_VIDEOS] Ошибка HTTP при получении видео пользователя! Статус: ${response.status}, Данные ошибки:`, errorData);
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("DEBUG: [PROCESS_VIDEOS] Получены данные о видео пользователя:", data);

        if (!Array.isArray(data)) {
            console.error("ERROR: [PROCESS_VIDEOS] Полученные данные не являются массивом:", data);
            throw new Error('Некорректный формат данных от сервера. Ожидался массив.');
        }
        return data;
    } catch (error) {
        console.error('ERROR: [PROCESS_VIDEOS] Ошибка при получении видео пользователя:', error);
        throw error;
    }
}
