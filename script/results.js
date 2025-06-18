// script/results.js
// Глобальные переменные для доступа к элементам DOM
const DOM_ELEMENTS = {
    resultsHeader: document.getElementById('resultsHeader'),
    usernameDisplay: document.getElementById('usernameDisplay'),
    bubblesContainer: document.getElementById('bubblesContainer'),
    videoFileInput: document.getElementById('videoFileInput'),
    uploadNewBtn: document.getElementById('uploadNewBtn'),
    metadataModal: document.getElementById('metadataModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMetadata: document.getElementById('modalMetadata'),
    closeButton: document.querySelector('.modal .close-button'),
    uploadStatusText: document.getElementById('uploadStatusText'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    dynamicUploadStatusContainer: document.getElementById('dynamicUploadStatusContainer'),
    finishSessionBtn: document.getElementById('finishSessionBtn'),
    // Элементы для объединения видео
    connectVideosCheckbox: document.getElementById('connectVideosCheckbox'),
    processSelectedVideosButton: document.getElementById('processSelectedVideosButton'),
    concatenationStatusDiv: document.getElementById('concatenationStatusDiv')
};

// Глобальная переменная для хранения информации о загруженных видео
let uploadedVideos = [];
// Глобальная переменная для хранения выбранных видео для объединения
let selectedVideosForConcatenation = [];
// Таймер для проверки статусов задач
let statusCheckInterval;
// Таймер неактивности
let inactivityTimer;

// Переменная для URL бэкенда.
// Предполагается, что она будет инициализирована из конфигурации или передана
const RENDER_BACKEND_URL = 'https://hife-backend.onrender.com'; // Убедитесь, что это правильный URL вашего бэкенда

// Импортируем функцию processVideosFromSelection из отдельного файла
import { processVideosFromSelection } from './process_videos.js';
// Импортируем функцию uploadFileFromResults из отдельного файла
import { uploadFileFromResults } from './cloudinary_upload.js'; // Убедитесь, что это правильный путь

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================

/**
 * Санитизирует HTML-строку для предотвращения XSS-атак.
 * @param {string} str Входная строка.
 * @returns {string} Санитизированная строка.
 */
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

/**
 * Обновляет отображение общего статуса загрузки/обработки.
 * @param {string} message Сообщение для отображения.
 * @param {'info'|'success'|'error'|'pending'} type Тип сообщения (для стилизации).
 */
function displayGeneralStatus(message, type) {
    if (DOM_ELEMENTS.uploadStatusText) {
        DOM_ELEMENTS.uploadStatusText.textContent = message;
        DOM_ELEMENTS.uploadStatusText.className = `status-message ${type}`;
    }
}

/**
 * Сбрасывает прогресс-бар и скрывает его.
 */
function resetProgressBar() {
    if (DOM_ELEMENTS.progressBar) DOM_ELEMENTS.progressBar.style.width = '0%';
    if (DOM_ELEMENTS.progressText) DOM_ELEMENTS.progressText.textContent = '0%';
    if (DOM_ELEMENTS.progressBar && DOM_ELEMENTS.progressBar.parentElement) {
        DOM_ELEMENTS.progressBar.parentElement.style.display = 'none';
    }
}

/**
 * Обновляет состояние прогресс-бара.
 * @param {number} percentage Процент выполнения (0-100).
 */
function updateProgressBar(percentage) {
    if (DOM_ELEMENTS.progressBar && DOM_ELEMENTS.progressText) {
        DOM_ELEMENTS.progressBar.parentElement.style.display = 'flex'; // Показываем контейнер
        DOM_ELEMENTS.progressBar.style.width = `${percentage}%`;
        DOM_ELEMENTS.progressText.textContent = `${percentage}%`;
    }
}

/**
 * Сбрасывает таймер неактивности.
 */
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        // Логика для автоматического завершения сессии
        localStorage.removeItem('hifeUsername');
        localStorage.removeItem('hifeEmail');
        localStorage.removeItem('hifeLinkedin');
        localStorage.removeItem('uploadedVideos');
        console.log("Сессия завершена из-за неактивности. Локальное хранилище очищено.");
        window.location.replace('index.html');
    }, 10 * 60 * 1000); // 10 минут неактивности
}

// Прикрепляем слушателей событий для сброса таймера неактивности
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer);
});

// =============================================================================
// ЛОГИКА УПРАВЛЕНИЯ ПУЗЫРЬКАМИ ВИДЕО
// =============================================================================

/**
 * Создает или обновляет DOM-элемент "пузырька" для видео.
 * @param {string} id ID видео (Cloudinary public ID или уникальный ID для объединенного видео).
 * @param {Object} videoData Данные видео.
 */
function createOrUpdateBubble(id, videoData) {
    console.log(`DEBUG: [createOrUpdateBubble] Processing video ID: ${id}, Status: ${videoData.status}`);

    let bubble = document.getElementById(`bubble-${id}`);
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = `bubble-${id}`;
        bubble.classList.add('video-bubble');
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.appendChild(bubble);
        }
        console.log(`DEBUG: [createOrUpdateBubble] Created new bubble for ID: ${id}`);
    } else {
        console.log(`DEBUG: [createOrUpdateBubble] Updating existing bubble for ID: ${id}`);
    }

    // Обновляем классы для статуса
    bubble.className = `video-bubble ${videoData.status}`;

    let content = `
        <div class="video-info">
            <h3 class="video-title">${sanitizeHTML(videoData.original_filename || 'Неизвестное видео')}</h3>
            <p class="video-status">Статус: <span class="status-text">${formatStatus(videoData.status)}</span></p>
            ${videoData.message ? `<p class="video-message">Сообщение: ${sanitizeHTML(videoData.message)}</p>` : ''}
            ${videoData.timestamp ? `<p class="video-date">Загружено: ${new Date(videoData.timestamp).toLocaleString()}</p>` : ''}
        </div>
    `;

    // Добавляем предпросмотр видео или заглушку
    if (videoData.cloudinary_url && (videoData.status === 'completed' || videoData.status === 'downloaded' || videoData.status === 'shotstack_completed')) {
        const videoSrc = videoData.shotstackUrl || videoData.cloudinary_url; // Предпочтительно Shotstack URL, если есть
        content += `
            <div class="video-preview-wrapper">
                <video class="video-preview" controls preload="metadata" poster="${videoData.posterUrl || ''}">
                    <source src="${videoSrc}" type="video/mp4">
                    Ваш браузер не поддерживает тег видео.
                </video>
            </div>
            <div class="bubble-actions">
                <a href="${videoSrc}" target="_blank" class="download-link">Скачать Видео</a>
                <button class="view-metadata-btn" data-id="${id}">Показать метаданные</button>
                <button class="delete-video-btn" data-id="${id}">Удалить</button>
            </div>
        `;
    } else if (videoData.status === 'error' || videoData.status === 'failed') {
        content += `
            <div class="video-preview-wrapper error-preview">
                <p>Предпросмотр недоступен из-за ошибки.</p>
            </div>
            <div class="bubble-actions">
                <button class="view-metadata-btn" data-id="${id}">Показать метаданные</button>
                <button class="delete-video-btn" data-id="${id}">Удалить</button>
            </div>
        `;
    } else { // Для статусов, где видео еще не готово или обрабатывается
        content += `
            <div class="video-preview-wrapper processing-preview">
                <p>Видео в обработке...</p>
                <div class="spinner"></div>
            </div>
            <div class="bubble-actions">
                <button class="view-metadata-btn" data-id="${id}" ${!videoData.metadata || Object.keys(videoData.metadata).length === 0 ? 'disabled' : ''}>Показать метаданные</button>
                <button class="delete-video-btn" data-id="${id}">Удалить</button>
            </div>
        `;
    }
    bubble.innerHTML = content;

    // Добавляем слушатели событий
    const viewMetadataBtn = bubble.querySelector(`.view-metadata-btn[data-id="${id}"]`);
    if (viewMetadataBtn) {
        viewMetadataBtn.onclick = () => showMetadataModal(id);
    }

    const deleteVideoBtn = bubble.querySelector(`.delete-video-btn[data-id="${id}"]`);
    if (deleteVideoBtn) {
        deleteVideoBtn.onclick = () => deleteVideo(id);
    }
}

/**
 * Форматирует строковый статус для отображения.
 * @param {string} status Исходный статус.
 * @returns {string} Отформатированный статус.
 */
function formatStatus(status) {
    const statusMap = {
        'uploaded': 'Загружено на Cloudinary',
        'downloaded': 'Скачано для обработки',
        'processing': 'Обрабатывается',
        'completed': 'Завершено',
        'error': 'Ошибка',
        'failed': 'Ошибка обработки',
        'shotstack_pending': 'В очереди Shotstack',
        'shotstack_completed': 'Обработано Shotstack',
        'shotstack_failed': 'Ошибка Shotstack',
        'concatenated_pending': 'Объединение в процессе',
        'concatenated_completed': 'Объединено',
        'concatenated_failed': 'Ошибка объединения'
    };
    return statusMap[status] || status; // Возвращаем исходный статус, если нет в карте
}

/**
 * Отображает модальное окно с метаданными.
 * @param {string} videoId ID видео.
 */
function showMetadataModal(videoId) {
    console.log(`DEBUG: Showing metadata for video ID: ${videoId}`);
    const video = uploadedVideos.find(v => v.id === videoId);

    if (video && DOM_ELEMENTS.metadataModal && DOM_ELEMENTS.modalTitle && DOM_ELEMENTS.modalMetadata) {
        DOM_ELEMENTS.modalTitle.textContent = `Метаданные для: ${sanitizeHTML(video.original_filename || 'Неизвестное видео')}`;
        DOM_ELEMENTS.modalMetadata.textContent = JSON.stringify(video.metadata || {}, null, 2);
        DOM_ELEMENTS.metadataModal.style.display = 'block';
    } else {
        console.error('ERROR: Video not found or modal elements missing for ID:', videoId);
        displayGeneralStatus('Не удалось отобразить метаданные. Видео не найдено или элементы модального окна отсутствуют.', 'error');
    }
}

/**
 * Отправляет запрос на удаление видео на бэкенд и обновляет UI.
 * @param {string} videoId ID видео для удаления.
 */
async function deleteVideo(videoId) {
    console.log(`DEBUG: Attempting to delete video ID: ${videoId}`);
    const confirmation = confirm('Вы уверены, что хотите удалить это видео?'); // Использовать кастомный модал вместо confirm
    if (!confirmation) {
        console.log('DEBUG: Video deletion cancelled by user.');
        return;
    }

    displayGeneralStatus('Удаление видео...', 'info');

    try {
        const url = `${RENDER_BACKEND_URL}/delete_video?task_id=${encodeURIComponent(videoId)}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
        }

        const result = await response.json();
        console.log('DEBUG: Delete API response:', result);

        // Удаляем видео из локального массива и из DOM
        uploadedVideos = uploadedVideos.filter(v => v.id !== videoId);
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

        const bubbleToRemove = document.getElementById(`bubble-${videoId}`);
        if (bubbleToRemove) {
            DOM_ELEMENTS.bubblesContainer.removeChild(bubbleToRemove);
            console.log(`DEBUG: Bubble for ID ${videoId} removed from DOM.`);
        }

        displayGeneralStatus('Видео успешно удалено!', 'success');
        updateConcatenationUI(); // Обновляем UI объединения после удаления
    } catch (error) {
        console.error('ERROR: Ошибка при удалении видео:', error);
        displayGeneralStatus(`Не удалось удалить видео: ${sanitizeHTML(error.message)}.`, 'error');
    }
}

// =============================================================================
// ЛОГИКА ПРОВЕРКИ СТАТУСОВ ВИДЕО
// =============================================================================

/**
 * Проверяет статусы видео на бэкенде и обновляет UI.
 */
async function checkTaskStatuses() {
    console.log("DEBUG: [checkTaskStatuses] Started. Current uploadedVideos:", uploadedVideos);

    // Filter out videos that are already 'completed', 'shotstack_completed', 'concatenated_completed', 'error', 'failed', 'shotstack_failed', 'concatenated_failed'
    const pendingVideos = uploadedVideos.filter(v =>
        v.status !== 'completed' &&
        v.status !== 'shotstack_completed' &&
        v.status !== 'concatenated_completed' &&
        v.status !== 'error' &&
        v.status !== 'failed' &&
        v.status !== 'shotstack_failed' &&
        v.status !== 'concatenated_failed'
    );

    console.log("DEBUG: [checkTaskStatuses] Pending videos for status check:", pendingVideos);

    if (pendingVideos.length === 0) {
        console.log("DEBUG: [checkTaskStatuses] No pending videos. Clearing interval.");
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
        updateConcatenationUI(); // Обновляем UI объединения, если все задачи завершены
        return;
    }

    // Если интервал еще не установлен, устанавливаем его
    if (!statusCheckInterval) {
        statusCheckInterval = setInterval(checkTaskStatuses, 5000); // Каждые 5 секунд
        console.log("DEBUG: [checkTaskStatuses] Interval set.");
    }

    for (const video of pendingVideos) {
        try {
            console.log(`DEBUG: [checkTaskStatuses] Checking status for video ID: ${video.id}`);
            const url = `${RENDER_BACKEND_URL}/video_status?task_id=${encodeURIComponent(video.id)}`;
            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`ERROR: [checkTaskStatuses] Failed to fetch status for ${video.id}:`, errorData);
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`DEBUG: [checkTaskStatuses] Status for ${video.id} received:`, data);

            // Обновляем статус видео в uploadedVideos
            const index = uploadedVideos.findIndex(v => v.id === video.id);
            if (index !== -1) {
                const oldStatus = uploadedVideos[index].status;
                const newStatus = data.status || oldStatus;
                uploadedVideos[index].status = newStatus;
                uploadedVideos[index].message = data.message || uploadedVideos[index].message;
                uploadedVideos[index].cloudinary_url = data.cloudinary_url || uploadedVideos[index].cloudinary_url;
                uploadedVideos[index].shotstackRenderId = data.shotstackRenderId || uploadedVideos[index].shotstackRenderId;
                uploadedVideos[index].shotstackUrl = data.shotstackUrl || uploadedVideos[index].shotstackUrl;
                uploadedVideos[index].metadata = data.metadata || uploadedVideos[index].metadata || {};
                uploadedVideos[index].posterUrl = data.posterUrl || uploadedVideos[index].posterUrl;

                if (oldStatus !== newStatus) {
                    console.log(`DEBUG: [checkTaskStatuses] Status changed for ${video.id}: ${oldStatus} -> ${newStatus}`);
                    createOrUpdateBubble(video.id, uploadedVideos[index]); // Обновляем DOM
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos)); // Сохраняем
                }
            }
        } catch (error) {
            console.error(`ERROR: [checkTaskStatuses] Error checking status for video ID ${video.id}:`, error);
            const index = uploadedVideos.findIndex(v => v.id === video.id);
            if (index !== -1) {
                uploadedVideos[index].status = 'error'; // Помечаем как ошибку, если запрос не удался
                uploadedVideos[index].message = `Ошибка получения статуса: ${error.message}`;
                createOrUpdateBubble(video.id, uploadedVideos[index]);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
            }
        }
    }
    updateConcatenationUI(); // Обновляем UI объединения после каждой итерации проверки статусов
}

// =============================================================================
// ЛОГИКА ЗАГРУЗКИ ВИДЕО СО СТРАНИЦЫ РЕЗУЛЬТАТОВ
// =============================================================================

/**
 * Загружает выбранный файл видео на Cloudinary со страницы результатов.
 * @param {File} file Выбранный файл видео.
 */
async function uploadVideoFromResults(file) {
    console.log("DEBUG: [uploadVideoFromResults] Initiating upload from results page.");
    displayGeneralStatus('Начинаем загрузку нового видео...', 'info');
    updateProgressBar(0);

    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');
    const linkedin = localStorage.getItem('hifeLinkedin');

    if (!username && !email && !linkedin) {
        displayGeneralStatus('Ошибка: Не найдены данные пользователя. Невозможно загрузить видео.', 'error');
        resetProgressBar();
        return;
    }

    try {
        const response = await uploadFileFromResults(
            file,
            username,
            email,
            linkedin,
            (progress) => {
                updateProgressBar(Math.round(progress));
                displayGeneralStatus(`Загрузка: ${Math.round(progress)}%`, 'info');
            },
            RENDER_BACKEND_URL // Передаем URL бэкенда в uploadFileFromResults
        );

        if (response && response.success) {
            displayGeneralStatus('Видео успешно загружено на Cloudinary!', 'success');
            // Добавляем новое видео в наш массив и DOM
            const newVideo = {
                id: response.taskId,
                original_filename: file.name,
                status: 'uploaded',
                timestamp: new Date().toISOString(),
                cloudinary_url: response.cloudinary_url,
                message: 'Загружено на Cloudinary, ожидается дальнейшая обработка.',
                metadata: {},
                posterUrl: null
            };
            uploadedVideos.push(newVideo);
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
            createOrUpdateBubble(newVideo.id, newVideo);
            checkTaskStatuses(); // Начинаем проверять статус нового видео
            updateConcatenationUI(); // Обновляем UI объединения
        } else {
            const errorMessage = response.error || 'Неизвестная ошибка загрузки.';
            displayGeneralStatus(`Ошибка при загрузке: ${sanitizeHTML(errorMessage)}`, 'error');
            resetProgressBar();
        }
    } catch (error) {
        console.error('ERROR: Неожиданная ошибка при загрузке видео:', error);
        displayGeneralStatus(`Неожиданная ошибка при загрузке: ${sanitizeHTML(error.message)}`, 'error');
        resetProgressBar();
    }
}

// =============================================================================
// ЛОГИКА УПРАВЛЕНИЯ UI ОБЪЕДИНЕНИЯ ВИДЕО
// =============================================================================

/**
 * Обновляет состояние кнопки "Обработать выбранные видео" и статус сообщений.
 * Теперь состояние чекбокса "Объединить видео" учитывается.
 */
function updateConcatenationUI() {
    console.log("DEBUG: [updateConcatenationUI] Called.");

    // ДОБАВЛЕНО: Логируем текущее состояние uploadedVideos
    console.log("DEBUG: [updateConcatenationUI] Current uploadedVideos array:", uploadedVideos);

    const completedVideos = uploadedVideos.filter(v => v.status === 'completed' && !String(v.id).startsWith('concatenated_video_'));
    const numCompletedVideos = completedVideos.length;

    console.log("DEBUG: [updateConcatenationUI] Number of completed videos (excluding concatenated):", numCompletedVideos);

    // Получаем фактическое состояние чекбокса "Объединить видео"
    const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;
    console.log("DEBUG: [updateConcatenationUI] shouldConnect (actual checkbox state):", shouldConnect);

    if (!DOM_ELEMENTS.processSelectedVideosButton || !DOM_ELEMENTS.concatenationStatusDiv || !DOM_ELEMENTS.connectVideosCheckbox) {
        console.error("ERROR: [updateConcatenationUI] Missing one or more key DOM elements for concatenation UI.");
        return; // Выходим, если элементов нет
    }

    // Управление состоянием чекбокса "Объединить видео"
    if (numCompletedVideos < 2) {
        DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
        if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
            DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '0.5';
            DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'not-allowed';
        }
        console.log("DEBUG: [updateConcatenationUI] Connect checkbox disabled (less than 2 completed videos).");
    } else {
        DOM_ELEMENTS.connectVideosCheckbox.disabled = false;
        if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
            DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '1';
            DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'pointer';
        }
        console.log("DEBUG: [updateConcatenationUI] Connect checkbox enabled (2+ completed videos).");
    }

    // Проверяем, есть ли активные задачи обработки/объединения
    const anyVideoProcessing = uploadedVideos.some(v => v.status === 'processing' || v.status === 'shotstack_pending' || v.status === 'concatenated_pending');
    console.log("DEBUG: [updateConcatenationUI] Any video processing in background:", anyVideoProcessing);

    if (anyVideoProcessing) {
        DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
        DOM_ELEMENTS.connectVideosCheckbox.disabled = true; // Отключаем чекбокс во время обработки
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Видео обрабатываются. Пожалуйста, подождите.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status pending';
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'inline-block'; // Показываем кнопку, но она отключена
        console.log("DEBUG: [updateConcatenationUI] Active video processing detected. Both button and checkbox disabled.");
        return; // Выходим, так как есть активные задачи
    }


    // Логика для кнопки "Обработать/Объединить" и статусного сообщения
    if (numCompletedVideos === 0) {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'none';
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Нет готовых видео для обработки или объединения. Загрузите видео.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
        DOM_ELEMENTS.processSelectedVideosButton.disabled = true; // Убедиться, что она отключена, даже если display:none
        console.log("DEBUG: [updateConcatenationUI] No completed videos. Button hidden, disabled.");
    } else {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'inline-block';
        if (shouldConnect) { // Если чекбокс "Объединить" включен
            if (numCompletedVideos < 2) {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Объединить видео';
                DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Для объединения необходимо 2 или более завершенных видео.';
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
                console.log("DEBUG: [updateConcatenationUI] Connect option checked, but less than 2 completed. Button disabled.");
            } else {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = `Объединить все ${numCompletedVideos} видео`;
                DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к объединению всех ${numCompletedVideos} завершенных видео.`;
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status success';
                console.log("DEBUG: [updateConcatenationUI] Ready to concatenate all completed videos. Button enabled.");
            }
        } else { // Если чекбокс "Объединить" выключен (т.е. индивидуальная обработка)
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            DOM_ELEMENTS.processSelectedVideosButton.textContent = `Обработать все ${numCompletedVideos} видео`;
            DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к индивидуальной обработке всех ${numCompletedVideos} видео.`;
            DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
            console.log("DEBUG: [updateConcatenationUI] Ready for individual processing of all completed videos. Button enabled.");
        }
    }
}

/**
 * Fetches user videos from the backend using the provided identifier.
 * @param {string} identifierValue The value of the identifier (e.g., Instagram username).
 * @param {string} identifierType The type of identifier (e.g., 'instagram_username').
 */
async function fetchUserVideos(identifierValue, identifierType) {
    // DEBUG: Логируем вызов функции и переданные аргументы
    console.log(`DEBUG: [fetchUserVideos] Вызвана с identifierValue: "${identifierValue}", identifierType: "${identifierType}"`);

    displayGeneralStatus('Загрузка ваших видео...', 'info');
    let url = `${RENDER_BACKEND_URL}/user-videos?`;

    // Построение URL запроса на основе типа идентификатора
    if (identifierType === 'instagram_username' && identifierValue) {
        url += `instagram_username=${encodeURIComponent(identifierValue)}`;
    } else if (identifierType === 'email' && identifierValue) {
        url += `email=${encodeURIComponent(identifierValue)}`;
    } else if (identifierType === 'linkedin_profile' && identifierValue) {
        url += `linkedin_profile=${encodeURIComponent(identifierValue)}`;
    } else {
        displayGeneralStatus('Ошибка: Неверный тип идентификатора или пустое значение.', 'error');
        console.error('ERROR: [fetchUserVideos] Неверный тип идентификатора или пустое значение.');
        return;
    }

    try {
        // DEBUG: Логируем URL запроса
        console.log(`DEBUG: [fetchUserVideos] Отправка запроса на: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            // DEBUG: Логируем ошибки HTTP
            console.error(`DEBUG: [fetchUserVideos] Ошибка HTTP! Статус: ${response.status}, Данные ошибки:`, errorData);
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // DEBUG: Логируем полученные данные
        console.log("DEBUG: [fetchUserVideos] Получены данные о видео:", data);

        // Проверяем, является ли data массивом
        if (!Array.isArray(data)) {
            console.error("ERROR: [fetchUserVideos] Полученные данные не являются массивом:", data);
            displayGeneralStatus('Ошибка: Некорректный формат данных от сервера. Ожидался массив.', 'error');
            return;
        }

        // Очищаем текущие пузырьки и список
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = ''; // Очищаем DOM
        }
        uploadedVideos = []; // Очищаем глобальный массив uploadedVideos
        localStorage.removeItem('uploadedVideos'); // Очищаем localStorage
        selectedVideosForConcatenation = []; // Очищаем выбор при новой загрузке

        if (data.length > 0) {
            // DEBUG: Логируем, если видео найдено
            console.log("DEBUG: [fetchUserVideos] Найдено видео, очищаем и добавляем в uploadedVideos.");
            data.forEach(video => {
                // DEBUG: Логируем каждое обрабатываемое видео
                console.log("DEBUG: [fetchUserVideos] Processing video:", video);
                // Добавляем видео в локальный массив uploadedVideos
                uploadedVideos.push({
                    id: video.taskId,
                    original_filename: video.originalFilename,
                    status: video.status,
                    timestamp: video.timestamp,
                    cloudinary_url: video.cloudinary_url,
                    shotstackRenderId: video.shotstackRenderId,
                    shotstackUrl: video.shotstackUrl,
                    message: video.message,
                    metadata: video.metadata || {},
                    posterUrl: video.posterUrl
                });
                // Создаем или обновляем пузырек в DOM
                createOrUpdateBubble(video.taskId, { // Используем taskId в качестве ID для пузырька
                    id: video.taskId, // Убедитесь, что внутренний ID также является taskId
                    original_filename: video.originalFilename,
                    status: video.status,
                    timestamp: video.timestamp,
                    cloudinary_url: video.cloudinary_url,
                    shotstackRenderId: video.shotstackRenderId,
                    shotstackUrl: video.shotstackUrl,
                    message: video.message,
                    metadata: video.metadata || {}, // Убедитесь, что метаданные существуют
                    posterUrl: video.posterUrl // Передаем posterUrl, если доступен
                });
            });
            // Сохраняем обновленный список в localStorage
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
            // DEBUG: Логируем состояние uploadedVideos после добавления
            console.log("DEBUG: [fetchUserVideos] uploadedVideos after adding:", uploadedVideos);
            displayGeneralStatus(`Найдено ${data.length} видео для этого пользователя.`, 'success');
        } else {
            // DEBUG: Логируем, если видео не найдено
            console.log("DEBUG: [fetchUserVideos] No videos found for user (data.length === 0).");
            displayGeneralStatus('Задач не найдено для этого пользователя.', 'info');
            if (DOM_ELEMENTS.bubblesContainer) {
                DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
            }
        }
        updateConcatenationUI(); // Обновляем UI объединения, чтобы оно отражало новое количество видео

    } catch (error) {
        // DEBUG: Логируем общую ошибку при получении видео
        console.error('DEBUG: [fetchUserVideos] Error fetching videos:', error);
        displayGeneralStatus(`Ошибка при загрузке видео: ${sanitizeHTML(error.message)}. Пожалуйста, попробуйте позже.`, 'error'); // Sanitized message
        uploadedVideos = []; // Очищаем при ошибке
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message error">Не удалось загрузить видео. Пожалуйста, проверьте подключение и попробуйте снова.</p>';
        }
        updateConcatenationUI();
    }
}


// --- Инициализация при загрузке DOM ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DEBUG: DOMContentLoaded event fired.");

    // Инициализируем таймер неактивности
    resetInactivityTimer();

    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');
    const linkedin = localStorage.getItem('hifeLinkedin');

    let headerText = 'Ваши Видео';
    let identifierToFetch = null;
    let identifierTypeToFetch = null;

    if (username) {
        headerText = `Ваши Видео для @${sanitizeHTML(username)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: @${sanitizeHTML(username)}`;
        identifierToFetch = username;
        identifierTypeToFetch = 'instagram_username';
    } else if (email) {
        headerText = `Ваши Видео для ${sanitizeHTML(email)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: ${sanitizeHTML(email)}`;
        identifierToFetch = email;
        identifierTypeToFetch = 'email';
    } else if (linkedin) {
        headerText = `Ваши Видео для ${sanitizeHTML(linkedin)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: ${sanitizeHTML(linkedin)}`;
        identifierToFetch = linkedin;
        identifierTypeToFetch = 'linkedin_profile';
    } else {
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = 'Для: Гость';
        displayGeneralStatus('Данные пользователя не найдены. Загрузите видео со страницы загрузки.', 'info');
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
    }
    if (DOM_ELEMENTS.resultsHeader) DOM_ELEMENTS.resultsHeader.textContent = headerText;

    // Управление кнопкой "Upload New Video(s)"
    if (identifierToFetch) { // Если есть какой-либо идентификатор пользователя
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.textContent = 'Загрузить новое видео';
        updateUploadStatusDisplay('Готов к новой загрузке.', 'info');
        if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
        resetProgressBar();
    } else {
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = true;
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.textContent = 'Загрузить (сначала войдите)';
        updateUploadStatusDisplay('Невозможно повторно загрузить: данные пользователя не найдены. Пожалуйста, загрузите видео со страницы загрузки.', 'error');
        if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
        resetProgressBar();
    }

    // --- NEW: Fetch user videos from backend when results page loads ---
    if (identifierToFetch && identifierTypeToFetch) {
        await fetchUserVideos(identifierToFetch, identifierTypeToFetch);
    } else {
           // If no user data, ensure uploadedVideos is empty and message is displayed
        uploadedVideos = [];
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
        displayGeneralStatus('Данные пользователя не найдены. Загрузите видео со страницы загрузки.', 'info');
    }
    // The `uploadedVideos` array should now be populated (or empty if no videos found/error).
    // The createOrUpdateBubble calls within fetchUserVideos already handle rendering.
    // However, if fetchUserVideos was skipped (e.g., no user data), we still need to initialize polling.
    checkTaskStatuses(); // Start polling regardless, as existing videos might be in localStorage.


    // Обработчик клика по кнопке "Upload New Video(s)"
    if (DOM_ELEMENTS.uploadNewBtn) {
        DOM_ELEMENTS.uploadNewBtn.addEventListener('click', () => {
            if (DOM_ELEMENTS.uploadNewBtn.disabled) return;
            if (DOM_ELEMENTS.videoFileInput) DOM_ELEMENTS.videoFileInput.click();
        });
    }

    // Обработчик выбора файла через скрытый input
    if (DOM_ELEMENTS.videoFileInput) {
        DOM_ELEMENTS.videoFileInput.addEventListener('change', (event) => {
            const selectedFile = event.target.files[0];
            if (selectedFile) {
                uploadVideoFromResults(selectedFile);
                DOM_ELEMENTS.videoFileInput.value = '';
            } else {
                updateUploadStatusDisplay('Выбор файла отменен.', 'info');
                resetProgressBar();
            }
        });
    }

    // Обработчик закрытия модального окна по кнопке
    if (DOM_ELEMENTS.closeButton) {
        DOM_ELEMENTS.closeButton.addEventListener('click', () => {
            if (DOM_ELEMENTS.metadataModal) DOM_ELEMENTS.metadataModal.style.display = 'none';
        });
    }

    // Обработчик закрытия модального окна по клику вне его
    window.addEventListener('click', (event) => {
        if (DOM_ELEMENTS.metadataModal && event.target === DOM_ELEMENTS.metadataModal) {
            DOM_ELEMENTS.metadataModal.style.display = 'none';
        }
    });

    // Обработчик кнопки "Завершить сессию"
    if (DOM_ELEMENTS.finishSessionBtn) {
        // Устанавливаем display на основе текущего состояния `uploadedVideos`
        // Note: this relies on uploadedVideos being accurate after initial fetch.
        if (uploadedVideos.length > 0 || localStorage.getItem('hifeUsername') || localStorage.getItem('hifeEmail') || localStorage.getItem('hifeLinkedin')) {
            DOM_ELEMENTS.finishSessionBtn.style.display = 'inline-block';
        } else {
            DOM_ELEMENTS.finishSessionBtn.style.display = 'none';
        }

        DOM_ELEMENTS.finishSessionBtn.addEventListener('click', () => {
            localStorage.removeItem('hifeUsername');
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('hifeLinkedin');
            localStorage.removeItem('uploadedVideos');
            console.log("Сессия завершена. Локальное хранилище очищено.");
            window.location.replace('index.html');
        });
    }

    // --- Обработчики для логики объединения видео ---

    // Обработчик изменения чекбокса "Объединить видео"
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        DOM_ELEMENTS.connectVideosCheckbox.addEventListener('change', updateConcatenationUI);
        console.log("DEBUG: Connect videos checkbox event listener attached.");
    } else {
        console.log("DEBUG: Connect videos checkbox element NOT found! Please ensure your HTML has an element with id 'connectVideosCheckbox'.");
    }

    // Обработчик кнопки "Обработать/Объединить выбранные видео"
    if (DOM_ELEMENTS.processSelectedVideosButton) {
        DOM_ELEMENTS.processSelectedVideosButton.addEventListener('click', async () => {
            console.log("DEBUG: --- Process Selected Videos Button Click Handler STARTED ---");
            // ДОБАВЛЕНО: Проверка disabled состояния кнопки
            if (DOM_ELEMENTS.processSelectedVideosButton.disabled) {
                console.log("DEBUG: Button is disabled. Skipping click handler execution.");
                return; // Выходим, если кнопка отключена
            }

            // ПЕРЕЧИТЫВАЕМ uploadedVideos ИЗ localStorage ПЕРЕД ИСПОЛЬЗОВАНИЕМ!
            uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
            console.log("DEBUG: uploadedVideos reloaded from localStorage at handler start:", uploadedVideos);


            const username = localStorage.getItem('hifeUsername');
            const email = localStorage.getItem('hifeEmail');
            const linkedin = localStorage.getItem('hifeLinkedin');
            // Получаем фактическое состояние чекбокса "Объединить видео"
            const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;

            console.log("DEBUG: Is 'Connect videos' checkbox checked (actual checkbox state)?:", shouldConnect);

            // Отфильтровываем ВСЕ видео, которые имеют статус 'completed' и не являются объединенными видео
            const videosToProcess = uploadedVideos.filter(video =>
                video.status === 'completed' && !String(video.id).startsWith('concatenated_video_')
            );

            const taskIdsToProcess = videosToProcess.map(video => video.id); // Используем video.id (строковый Cloudinary ID)

            console.log("DEBUG: Videos to process (filtered by 'completed' status for ALL):", videosToProcess);
            console.log("DEBUG: Task IDs to process (for ALL completed):", taskIdsToProcess);


            if (taskIdsToProcess.length === 0) {
                displayGeneralStatus('Нет завершенных видео для обработки или объединения. Загрузите видео.', 'error');
                console.log("DEBUG: No completed videos found for processing. Returning.");
                return;
            }

            if (shouldConnect && taskIdsToProcess.length < 2) {
                displayGeneralStatus('Для объединения необходимо 2 или более завершенных видео.', 'error');
                console.log("DEBUG: Connect option enabled, but less than 2 completed videos found. Returning.");
                return;
            }

            // Проверяем, есть ли уже обрабатываемые/объединяемые видео
            const anyVideoProcessing = uploadedVideos.some(v => v.status === 'processing' || v.status === 'shotstack_pending' || v.status === 'concatenated_pending');
            if (anyVideoProcessing) {
                displayGeneralStatus('Дождитесь завершения текущих процессов обработки/объединения.', 'pending');
                console.log("DEBUG: Another video is currently processing. Returning.");
                return;
            }

            try {
                console.log("DEBUG: Calling processVideosFromSelection...");
                const result = await processVideosFromSelection(
                    taskIdsToProcess, // Передаем все готовые видео
                    shouldConnect, // Передаем фактическое состояние чекбокса
                    username,
                    email,
                    linkedin,
                    displayGeneralStatus, // Функция для обновления статуса внутри process_videos.js
                    displayGeneralStatus, // Функция для обновления общего статуса
                    RENDER_BACKEND_URL // Передаем URL бэкенда
                );
                console.log("DEBUG: processVideosFromSelection returned:", result);

                if (result) { // Проверяем, что result не null (не было внутренней ошибки)
                    // Если это объединение, бэкенд должен вернуть новый taskId для объединенного видео
                    if (shouldConnect && result.concatenated_task_id) {
                        const newConcatenatedVideo = {
                            id: result.concatenated_task_id, // Используем строковый ID объединенного видео
                            original_filename: 'Объединенное Видео',
                            status: 'concatenated_pending',
                            timestamp: new Date().toISOString(),
                            cloudinary_url: null,
                            shotstackRenderId: result.shotstackRenderId || null,
                            shotstackUrl: result.shotstackUrl || null
                        };
                        uploadedVideos.push(newConcatenatedVideo);
                        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                        createOrUpdateBubble(newConcatenatedVideo.id, newConcatenatedVideo); // ИСПОЛЬЗУЕМ id (строковый) ДЛЯ BUBBLE ID
                        console.log("DEBUG: New concatenated video added:", newConcatenatedVideo);
                    } else {
                        // Для индивидуальной обработки просто обновляем статусы существующих видео
                        // (хотя эта ветка теперь менее актуальна из-за новой логики "объединять все")
                        if (result.initiated_tasks && Array.isArray(result.initiated_tasks)) {
                            result.initiated_tasks.forEach(initiatedTask => {
                                const index = uploadedVideos.findIndex(v => v.id === initiatedTask.taskId); // ИСПОЛЬЗУЕМ v.id (строковый)
                                if (index !== -1) {
                                    uploadedVideos[index].status = initiatedTask.status || 'shotstack_pending';
                                    uploadedVideos[index].shotstackRenderId = initiatedTask.shotstackRenderId || null;
                                    uploadedVideos[index].message = initiatedTask.message || '';
                                    createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]); // ИСПОЛЬЗУЕМ id (строковый)
                                }
                            });
                            console.log("DEBUG: Updated statuses for individual tasks:", result.initiated_tasks);
                        } else if (result.shotstackRenderId && taskIdsToProcess.length === 1) { // Если один видео, и бэкенд возвращает RenderId
                            const index = uploadedVideos.findIndex(v => v.id === taskIdsToProcess[0]); // ИСПОЛЬЗУЕМ v.id (строковый)
                            if (index !== -1) {
                                uploadedVideos[index].status = 'shotstack_pending';
                                uploadedVideos[index].shotstackRenderId = result.shotstackRenderId;
                                uploadedVideos[index].message = result.message || '';
                                createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]); // ИСПОЛЬЗУЕМ id (строковый)
                                console.log("DEBUG: Updated status for single task with Shotstack Render ID.");
                            }
                        }
                        else {
                            // Если бэкенд не вернул initiated_tasks для множества, просто обновляем выбранные на 'shotstack_pending'
                            uploadedVideos = uploadedVideos.map(video => {
                                if (taskIdsToProcess.includes(video.id)) { // ИСПОЛЬЗУЕМ video.id (строковый)
                                    console.log(`DEBUG: Forcing status 'shotstack_pending' for task ${video.id}`);
                                    return { ...video, status: 'shotstack_pending' };
                                }
                                return video;
                            });
                        }
                        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                    }
                    checkTaskStatuses();
                } else {
                    // Если processVideosFromSelection вернул null, значит была внутренняя ошибка,
                    // сообщение о которой уже выведено
                    console.error("DEBUG: processVideosFromSelection returned null, indicating an internal error.");
                }
            } catch (error) {
                console.error('Ошибка в обработчике processSelectedVideosButton:', error);
                displayGeneralStatus(`Произошла неожиданная ошибка: ${sanitizeHTML(error.message || 'Неизвестная ошибка')}`, 'error'); // Sanitized message
            } finally {
                console.log("DEBUG: --- Process Selected Videos Button Click Handler FINISHED ---");
                updateConcatenationUI();
            }
        });
        console.log("DEBUG: Process Selected Videos Button event listener attached.");
    } else {
        console.log("DEBUG: Process Selected Videos Button element NOT found! Please ensure your HTML has an element with id 'processSelectedVideosButton'.");
    }

    // Начальное обновление UI объединения при загрузке страницы
    updateConcatenationUI();
    // checkTaskStatuses() is already called after fetchUserVideos or if no user data.
});

// Глобальная функция для использования в uploadFileFromResults
function updateUploadStatusDisplay(message, type) {
    if (DOM_ELEMENTS.uploadStatusText) {
        DOM_ELEMENTS.uploadStatusText.textContent = message;
        DOM_ELEMENTS.uploadStatusText.className = `status-message ${type}`;
    }
}
