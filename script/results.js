// script/results.js
console.log("DEBUG: results.js loaded and executing.");

// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// Импортируем функцию загрузки из cloudinary_upload.js
import { uploadFileToCloudinary } from './cloudinary_upload.js';
// Импортируем новую функцию для обработки видео из process_videos.js
import { processVideosFromSelection } from './process_videos.js';

// --- Константы и глобальные переменные для таймера неактивности ---
let inactivityTimeout;
const INACTIVITY_THRESHOLD = 90 * 1000; // 90 секунд в миллисекундах (или 10 * 60 * 1000 для 10 минут)

/**
 * Сбрасывает таймер неактивности.
 * Вызывается при любой активности пользователя.
 */
function resetInactivityTimer() {
    clearTimeout(inactivityTimeout); // Очищаем существующий таймер
    inactivityTimeout = setTimeout(handleInactivity, INACTIVITY_THRESHOLD); // Устанавливаем новый
    console.log("[Inactivity Timer] Таймер неактивности сброшен.");
}

/**
 * Обрабатывает неактивность пользователя: закрывает сессию и перенаправляет.
 * Вызывается, когда таймер неактивности истекает.
 */
function handleInactivity() {
    console.log("[Inactivity Timer] Пользователь неактивен. Закрытие сессии и перенаправление на index.html.");
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('index.html'); // Перенаправляем на index.html
}

// Добавляем слушатели событий к документу для отслеживания активности пользователя
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('click', resetInactivityTimer);
document.addEventListener('scroll', resetInactivityTimer);

// --- Константы и глобальные переменные ---

const DOM_ELEMENTS = {
    resultsHeader: document.getElementById('resultsHeader'),
    usernameDisplay: document.getElementById('usernameDisplay'),
    uploadNewBtn: document.getElementById('uploadNewBtn'),
    finishSessionBtn: document.getElementById('finishSessionBtn'),
    bubblesContainer: document.getElementById('bubblesContainer'),
    metadataModal: document.getElementById('metadataModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMetadata: document.getElementById('modalMetadata'),
    closeButton: document.querySelector('.close-button'),
    videoFileInput: document.getElementById('videoFileInput'),
    dynamicUploadStatusContainer: document.getElementById('dynamicUploadStatusContainer'),
    uploadStatusText: document.getElementById('uploadStatusText'),
    progressBarContainer: null,
    progressBar: null,
    progressText: null,
    processSelectedVideosButton: document.getElementById('processSelectedVideosButton'),
    connectVideosCheckbox: document.getElementById('connectVideosCheckbox'),
    concatenationStatusDiv: document.getElementById('concatenationStatusDiv')
};

// Инициализация элементов прогресс-бара, так как они могут быть внутри dynamicUploadStatusContainer
if (DOM_ELEMENTS.dynamicUploadStatusContainer) {
    DOM_ELEMENTS.progressBarContainer = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-bar-container');
    DOM_ELEMENTS.progressBar = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-bar');
    DOM_ELEMENTS.progressText = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-text');
}

// Глобальная переменная для хранения данных о видео.
let uploadedVideos = [];
let pollingIntervalId = null; // ID интервала для опроса статусов
let selectedVideosForConcatenation = []; // Массив для выбранных видео для объединения

const taskBubbles = {}; // Объект для хранения ссылок на DOM-элементы "пузырей" по их videoId (Cloudinary ID)
const CHECK_STATUS_INTERVAL_MS = 3000; // Интервал опроса статусов (3 секунды)


// --- Вспомогательные функции ---

/**
 * Sanitizes a string for display in HTML (basic escaping).
 * @param {string} str The string to sanitize.
 * @returns {string} The sanitized string.
 */
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

/**
 * Генерирует URL миниатюры Cloudinary из URL видео.
 * @param {string} videoUrl Оригинальный URL видео на Cloudinary.
 * @returns {string} URL миниатюры или путь к дефолтной заглушке.
 */
function getCloudinaryThumbnailUrl(videoUrl) {
    if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
        return 'assets/video_placeholder.png'; // Используем video_placeholder.png
    }

    const parts = videoUrl.split('/upload/');
    if (parts.length < 2) {
        return 'assets/video_placeholder.png';
    }

    const baseUrl = parts[0];
    // Трансформации для миниатюры: обрезка, размер, авто-определение точки интереса, авто-качество, формат JPG, первый кадр
    const transformations = 'c_fill,w_200,h_150,g_auto,q_auto:eco,f_jpg,so_auto/';

    let publicIdPath = parts[1];
    // Удаляем версию (vXXXX/) и меняем расширение на .jpg для миниатюры
    publicIdPath = publicIdPath.replace(/v\d+\//, '');
    publicIdPath = publicIdPath.substring(0, publicIdPath.lastIndexOf('.')) + '.jpg';

    return `${baseUrl}/upload/${transformations}${publicIdPath}`;
}

/**
 * Отображает или скрывает модальное окно метаданных.
 * @param {string} filename Имя файла для заголовка модального окна.
 * @param {object} metadata Объект метаданных для отображения.
 */
function showMetadataModal(videoId) {
    const video = uploadedVideos.find(v => v.id === videoId);
    if (!video) {
        console.error("Video not found for metadata modal:", videoId);
        return;
    }

    if (DOM_ELEMENTS.modalTitle) DOM_ELEMENTS.modalTitle.textContent = `Метаданные для: ${sanitizeHTML(video.original_filename || videoId)}`;
    if (DOM_ELEMENTS.modalMetadata) DOM_ELEMENTS.modalMetadata.textContent = typeof video.metadata === 'object' && video.metadata !== null ? JSON.stringify(video.metadata, null, 2) : String(video.metadata);
    if (DOM_ELEMENTS.metadataModal) DOM_ELEMENTS.metadataModal.style.display = 'flex';
}

/**
 * Обновляет текст и стиль статусного сообщения для новой загрузки.
 * @param {string} message Сообщение для отображения.
 * @param {'info'|'success'|'error'|'pending'} type Тип сообщения для стилизации.
 */
function updateUploadStatusDisplay(message, type) {
    if (DOM_ELEMENTS.uploadStatusText) {
        DOM_ELEMENTS.uploadStatusText.textContent = message;
        DOM_ELEMENTS.uploadStatusText.className = `upload-status-text status-${type}`;
    }
}

/**
 * Сбрасывает состояние прогресс-бара и скрывает его.
 */
function resetProgressBar() {
    if (DOM_ELEMENTS.progressBarContainer) DOM_ELEMENTS.progressBarContainer.style.display = 'none';
    if (DOM_ELEMENTS.progressBar) DOM_ELEMENTS.progressBar.style.width = '0%';
    if (DOM_ELEMENTS.progressText) DOM_ELEMENTS.progressText.textContent = '0%';
}

/**
 * Обновляет общее сообщение о статусе на странице результатов.
 * @param {string} message Сообщение для отображения.
 * @param {'info'|'success'|'error'|'pending'|'completed'} type Тип сообщения для стилизации.
 */
function displayGeneralStatus(message, type) {
    if (DOM_ELEMENTS.concatenationStatusDiv) {
        DOM_ELEMENTS.concatenationStatusDiv.textContent = message;
        DOM_ELEMENTS.concatenationStatusDiv.className = `concatenation-status ${type}`;
    }
}


/**
 * Загружает выбранный файл видео на бэкенд со страницы результатов.
 * @param {File} file Файл для загрузки.
 */
async function uploadVideoFromResults(file) {
    const currentUsername = localStorage.getItem('hifeUsername');
    const currentEmail = localStorage.getItem('hifeEmail');
    const currentLinkedin = localStorage.getItem('hifeLinkedin');

    if (!currentUsername && !currentEmail && !currentLinkedin) {
        displayGeneralStatus('Данные пользователя не найдены. Пожалуйста, войдите, чтобы загрузить видео.', 'error');
        setTimeout(() => {
            window.location.replace('index.html');
        }, 3000);
        return;
    }

    if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
    updateUploadStatusDisplay('Начало загрузки...', 'info');
    if (DOM_ELEMENTS.progressBarContainer) DOM_ELEMENTS.progressBarContainer.style.display = 'flex';
    resetProgressBar();
    if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = true;

    uploadFileToCloudinary( // ИСПОЛЬЗУЕМ ИМПОРТИРОВАННУЮ ФУНКЦИЮ
        file,
        currentUsername,
        currentEmail,
        currentLinkedin,
        {
            updateFileBubbleUI: (f, msg, type) => updateUploadStatusDisplay(msg, type),
            displayGeneralStatus: displayGeneralStatus,
            resetProgressBar: resetProgressBar,
            selectFilesButton: DOM_ELEMENTS.uploadNewBtn,
            uploadNewBtn: DOM_ELEMENTS.uploadNewBtn,
            progressBar: DOM_ELEMENTS.progressBar,
            progressText: DOM_ELEMENTS.progressText,
            progressBarContainer: DOM_ELEMENTS.progressBarContainer
        },
        (response, uploadedFile) => {
            const taskId = response.taskId;
            updateUploadStatusDisplay(`Видео загружено. ID задачи: ${taskId}. Ожидание обработки.`, 'pending');
            resetProgressBar();

            let newVideoEntry = {
                id: taskId,
                original_filename: response.originalFilename || uploadedFile.name,
                status: 'uploaded',
                timestamp: new Date().toISOString(),
                cloudinary_url: response.cloudinary_url || null,
                metadata: response.metadata || {},
                shotstackRenderId: null,
                shotstackUrl: null,
                posterUrl: null // Убедитесь, что posterUrl инициализируется
            };

            uploadedVideos.push(newVideoEntry);
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

            createOrUpdateBubble(taskId, newVideoEntry);
            checkTaskStatuses();
            updateConcatenationUI();

            setTimeout(() => {
                if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.add('hidden');
                updateUploadStatusDisplay('Готов к новой загрузке.', 'info');
            }, 5000);
        },
        (error, erroredFile) => {
            updateUploadStatusDisplay(`Ошибка загрузки для ${erroredFile.name}: ${sanitizeHTML(error.error || 'Неизвестная ошибка')}`, 'error');
            resetProgressBar();
            if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;
        }
    );
}

/**
 * Отправляет запрос на бэкенд для получения статуса задачи.
 * @param {string} taskId - ID задачи.
 * @returns {Promise<Object>} Объект с обновленным статусом задачи.
 */
async function getTaskStatus(taskId) {
    if (!taskId || typeof taskId !== 'string') {
        console.warn(`[FRONTEND] Invalid taskId provided to getTaskStatus: ${taskId}. Skipping network request.`);
        return { id: taskId, status: 'failed', error: 'Invalid taskId provided.' };
    }
    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.error}`);
        }
        const data = await response.json();
        return { ...data, id: data.taskId || taskId };
    } catch (error) {
        console.error(`[FRONTEND] Network error checking status for task ${taskId}:`, error);
        return { id: taskId, status: 'failed', error: error.message || 'Network/Server error' };
    }
}

/**
 * Периодически проверяет статусы задач на бэкенде.
 * Обновляет `uploadedVideos` и DOM-элементы.
 */
async function checkTaskStatuses() {
    console.log("DEBUG: checkTaskStatuses called.");
    uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    console.log("DEBUG: uploadedVideos reloaded from localStorage at checkTaskStatuses start:", uploadedVideos);

    const videosToPoll = uploadedVideos.filter(v =>
        v.id && typeof v.id === 'string' &&
        !['completed', 'error', 'failed', 'concatenated_completed', 'concatenated_failed', 'shotstack_completed', 'shotstack_failed'].includes(v.status)
    );

    if (videosToPoll.length === 0 && uploadedVideos.length > 0 && pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
        displayGeneralStatus('Все процессы обработки видео завершены. Ознакомьтесь с результатами ниже.', 'completed');
        console.log("[FRONTEND] All tasks completed or errored. Polling stopped.");
    } else if (uploadedVideos.length === 0) {
        displayGeneralStatus('Видео еще не загружены. Перейдите на страницу загрузки.', 'info');
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
        updateConcatenationUI(); // Ensure UI is updated if no videos
        return;
    } else {
        const initialMessage = document.getElementById('statusMessage');
        if (initialMessage) {
            initialMessage.remove();
        }
    }

    if (videosToPoll.length > 0 && !pollingIntervalId) {
        pollingIntervalId = setInterval(checkTaskStatuses, CHECK_STATUS_INTERVAL_MS);
        console.log("[FRONTEND] Polling started.");
    }


    for (const video of videosToPoll) { // Iterate only pending videos
        const videoId = video.id;

        if (!videoId || typeof videoId !== 'string') {
            console.warn(`[FRONTEND] Skipping polling for invalid videoId: ${videoId}. Video object:`, video);
            continue;
        }

        const currentLocalStatus = video.status;
        const updatedTask = await getTaskStatus(videoId);
        const newRemoteStatus = updatedTask.status;

        console.log(`DEBUG: Polling task ${videoId}. Local status: "${currentLocalStatus}". Remote status: "${newRemoteStatus}".`);

        const index = uploadedVideos.findIndex(v => v.id === videoId);
        if (index !== -1) {
            uploadedVideos[index].status = updatedTask.status;
            uploadedVideos[index].original_filename = updatedTask.originalFilename || uploadedVideos[index].original_filename;
            uploadedVideos[index].cloudinary_url = updatedTask.cloudinary_url || uploadedVideos[index].cloudinary_url;
            uploadedVideos[index].metadata = updatedTask.metadata || uploadedVideos[index].metadata;
            uploadedVideos[index].message = updatedTask.message || uploadedVideos[index].message;
            uploadedVideos[index].shotstackRenderId = updatedTask.shotstackRenderId || uploadedVideos[index].shotstackRenderId;
            uploadedVideos[index].shotstackUrl = updatedTask.shotstackUrl || uploadedVideos[index].shotstackUrl;
            uploadedVideos[index].posterUrl = updatedTask.posterUrl || uploadedVideos[index].posterUrl;

            console.log(`DEBUG: Task ${videoId} updated in uploadedVideos. New local object status: "${uploadedVideos[index].status}". Current object ID (should be string): ${uploadedVideos[index].id}`);
            createOrUpdateBubble(videoId, uploadedVideos[index]);
        } else {
            console.warn(`DEBUG: Could not find video ${videoId} in uploadedVideos to update. Might be a new task not yet added or data inconsistency.`);
            // If it's a new concatenated video, add it
            if (String(updatedTask.id).startsWith('concatenated_video_') && !uploadedVideos.some(v => v.id === updatedTask.id)) {
                uploadedVideos.push({
                    id: updatedTask.id,
                    original_filename: updatedTask.originalFilename || `Объединенное Видео ${updatedTask.id.substring(updatedTask.id.lastIndexOf('_') + 1)}`,
                    status: updatedTask.status,
                    timestamp: updatedTask.timestamp,
                    cloudinary_url: updatedTask.cloudinary_url,
                    metadata: updatedTask.metadata,
                    message: updatedTask.message,
                    shotstackRenderId: updatedTask.shotstackRenderId,
                    shotstackUrl: updatedTask.shotstackUrl,
                    posterUrl: updatedTask.posterUrl
                });
                createOrUpdateBubble(updatedTask.id, uploadedVideos[uploadedVideos.length - 1]);
                console.log(`DEBUG: New concatenated task ${updatedTask.id} added and bubble created.`);
            }
        }
    }
    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
    console.log("DEBUG: localStorage 'uploadedVideos' content after checkTaskStatuses:", localStorage.getItem('uploadedVideos'));
    updateConcatenationUI();
}

/**
 * Извлекает все видео, связанные с текущим пользователем, с бэкенда.
 * Обновляет uploadedVideos и отображает их в виде "пузырьков".
 * @param {string} identifier Значение идентификатора (username, email, linkedin_profile).
 * @param {string} identifierType Тип идентификатора ('instagram_username', 'email', 'linkedin_profile').
 */
async function fetchUserVideos(identifier, identifierType) {
    if (!identifier || !identifierType) {
        console.warn("Cannot fetch user videos: Identifier or identifier type is missing.");
        return;
    }

    displayGeneralStatus('Загрузка ваших видео...', 'info');
    console.log(`[FRONTEND] Fetching videos for ${identifierType}: ${identifier}`);

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/user-videos?${identifierType}=${encodeURIComponent(identifier)}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.error}`);
        }
        const data = await response.json();
        console.log("[FRONTEND] Fetched user videos:", data.videos);

        // Clear existing local videos to replace with fetched ones (or merge if preferred)
        uploadedVideos = [];

        if (data.videos && data.videos.length > 0) {
            data.videos.forEach(video => {
                // Ensure video.id is a string and exists
                if (video.id) {
                    const newVideoEntry = {
                        id: String(video.id), // Ensure ID is string for consistency
                        original_filename: video.original_filename || `Видео ${video.id}`,
                        status: video.status || 'unknown',
                        timestamp: video.timestamp || new Date().toISOString(),
                        cloudinary_url: video.cloudinary_url || null,
                        metadata: video.metadata || {},
                        message: video.message || '',
                        shotstackRenderId: video.shotstackRenderId || null,
                        shotstackUrl: video.shotstackUrl || null,
                        posterUrl: video.posterUrl || null
                    };
                    uploadedVideos.push(newVideoEntry);
                    createOrUpdateBubble(newVideoEntry.id, newVideoEntry);
                } else {
                    console.warn("Fetched video missing ID:", video);
                }
            });
            displayGeneralStatus('Ваши видео загружены.', 'success');
        } else {
            displayGeneralStatus('Видео еще не загружены. Начните, загрузив новое видео.', 'info');
            if (DOM_ELEMENTS.bubblesContainer) {
                DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
            }
        }
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        console.log("[FRONTEND] uploadedVideos after fetchUserVideos:", uploadedVideos);
    } catch (error) {
        console.error("Error fetching user videos:", error);
        displayGeneralStatus(`Ошибка загрузки видео: ${sanitizeHTML(error.message || 'Неизвестная ошибка')}`, 'error');
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message error">Не удалось загрузить ваши видео. Пожалуйста, попробуйте еще раз позже или <a href="index.html" style="color: #FFD700; text-decoration: underline;">загрузите новое видео</a>.</p>';
        }
    }
}


/**
 * Создает или обновляет DOM-элемент "пузыря" для видео.
 * @param {string} videoId Идентификатор видео (строковый Cloudinary ID).
 * @param {Object} data Объект с данными видео (id, original_filename, status, metadata и т.д.).
 */
function createOrUpdateBubble(videoId, data) {
    let videoGridItem = document.getElementById(`video-item-${videoId}`);
    let bubble;

    if (!videoGridItem) {
        videoGridItem = document.createElement('div');
        videoGridItem.className = 'video-grid-item';
        videoGridItem.id = `video-item-${videoId}`;

        bubble = document.createElement('div');
        bubble.className = 'video-bubble loading';
        bubble.id = `bubble-${videoId}`;

        videoGridItem.appendChild(bubble);
        if (DOM_ELEMENTS.bubblesContainer) DOM_ELEMENTS.bubblesContainer.appendChild(videoGridItem);
        taskBubbles[videoId] = videoGridItem;

        const initialMessage = document.getElementById('statusMessage');
        if (initialMessage && initialMessage.textContent.includes('Задач не найдено')) {
            initialMessage.remove();
        }
    } else {
        bubble = videoGridItem.querySelector('.video-bubble');
    }

    let filenameText = `<h3 class="bubble-title-overlay">${sanitizeHTML(data.original_filename || `Задача ${videoId}`)}</h3>`;
    let statusMessageText = '';
    let actionButtonsHtml = '';
    let mediaHtml = ''; // Для видео/изображения внутри пузырька

    let thumbnailUrl = 'assets/video_placeholder.png'; // Default placeholder
    if (data.posterUrl) { // Use posterUrl if available (e.g., for concatenated videos)
        thumbnailUrl = data.posterUrl;
    } else if (data.cloudinary_url) { // Otherwise, try to generate a thumbnail from cloudinary_url
        thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
    }

    // Determine content based on status
    switch (data.status) {
        case 'completed':
        case 'shotstack_completed':
        case 'concatenated_completed':
            statusMessageText = '<p class="status-message-bubble status-completed">Нажмите для просмотра метаданных</p>';
            bubble.classList.remove('loading');
            const videoSourceUrl = data.shotstackUrl || data.cloudinary_url;
            if (videoSourceUrl) {
                mediaHtml = `
                    <video class="video-preview" controls preload="metadata" poster="${sanitizeHTML(thumbnailUrl)}">
                        <source src="${sanitizeHTML(videoSourceUrl)}" type="video/mp4">
                        Ваш браузер не поддерживает тег видео.
                    </video>
                `;
                actionButtonsHtml += `<a href="${sanitizeHTML(videoSourceUrl)}" target="_blank" class="action-button view-generated-button">Посмотреть видео</a>`;
            } else {
                mediaHtml = `<img src="${sanitizeHTML(thumbnailUrl)}" alt="Видео превью" class="video-thumbnail">`;
            }
            actionButtonsHtml += `<button class="action-button metadata-button" data-id="${videoId}">Метаданные</button>`;
            break;
        case 'uploaded':
        case 'processing':
        case 'shotstack_pending':
        case 'concatenated_pending':
            statusMessageText = `<p class="status-message-bubble status-pending">В процессе...</p>`;
            bubble.classList.add('loading');
            mediaHtml = `<img src="${sanitizeHTML(thumbnailUrl)}" alt="Видео превью" class="video-thumbnail loading-indicator">`; // Show placeholder with loading spinner
            actionButtonsHtml += `<button class="action-button metadata-button" data-id="${videoId}" ${!data.metadata || Object.keys(data.metadata).length === 0 ? 'disabled' : ''}>Метаданные</button>`;
            break;
        case 'error':
        case 'failed':
        case 'concatenated_failed':
        case 'shotstack_failed':
            statusMessageText = `<p class="status-message-bubble status-error">Ошибка: ${sanitizeHTML(data.message || 'Неизвестная ошибка.')}</p>`;
            bubble.classList.remove('loading');
            mediaHtml = `<img src="assets/error_placeholder.png" alt="Ошибка загрузки" class="video-thumbnail">`; // Specific error placeholder
            actionButtonsHtml += `<button class="action-button metadata-button" data-id="${videoId}">Метаданные</button>`;
            break;
        default:
            statusMessageText = '<p class="status-message-bubble status-info">Получение статуса...</p>';
            bubble.classList.add('loading');
            mediaHtml = `<img src="${sanitizeHTML(thumbnailUrl)}" alt="Видео превью" class="video-thumbnail loading-indicator">`;
            break;
    }

    bubble.innerHTML = `
        <div class="video-media-wrapper">
            ${mediaHtml}
        </div>
        <div class="bubble-text-overlay">
            ${filenameText}
            ${statusMessageText}
            <div class="bubble-actions">
                ${actionButtonsHtml}
            </div>
        </div>
    `;

    // Add/Update checkbox
    let existingCheckboxContainer = videoGridItem.querySelector('.bubble-checkbox-container');
    if (existingCheckboxContainer) {
        existingCheckboxContainer.remove();
    }

    const checkboxContainer = document.createElement('label');
    checkboxContainer.className = 'bubble-checkbox-container';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'bubble-checkbox';
    checkbox.value = videoId;
    checkbox.checked = selectedVideosForConcatenation.includes(videoId);

    // FIX: Determine checkbox disabled state based on video status
    const isProcessing = ['processing', 'shotstack_pending', 'concatenated_pending', 'uploaded'].includes(data.status);
    const isCompletedOriginalVideo = (data.status === 'completed' || data.status === 'shotstack_completed') && !String(data.id).startsWith('concatenated_video_');
    const isErrored = ['error', 'failed', 'concatenated_failed', 'shotstack_failed'].includes(data.status);

    checkbox.disabled = !isCompletedOriginalVideo || isProcessing || isErrored;
    
    // Apply visual disabled state
    if (checkbox.disabled) {
        checkboxContainer.style.opacity = '0.5';
        checkboxContainer.style.cursor = 'not-allowed';
    } else {
        checkboxContainer.style.opacity = '1';
        checkboxContainer.style.cursor = 'pointer';
    }

    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(document.createTextNode(' Выбрать'));
    videoGridItem.appendChild(checkboxContainer); // Append to videoGridItem, not bubble

    // Event listener for checkbox
    checkbox.addEventListener('change', (event) => {
        if (event.target.checked) {
            if (!selectedVideosForConcatenation.includes(videoId)) {
                selectedVideosForConcatenation.push(videoId);
            }
        } else {
            selectedVideosForConcatenation = selectedVideosForConcatenation.filter(id => id !== videoId);
        }
        updateConcatenationUI(); // Trigger UI update
    });

    // Add event listeners for new buttons if they exist
    const metadataButton = bubble.querySelector(`.metadata-button[data-id="${videoId}"]`);
    if (metadataButton) {
        metadataButton.onclick = () => showMetadataModal(videoId);
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
        'concatenated_failed': 'Ошибка объединения',
        'cloudinary_metadata_incomplete': 'Метаданные Cloudinary неполные'
    };
    return statusMap[status] || status; // Возвращаем исходный статус, если нет в карте
}


/**
 * Обновляет состояние кнопки "Обработать выбранные видео" и статус сообщений.
 * Теперь состояние чекбокса "Объединить видео" учитывается.
 */
function updateConcatenationUI() {
    console.log("DEBUG: [updateConcatenationUI] Called.");
    console.log("DEBUG: [updateConcatenationUI] Current uploadedVideos array:", uploadedVideos);
    console.log("DEBUG: [updateConcatenationUI] Currently selected videos (selectedVideosForConcatenation):", selectedVideosForConcatenation);

    const numSelectedVideos = selectedVideosForConcatenation.length;
    const completedOriginalVideos = uploadedVideos.filter(v => 
        (v.status === 'completed' || v.status === 'shotstack_completed') && !String(v.id).startsWith('concatenated_video_')
    );
    const numCompletedOriginalVideos = completedOriginalVideos.length;

    console.log("DEBUG: [updateConcatenationUI] Number of completed original videos:", numCompletedOriginalVideos);
    console.log("DEBUG: [updateConcatenationUI] Number of selected videos:", numSelectedVideos);


    let shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;
    console.log("DEBUG: [updateConcatenationUI] shouldConnect (actual checkbox state):", shouldConnect);

    if (!DOM_ELEMENTS.processSelectedVideosButton || !DOM_ELEMENTS.concatenationStatusDiv || !DOM_ELEMENTS.connectVideosCheckbox) {
        console.error("ERROR: [updateConcatenationUI] Missing one or more key DOM elements for concatenation UI.");
        return;
    }

    // Check if any video is currently processing (globally)
    const anyVideoProcessing = uploadedVideos.some(v => 
        ['processing', 'shotstack_pending', 'concatenated_pending', 'uploaded'].includes(v.status)
    );
    console.log("DEBUG: [updateConcatenationUI] Any video processing in background:", anyVideoProcessing);


    // Manage the main "Connect videos" checkbox visibility and disabled state
    // It should be enabled only if there are at least 2 completed original videos
    DOM_ELEMENTS.connectVideosCheckbox.disabled = (numCompletedOriginalVideos < 2 || anyVideoProcessing);
    if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
        DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = DOM_ELEMENTS.connectVideosCheckbox.disabled ? '0.5' : '1';
        DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = DOM_ELEMENTS.connectVideosCheckbox.disabled ? 'not-allowed' : 'pointer';
    }
    // If it's disabled due to less than 2 completed videos, uncheck it to prevent confusion
    if (DOM_ELEMENTS.connectVideosCheckbox.disabled && DOM_ELEMENTS.connectVideosCheckbox.checked) {
        DOM_ELEMENTS.connectVideosCheckbox.checked = false;
        shouldConnect = false; // Update internal state as well
        console.log("DEBUG: [updateConcatenationUI] Connect checkbox disabled and unchecked due to less than 2 completed original videos or active processing.");
    } else if (!DOM_ELEMENTS.connectVideosCheckbox.disabled) {
        console.log("DEBUG: [updateConcatenationUI] Connect checkbox enabled.");
    }


    // Disable ALL controls if any video is currently processing
    if (anyVideoProcessing) {
        DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
        DOM_ELEMENTS.connectVideosCheckbox.disabled = true; // Отключаем чекбокс во время обработки
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Видео обрабатываются. Пожалуйста, подождите.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status pending';
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'inline-block'; // Show disabled button
        // Also disable all individual checkboxes (handled by createOrUpdateBubble based on `isProcessing`)
        console.log("DEBUG: [updateConcatenationUI] Active video processing detected. All controls disabled.");
        return; // Exit here, processing overrides other states
    } else {
        // Re-enable individual checkboxes if no global processing (handled by createOrUpdateBubble)
    }

    // Logic for the main "Process/Combine" button and status message
    if (numSelectedVideos === 0) {
        DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'none';
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Выберите видео для обработки или объединения.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
        console.log("DEBUG: [updateConcatenationUI] No videos selected. Button hidden, disabled.");
    } else {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'inline-block';
        if (shouldConnect) { // If "Connect videos" checkbox is checked
            if (numSelectedVideos < 2) {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Объединить видео';
                DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Для объединения необходимо 2 или более ВЫБРАННЫХ видео.';
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
                console.log("DEBUG: [updateConcatenationUI] Connect option checked, but less than 2 SELECTED. Button disabled.");
            } else {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = `Объединить ${numSelectedVideos} видео`;
                DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к объединению ${numSelectedVideos} выбранных видео.`;
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status success';
                console.log("DEBUG: [updateConcatenationUI] Ready to concatenate selected videos. Button enabled.");
            }
        } else { // If "Connect videos" checkbox is UNCHECKED (i.e., individual processing)
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            DOM_ELEMENTS.processSelectedVideosButton.textContent = `Обработать ${numSelectedVideos} видео`;
            DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к индивидуальной обработке ${numSelectedVideos} выбранных видео.`;
            DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
            console.log("DEBUG: [updateConcatenationUI] Ready for individual processing of selected videos. Button enabled.");
        }
    }
}


// --- Инициализация при загрузке DOM ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DEBUG: DOMContentLoaded event fired.");

    resetInactivityTimer(); // Инициализируем таймер неактивности

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
    if (identifierToFetch) {
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

    // NEW: Fetch user videos from backend when results page loads
    if (identifierToFetch && identifierTypeToFetch) {
        await fetchUserVideos(identifierToFetch, identifierTypeToFetch);
    } else {
        uploadedVideos = [];
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
        displayGeneralStatus('Данные пользователя не найдены. Загрузите видео со страницы загрузки.', 'info');
    }
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
            if (DOM_ELEMENTS.processSelectedVideosButton.disabled) {
                console.log("DEBUG: Button is disabled. Skipping click handler execution.");
                return;
            }

            uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
            console.log("DEBUG: uploadedVideos reloaded from localStorage at handler start:", uploadedVideos);

            const username = localStorage.getItem('hifeUsername');
            const email = localStorage.getItem('hifeEmail');
            const linkedin = localStorage.getItem('hifeLinkedin');
            let shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;

            console.log("DEBUG: Is 'Connect videos' checkbox checked (actual checkbox state)?:", shouldConnect);

            // ИСПОЛЬЗУЕМ selectedVideosForConcatenation
            const taskIdsToProcess = selectedVideosForConcatenation;

            console.log("DEBUG: Task IDs to process (from SELECTED checkboxes):", taskIdsToProcess);


            if (taskIdsToProcess.length === 0) {
                displayGeneralStatus('Нет выбранных видео для обработки или объединения.', 'error');
                console.log("DEBUG: No selected videos found for processing. Returning.");
                return;
            }

            if (shouldConnect && taskIdsToProcess.length < 2) {
                displayGeneralStatus('Для объединения необходимо 2 или более ВЫБРАННЫХ видео.', 'error');
                console.log("DEBUG: Connect option enabled, but less than 2 SELECTED videos found. Returning.");
                return;
            }

            const anyVideoProcessing = uploadedVideos.some(v => 
                ['processing', 'shotstack_pending', 'concatenated_pending', 'uploaded'].includes(v.status)
            );
            if (anyVideoProcessing) {
                displayGeneralStatus('Дождитесь завершения текущих процессов обработки/объединения.', 'pending');
                console.log("DEBUG: Another video is currently processing. Returning.");
                return;
            }

            try {
                console.log("DEBUG: Calling processVideosFromSelection...");
                const result = await processVideosFromSelection(
                    taskIdsToProcess,
                    shouldConnect,
                    username,
                    email,
                    linkedin,
                    displayGeneralStatus,
                    displayGeneralStatus,
                    RENDER_BACKEND_URL
                );
                console.log("DEBUG: processVideosFromSelection returned:", result);

                if (result) {
                    if (shouldConnect && result.concatenated_task_id) {
                        const newConcatenatedVideo = {
                            id: result.concatenated_task_id,
                            original_filename: 'Объединенное Видео',
                            status: 'concatenated_pending',
                            timestamp: new Date().toISOString(),
                            cloudinary_url: null,
                            shotstackRenderId: result.shotstackRenderId || null,
                            shotstackUrl: result.shotstackUrl || null,
                            posterUrl: result.posterUrl || null // Инициализируем posterUrl
                        };
                        uploadedVideos.push(newConcatenatedVideo);
                        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                        createOrUpdateBubble(newConcatenatedVideo.id, newConcatenatedVideo);
                        console.log("DEBUG: New concatenated video added:", newConcatenatedVideo);
                        window.location.href = `finish.html?task_id=${newConcatenatedVideo.id}`; // Перенаправление на finish.html
                    } else if (!shouldConnect && result.initiated_tasks && Array.isArray(result.initiated_tasks)) {
                        result.initiated_tasks.forEach(initiatedTask => {
                            const index = uploadedVideos.findIndex(v => v.id === initiatedTask.taskId);
                            if (index !== -1) {
                                uploadedVideos[index].status = initiatedTask.status || 'shotstack_pending';
                                uploadedVideos[index].shotstackRenderId = initiatedTask.shotstackRenderId || null;
                                uploadedVideos[index].message = initiatedTask.message || '';
                                uploadedVideos[index].shotstackUrl = initiatedTask.shotstackUrl || null;
                                createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                            }
                        });
                        console.log("DEBUG: Updated statuses for individual tasks:", result.initiated_tasks);
                        if (result.initiated_tasks.length > 0) {
                            window.location.href = `finish.html?task_id=${result.initiated_tasks[0].taskId}`; // Перенаправление на finish.html для первого индивидуального видео
                        }
                    } else if (!shouldConnect && result.shotstackRenderId && taskIdsToProcess.length === 1) {
                        const index = uploadedVideos.findIndex(v => v.id === taskIdsToProcess[0]);
                        if (index !== -1) {
                            uploadedVideos[index].status = 'shotstack_pending';
                            uploadedVideos[index].shotstackRenderId = result.shotstackRenderId;
                            uploadedVideos[index].message = result.message || '';
                            uploadedVideos[index].shotstackUrl = result.shotstackUrl || null;
                            createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                            console.log("DEBUG: Updated status for single task with Shotstack Render ID.");
                            window.location.href = `finish.html?task_id=${uploadedVideos[index].id}`; // Перенаправление на finish.html
                        }
                    }
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                    checkTaskStatuses();
                } else {
                    console.error("DEBUG: processVideosFromSelection returned null, indicating an internal error.");
                }
            } catch (error) {
                console.error('Ошибка в обработчике processSelectedVideosButton:', error);
                displayGeneralStatus(`Произошла неожиданная ошибка: ${sanitizeHTML(error.message || 'Неизвестная ошибка')}`, 'error');
            } finally {
                console.log("DEBUG: --- Process Selected Videos Button Click Handler FINISHED ---");
                updateConcatenationUI();
            }
        });
        console.log("DEBUG: Process Selected Videos Button event listener attached.");
    } else {
        console.log("DEBUG: Process Selected Videos Button element NOT found! Please ensure your HTML has an element with id 'processSelectedVideosButton'.");
    }

    updateConcatenationUI();
});
