// script/process_videos.js

// Переменные из глобальной области видимости, которые мы будем использовать.
// Предполагается, что RENDER_BACKEND_URL уже определен в upload_validation.js
// и доступен здесь, либо его нужно продублировать. Для ясности, лучше продублировать.
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Убедитесь, что это актуальный URL вашего бэкенда!

/**
 * Отправляет запрос на бэкенд для обработки или объединения выбранных видео.
 * @param {string[]} videoIds Массив ID видео, которые нужно обработать.
 * @param {boolean} connectVideos Флаг, указывающий, нужно ли объединять видео.
 * @param {string} instagramUsername Имя пользователя Instagram.
 * @param {string} email Email пользователя.
 * @param {string} linkedinProfile URL профиля LinkedIn пользователя.
 * @param {function(string, string): void} displayProcessStatus Функция для отображения статуса в секции обработки.
 * @param {function(string, string): void} displayGeneralStatus Функция для отображения общего статуса.
 */
async function processVideosFromSelection(
    videoIds,
    connectVideos,
    instagramUsername,
    email,
    linkedinProfile,
    displayProcessStatus,
    displayGeneralStatus
) {
    if (!videoIds || videoIds.length === 0) {
        displayProcessStatus('No videos selected for processing.', 'error');
        return;
    }

    displayProcessStatus('Initiating video processing...', 'info');
    displayGeneralStatus('Sending request to server...', 'info');

    try {
        const payload = {
            video_ids: videoIds,
            connect_videos: connectVideos,
            instagram_username: instagramUsername,
            email: email,
            linkedin_profile: linkedinProfile
        };

        const response = await fetch(`${RENDER_BACKEND_URL}/process_videos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const result = await response.json();
        
        displayProcessStatus(`Processing initiated for video(s)! Task ID: ${result.process_task_id || 'N/A'}`, 'success');
        displayGeneralStatus('Processing request sent. Redirecting to results in 3 seconds...', 'completed');

        // Очищаем localStorage после успешной отправки запроса на обработку,
        // чтобы результаты на results.html были актуальными для нового запроса.
        // Это спорный момент, и его можно настроить.
        // Если вы хотите, чтобы results.html показывал *только* результаты последней обработки,
        // то очистите localStorage.
        // Если вы хотите, чтобы results.html отображал все когда-либо загруженные видео,
        // то не очищайте.
        // Для данной логики, когда мы отправляем *новый* запрос на обработку,
        // лучше очистить, чтобы результаты на results.html соответствовали этому запросу.
        localStorage.removeItem('uploadedVideos');
        // Возможно, стоит сохранить process_task_id в localStorage, чтобы results.html мог его использовать.
        localStorage.setItem('lastProcessTaskId', result.process_task_id);

        // В `upload_validation.js` мы уже добавили `setTimeout` для перенаправления.
        // Поэтому здесь явное перенаправление не нужно, но можно оставить для отладки.
        // setTimeout(() => {
        //     window.location.replace('results.html');
        // }, 3000);

    } catch (error) {
        console.error('Error in processVideosFromSelection:', error);
        displayProcessStatus(`Failed to initiate processing: ${error.message}`, 'error');
        displayGeneralStatus(`Processing failed. Please check the console for details.`, 'error');
        throw error; // Перебрасываем ошибку, чтобы её можно было поймать в вызывающей функции
    }
}
