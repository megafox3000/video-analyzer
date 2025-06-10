// script/process_videos.js
console.log("DEBUG: process_videos.js loaded and executing.");

/**
 * Отправляет запрос на бэкенд для обработки или объединения выбранных видео.
 * @param {string[]} videoIds Массив ID видео, которые нужно обработать.
 * @param {boolean} connectVideos Флаг, указывающий, нужно ли объединять видео.
 * @param {string} instagramUsername Имя пользователя Instagram.
 * @param {string} email Email пользователя.
 * @param {string} linkedinProfile URL профиля LinkedIn пользователя.
 * @param {function(string, string): void} displayProcessStatus Функция для отображения статуса (используется для внутреннего статуса в этом файле).
 * @param {function(string, string): void} displayGeneralStatus Функция для отображения общего статуса (передаётся для использования в results.js).
 * @returns {Promise<Object|null>} Результат от бэкенда или null в случае ошибки.
 */
async function processVideosFromSelection(
    videoIds,
    connectVideos,
    instagramUsername,
    email,
    linkedinProfile,
    displayProcessStatus, // Это будет отображаться в results.js
    displayGeneralStatus
) {
    // Внутреннее отображение статуса в этом модуле, если нужно
    displayProcessStatus('Инициируем обработку видео...', 'info');
    displayGeneralStatus('Отправляем запрос на сервер...', 'info'); // Используем переданную функцию

    if (!videoIds || videoIds.length === 0) {
        displayProcessStatus('Не выбрано видео для обработки.', 'error');
        displayGeneralStatus('Обработка не инициирована: нет выбранных видео.', 'error');
        return null; // Возвращаем null на случай ошибки для лучшей обработки в results.js
    }

    try {
        const payload = {
            task_ids: videoIds, // Изменено с video_ids на task_ids, чтобы соответствовать бэкенду
            connect_videos: connectVideos,
            instagram_username: instagramUsername,
            email: email,
            linkedin_profile: linkedinProfile
        };

        // RENDER_BACKEND_URL должен быть доступен глобально или передан
        // Предполагаем, что он доступен из результатов.js, который его инициирует
        const response = await fetch(`${RENDER_BACKEND_URL}/process_videos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
        }

        const result = await response.json();
        
        displayProcessStatus(`Обработка инициирована для видео! ID задачи: ${result.concatenated_task_id || result.message}`, 'success');
        displayGeneralStatus('Запрос на обработку отправлен. Статусы скоро обновятся.', 'completed'); // Обновленное сообщение

        // Логика управления localStorage (удаление/установка lastProcessTaskId)
        // Теперь находится в results.js, который вызывает эту функцию.
        // Здесь мы просто возвращаем результат для обработки в results.js.

        return result; // Возвращаем результат от бэкенда для results.js, чтобы тот обновил localStorage
    } catch (error) {
        console.error('Ошибка в processVideosFromSelection:', error);
        displayProcessStatus(`Не удалось инициировать обработку: ${error.message}`, 'error');
        displayGeneralStatus(`Обработка не удалась. Пожалуйста, проверьте консоль для деталей.`, 'error');
        throw error; // Перебрасываем ошибку, чтобы results.js мог её перехватить и обновить UI
    }
}

// Экспортируем функцию, чтобы её могли импортировать другие модули
export { processVideosFromSelection };
