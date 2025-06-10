// В начале вашего скрипта/results.js
console.log("DEBUG: results.js loaded and executing.");

// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// Импортируем функцию загрузки из cloudinary_upload.js
import { uploadFileToCloudinary } from './cloudinary_upload.js';
// Импортируем новую функцию для обработки видео из process_videos.js
import { processVideosFromSelection } from './process_videos.js';

// --- Константы и глобальные переменные ---

const DOM_ELEMENTS = {
    resultsHeader: document.getElementById('resultsHeader'),
    usernameDisplay: document.getElementById('usernameDisplay'),
    uploadNewBtn: document.getElementById('uploadNewBtn'),
    finishSessionBtn: document.getElementById('finishSessionBtn'), // Кнопка "Завершить сессию"
    bubblesContainer: document.getElementById('bubblesContainer'), // Контейнер для отображения видео-пузырьков
    metadataModal: document.getElementById('metadataModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMetadata: document.getElementById('modalMetadata'),
    closeButton: document.querySelector('.close-button'),
    videoFileInput: document.getElementById('videoFileInput'), // Скрытый input для загрузки новых видео
    dynamicUploadStatusContainer: document.getElementById('dynamicUploadStatusContainer'),
    uploadStatusText: document.getElementById('uploadStatusText'),
    progressBarContainer: null, // Инициализируется ниже
    progressBar: null, // Инициализируется ниже
    progressText: null, // Инициализируется ниже
    processSelectedVideosButton: document.getElementById('processSelectedVideosButton'), // Кнопка обработки/объединения
    connectVideosCheckbox: document.getElementById('connectVideosCheckbox'), // Чекбокс объединения
    concatenationStatusDiv: document.getElementById('concatenationStatusDiv') // Статус для объединения
};

// Инициализация элементов прогресс-бара, так как они могут быть внутри dynamicUploadStatusContainer
if (DOM_ELEMENTS.dynamicUploadStatusContainer) {
    DOM_ELEMENTS.progressBarContainer = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-bar-container');
    DOM_ELEMENTS.progressBar = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-bar');
    DOM_ELEMENTS.progressText = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-text');
}

const taskBubbles = {}; // Объект для хранения ссылок на DOM-элементы "пузырей" по их taskId
const CHECK_STATUS_INTERVAL_MS = 3000; // Интервал опроса статусов (3 секунды)

let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]'); // Массив для хранения данных о видео
let pollingIntervalId = null; // ID интервала для опроса статусов
let selectedVideoIds = []; // Массив для хранения ID выбранных видео-пузырьков

// --- Вспомогательные функции ---

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
function showMetadataModal(filename, metadata) {
    if (DOM_ELEMENTS.modalTitle) DOM_ELEMENTS.modalTitle.textContent = `Метаданные для: ${filename}`;
    if (DOM_ELEMENTS.modalMetadata) DOM_ELEMENTS.modalMetadata.textContent = typeof metadata === 'object' && metadata !== null ? JSON.stringify(metadata, null, 2) : String(metadata);
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
        DOM_ELEMENTS.uploadStatusText.className = `upload-status-text status-${type}`; // Применяем класс для стилизации
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
 * @param {'info'|'success'|'error'|'pending'} type Тип сообщения для стилизации.
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
                shotstackUrl: null
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
            updateUploadStatusDisplay(`Ошибка загрузки для ${erroredFile.name}: ${error.error || 'Неизвестная ошибка'}`, 'error');
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
    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.error}`);
        }
        const data = await response.json();
        return data;
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
    let tasksStillPending = false; 

    // Фильтруем только те видео, которые требуют опроса статуса
    const videosToPoll = uploadedVideos.filter(v => 
        v.status !== 'completed' && v.status !== 'error' && v.status !== 'failed' && 
        v.status !== 'concatenated_completed' && v.status !== 'concatenated_failed'
    );

    // Только запускаем опрос, если есть активный интервал и нет ожидающих задач
    if (videosToPoll.length === 0 && uploadedVideos.length > 0) {
        // Все существующие задачи завершены
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            displayGeneralStatus('Все процессы обработки видео завершены. Ознакомьтесь с результатами ниже.', 'completed');
            console.log("[FRONTEND] All tasks completed or errored. Polling stopped.");
        }
    } else if (uploadedVideos.length === 0) {
        displayGeneralStatus('Видео еще не загружены. Перейдите на страницу загрузки.', 'info');
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
        return;
    }

    for (const video of videosToPoll) {
        const taskId = video.id;
        const updatedTask = await getTaskStatus(taskId);

        const index = uploadedVideos.findIndex(v => v.id === taskId);
        if (index !== -1) {
            // Обновляем существующий элемент
            uploadedVideos[index] = { ...uploadedVideos[index], ...updatedTask };
        } else {
            // Это новый элемент (например, объединенное видео), добавляем его
            uploadedVideos.push(updatedTask);
        }

        createOrUpdateBubble(taskId, uploadedVideos[index] || updatedTask); 

        // Проверяем, есть ли еще незавершенные задачи
        if (uploadedVideos[index] && uploadedVideos[index].status !== 'completed' && uploadedVideos[index].status !== 'error' && uploadedVideos[index].status !== 'failed' && uploadedVideos[index].status !== 'concatenated_completed' && uploadedVideos[index].status !== 'concatenated_failed') {
            tasksStillPending = true;
        }
    }

    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos)); 
    updateConcatenationUI(); 

    // Запускаем/останавливаем интервал опроса
    if (tasksStillPending && !pollingIntervalId) {
        pollingIntervalId = setInterval(checkTaskStatuses, CHECK_STATUS_INTERVAL_MS);
    } else if (!tasksStillPending && pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
        displayGeneralStatus('Все процессы обработки видео завершены. Ознакомьтесь с результатами ниже.', 'completed');
        console.log("[FRONTEND] All tasks completed or errored. Polling stopped.");
    }
}


/**
 * Создает или обновляет DOM-элемент "пузыря" для видео.
 * @param {string} taskId Идентификатор задачи.
 * @param {Object} data Объект с данными видео (id, original_filename, status, metadata и т.д.).
 */
function createOrUpdateBubble(taskId, data) {
    let bubble = taskBubbles[taskId];
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'video-bubble loading'; 
        bubble.id = `bubble-${taskId}`;
        if (DOM_ELEMENTS.bubblesContainer) DOM_ELEMENTS.bubblesContainer.appendChild(bubble);
        taskBubbles[taskId] = bubble;

        // Удаляем стартовое сообщение "No tasks found", если оно есть
        const initialMessage = document.getElementById('statusMessage');
        if (initialMessage && initialMessage.textContent.includes('No tasks found')) {
            initialMessage.remove();
        }
    }

    let filenameText = `<h3 class="bubble-title-overlay">${data.original_filename || `Задача ${taskId}`}</h3>`;
    let previewHtml = '';
    let statusMessageText = '';
    let actionButtonsHtml = '';
    let checkboxHtml = '';

    // Добавляем чекбокс к каждому видео-пузырьку, кроме объединенных видео
    if (!taskId.startsWith('concatenated_video_')) { 
        checkboxHtml = `
            <label class="checkbox-container">
                <input type="checkbox" class="video-select-checkbox" data-task-id="${taskId}" ${selectedVideoIds.includes(taskId) ? 'checked' : ''}>
                <span class="checkmark"></span>
            </label>
        `;
    }

    switch (data.status) {
        case 'completed': 
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewHtml = `<img class="bubble-preview-img" src="${thumbnailUrl}" alt="Предпросмотр видео">`;
            statusMessageText = '<p class="status-message-bubble status-completed">Нажмите для просмотра метаданных</p>';
            bubble.classList.remove('loading');
            break;
        case 'uploaded': 
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Видео загружается">`;
            statusMessageText = `<p class="status-message-bubble status-info">Загружено, ожидание обработки...</p>`;
            bubble.classList.add('loading');
            break;
        case 'processing': 
        case 'shotstack_pending': 
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Видео обрабатывается">`;
            statusMessageText = `<p class="status-message-bubble status-pending">Обработка видео (Shotstack)...</p>`;
            bubble.classList.add('loading');
            break;
        case 'concatenated_pending': 
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Объединенное видео обрабатывается">`;
            statusMessageText = `<p class="status-message-bubble status-pending">Объединение видео...</p>`;
            bubble.classList.add('loading');
            break;
        case 'concatenated_completed': 
            if (data.shotstackUrl) {
                previewHtml = `
                    <video class="bubble-preview-video" controls playsinline muted>
                        <source src="${data.shotstackUrl}" type="video/mp4">
                        Ваш браузер не поддерживает видео.
                    </video>
                `;
                statusMessageText = '<p class="status-message-bubble status-success">Объединение завершено!</p>';
                actionButtonsHtml += `<a href="${data.shotstackUrl}" target="_blank" class="action-button view-generated-button">Посмотреть сгенерированное видео</a>`;
            } else {
                previewHtml = `<img class="bubble-preview-img" src="assets/error_placeholder.png" alt="Ошибка: URL отсутствует">`;
                statusMessageText = '<p class="status-message-bubble status-error">Объединение завершено, но URL отсутствует.</p>';
            }
            bubble.classList.remove('loading');
            break;
        case 'error':
        case 'failed':
        case 'concatenated_failed': 
            previewHtml = `<img class="bubble-preview-img" src="assets/error_placeholder.png" alt="Ошибка обработки">`;
            statusMessageText = `<p class="status-message-bubble status-error">Ошибка: ${data.message || 'Неизвестная ошибка.'}</p>`;
            bubble.classList.remove('loading');
            break;
        default: 
            previewHtml = `<img class="bubble-preview-img" src="assets/video_placeholder.png" alt="Статус неизвестен">`;
            statusMessageText = '<p class="status-message-bubble status-info">Получение статуса...</p>';
            bubble.classList.add('loading');
            break;
    }

    bubble.innerHTML = `
        ${checkboxHtml}
        ${previewHtml}
        <div class="bubble-text-overlay">
            ${filenameText}
            ${statusMessageText}
            <div class="bubble-actions">
                ${actionButtonsHtml}
            </div>
        </div>
    `;

    // Устанавливаем обработчик для модального окна метаданных
    // Только если статус "completed" и есть метаданные
    if (data.status === 'completed' && data.metadata && Object.keys(data.metadata).length > 0) {
        bubble.onclick = (event) => {
            // Убеждаемся, что клик не был по чекбоку
            if (!event.target.classList.contains('video-select-checkbox')) {
                showMetadataModal(data.original_filename || `Задача ${taskId}`, data.metadata);
            }
        };
        bubble.style.cursor = 'pointer';
    } else {
        bubble.onclick = null; 
        bubble.style.cursor = 'default';
    }

    // Обработчик для чекбокса выбора видео
    const checkbox = bubble.querySelector('.video-select-checkbox');
    if (checkbox) {
        checkbox.addEventListener('change', (event) => {
            const id = event.target.dataset.taskId;
            if (event.target.checked) {
                if (!selectedVideoIds.includes(id)) {
                    selectedVideoIds.push(id);
                }
            } else {
                selectedVideoIds = selectedVideoIds.filter(selectedId => selectedId !== id);
            }
            console.log("DEBUG: selectedVideoIds updated:", selectedVideoIds);
            updateConcatenationUI(); // Обновляем UI после изменения выбора
        });
    }

    // Удаляем старую кнопку "Generate with Shotstack" и ее логику
    // Теперь обработка индивидуальных видео также идет через кнопку "Обработать выбранные видео"
    // и эндпоинт /process_videos
    const generateButton = bubble.querySelector('.generate-button');
    if (generateButton) {
        generateButton.remove(); // Удаляем кнопку
    }
}

/**
 * Обновляет состояние кнопки "Обработать выбранные видео" и статус сообщений.
 */
function updateConcatenationUI() {
    const numSelected = selectedVideoIds.length;
    const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;

    if (!DOM_ELEMENTS.processSelectedVideosButton || !DOM_ELEMENTS.concatenationStatusDiv) return;

    if (numSelected === 0) {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'none';
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Выберите видео для обработки или объединения.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
    } else {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'inline-block';
        if (shouldConnect) {
            if (numSelected < 2) {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Объединить видео';
                DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Выберите 2 или более видео для объединения.';
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
            } else {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = `Объединить ${numSelected} видео`;
                DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к объединению ${numSelected} видео.`;
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status success';
            }
        } else { // Обработка без объединения
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            DOM_ELEMENTS.processSelectedVideosButton.textContent = `Обработать ${numSelected} видео`;
            DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к обработке ${numSelected} видео.`;
            DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
        }
    }

    // Отключаем/включаем чекбокс объединения, если нет 2+ видео или они не "completed"
    const completedVideosCount = uploadedVideos.filter(v => v.status === 'completed' && !v.id.startsWith('concatenated_video_')).length;
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        if (completedVideosCount < 2) {
            DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
            if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '0.5';
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'not-allowed';
            }
            DOM_ELEMENTS.connectVideosCheckbox.checked = false; // Сбрасываем, если неактуально
        } else {
            DOM_ELEMENTS.connectVideosCheckbox.disabled = false;
            if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '1';
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'pointer';
            }
        }
    }

    // Если есть активные задачи обработки/объединения, отключить кнопки
    const anyVideoProcessing = uploadedVideos.some(v => v.status === 'processing' || v.status === 'shotstack_pending' || v.status === 'concatenated_pending');
    if (anyVideoProcessing) {
        if (DOM_ELEMENTS.processSelectedVideosButton) DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
        if (DOM_ELEMENTS.connectVideosCheckbox) DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Видео обрабатываются. Пожалуйста, подождите.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status pending';
    }
}


// --- Инициализация при загрузке DOM ---
document.addEventListener('DOMContentLoaded', () => {
    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');
    const linkedin = localStorage.getItem('hifeLinkedin'); 

    let headerText = 'Ваши Видео';
    if (username) {
        headerText = `Ваши Видео для @${username}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: @${username}`;
    } else if (email) {
        headerText = `Ваши Видео для ${email}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: ${email}`;
    } else if (linkedin) { 
        headerText = `Ваши Видео для ${linkedin}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: ${linkedin}`;
    } else {
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = 'Для: Гость';
    }
    if (DOM_ELEMENTS.resultsHeader) DOM_ELEMENTS.resultsHeader.textContent = headerText;

    // Управление кнопкой "Upload New Video(s)"
    if (username || email || linkedin) {
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

    // Загружаем и отображаем уже загруженные видео при загрузке страницы
    uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]'); // Обновим глобальную переменную

    if (uploadedVideos.length === 0) {
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
    } else {
        if (DOM_ELEMENTS.bubblesContainer) DOM_ELEMENTS.bubblesContainer.innerHTML = ''; 
        uploadedVideos.forEach(video => {
            createOrUpdateBubble(video.id, video);
        });
        // Начинаем опрос статусов для всех видео
        checkTaskStatuses(); 
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
        if (uploadedVideos.length > 0) {
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

    // Обработчик изменения чекбокса "Объединить выбранные видео"
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        DOM_ELEMENTS.connectVideosCheckbox.addEventListener('change', updateConcatenationUI);
    }

    // Обработчик кнопки "Обработать/Объединить выбранные видео"
    if (DOM_ELEMENTS.processSelectedVideosButton) {
        DOM_ELEMENTS.processSelectedVideosButton.addEventListener('click', async () => {
            const username = localStorage.getItem('hifeUsername');
            const email = localStorage.getItem('hifeEmail');
            const linkedin = localStorage.getItem('hifeLinkedin');
            const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;

            // Отфильтровываем только те видео, которые выбраны и имеют статус 'completed'
            const videosToProcess = uploadedVideos.filter(video => 
                selectedVideoIds.includes(video.id) && video.status === 'completed'
            );
            
            const taskIdsToProcess = videosToProcess.map(video => video.id);

            if (taskIdsToProcess.length === 0) {
                displayGeneralStatus('Пожалуйста, выберите хотя бы одно завершенное видео для обработки.', 'error');
                return;
            }

            if (shouldConnect && taskIdsToProcess.length < 2) {
                displayGeneralStatus('Для объединения выберите 2 или более видео.', 'error');
                return;
            }

            // Проверяем, есть ли уже обрабатываемые/объединяемые видео
            const anyVideoProcessing = uploadedVideos.some(v => v.status === 'processing' || v.status === 'shotstack_pending' || v.status === 'concatenated_pending');
            if (anyVideoProcessing) {
                displayGeneralStatus('Дождитесь завершения текущих процессов обработки/объединения.', 'pending');
                return;
            }

            try {
                // Вызываем функцию из process_videos.js, передавая RENDER_BACKEND_URL
                const result = await processVideosFromSelection(
                    taskIdsToProcess, 
                    shouldConnect, 
                    username, 
                    email, 
                    linkedin,
                    displayGeneralStatus, // Функция для обновления статуса внутри process_videos.js
                    displayGeneralStatus, // Функция для обновления общего статуса
                    RENDER_BACKEND_URL // Передаем URL бэкенда
                );

                if (result) { // Проверяем, что result не null (не было внутренней ошибки)
                    // Если это объединение, бэкенд должен вернуть новый taskId для объединенного видео
                    if (shouldConnect && result.concatenated_task_id) {
                        const newConcatenatedVideo = {
                            id: result.concatenated_task_id,
                            original_filename: 'Объединенное Видео', 
                            status: 'concatenated_pending', 
                            timestamp: new Date().toISOString(),
                            cloudinary_url: null, 
                            shotstackRenderId: result.shotstackRenderId || null,
                            shotstackUrl: result.shotstackUrl || null 
                        };
                        uploadedVideos.push(newConcatenatedVideo);
                        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                        createOrUpdateBubble(newConcatenatedVideo.id, newConcatenatedVideo); 
                    } else {
                        // Для индивидуальной обработки просто обновляем статусы существующих видео
                        // Если бэкенд возвращает список "initiated_tasks", используем его
                        if (result.initiated_tasks && Array.isArray(result.initiated_tasks)) {
                            result.initiated_tasks.forEach(initiatedTask => {
                                const index = uploadedVideos.findIndex(v => v.id === initiatedTask.taskId);
                                if (index !== -1) {
                                    uploadedVideos[index].status = initiatedTask.status || 'shotstack_pending';
                                    uploadedVideos[index].shotstackRenderId = initiatedTask.shotstackRenderId || null;
                                    uploadedVideos[index].message = initiatedTask.message || '';
                                    createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                                }
                            });
                        } else if (result.shotstackRenderId && taskIdsToProcess.length === 1) { // Если один видео, и бэкенд возвращает RenderId
                            const index = uploadedVideos.findIndex(v => v.id === taskIdsToProcess[0]);
                            if (index !== -1) {
                                uploadedVideos[index].status = 'shotstack_pending';
                                uploadedVideos[index].shotstackRenderId = result.shotstackRenderId;
                                uploadedVideos[index].message = result.message || '';
                                createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                            }
                        }
                        else {
                            // Если бэкенд не вернул initiated_tasks для множества, просто обновляем выбранные на 'shotstack_pending'
                            uploadedVideos = uploadedVideos.map(video => {
                                if (taskIdsToProcess.includes(video.id)) {
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
                }
            } catch (error) {
                // Ошибка уже обработана внутри processVideosFromSelection и displayGeneralStatus
                console.error('Ошибка в обработчике processSelectedVideosButton:', error);
            } finally {
                updateConcatenationUI(); 
            }
        });
    }

    // Начальное обновление UI объединения при загрузке страницы
    updateConcatenationUI();
});
