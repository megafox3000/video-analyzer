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

// Глобальная переменная для хранения данных о видео.
// Она будет инициализироваться при загрузке скрипта и обновляться функцией checkTaskStatuses.
let uploadedVideos = []; 
let pollingIntervalId = null; // ID интервала для опроса статусов
let selectedVideoIds = []; // Больше не используется для объединения/выбора, оставлен на случай будущих нужд

// Добавляем глобальный лог при загрузке скрипта, чтобы убедиться, что uploadedVideos инициализируется правильно
console.log("DEBUG: Script initialized. uploadedVideos is currently:", uploadedVideos);


const taskBubbles = {}; // Объект для хранения ссылок на DOM-элементы "пузырей" по их videoId (Cloudinary ID)
const CHECK_STATUS_INTERVAL_MS = 3000; // Интервал опроса статусов (3 секунды)


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
            selectFilesButton: DOM_ELEMENTS.uploadNewBtn, // Передаем DOM_ELEMENTS.uploadNewBtn (не используется в этом контексте)
            uploadNewBtn: DOM_ELEMENTS.uploadNewBtn, // Передаем кнопку для results.js
            progressBar: DOM_ELEMENTS.progressBar,
            progressText: DOM_ELEMENTS.progressText,
            progressBarContainer: DOM_ELEMENTS.progressBarContainer
        },
        (response, uploadedFile) => { 
            const taskId = response.taskId; // Это строковый ID Cloudinary из ответа бэкенда
            updateUploadStatusDisplay(`Видео загружено. ID задачи: ${taskId}. Ожидание обработки.`, 'pending');
            resetProgressBar();

            let newVideoEntry = {
                // Используем taskId (строковый) как основной 'id' для фронтенда
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

            createOrUpdateBubble(taskId, newVideoEntry); // Используем taskId для bubble ID
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
        // Убедимся, что возвращаемый ID всегда является строковым ID задачи,
        // который мы использовали для запроса, даже если бэкенд возвращает другие ID.
        // Это КЛЮЧЕВОЕ ИЗМЕНЕНИЕ для сохранения консистентности.
        // Backend now returns 'taskId' (string Cloudinary ID) AND 'id' (numeric DB ID)
        // We use taskId from the response if available, otherwise fallback to the requested taskId
        return { ...data, id: data.taskId || taskId }; 
    } catch (error) {
        console.error(`[FRONTEND] Network error checking status for task ${taskId}:`, error);
        // Важно: возвращаем taskId в поле 'id', чтобы фронтенд мог идентифицировать задачу, даже если она провалилась
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

    // Используем актуальные uploadedVideos из localStorage для polling
    // ВСЕГДА перечитываем uploadedVideos, чтобы быть уверенными, что работаем с последней версией
    uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    console.log("DEBUG: uploadedVideos reloaded from localStorage at checkTaskStatuses start:", uploadedVideos);


    const videosToPoll = uploadedVideos.filter(v => 
        // Добавляем проверку, что v.id существует и является строкой перед polling'ом
        v.id && typeof v.id === 'string' &&
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

    // Создаем копию массива, чтобы избежать проблем с изменением во время итерации
    const currentUploadedVideos = [...uploadedVideos]; 

    for (const video of currentUploadedVideos) {
        const videoId = video.id; // ИСПОЛЬЗУЕМ video.id (строковый Cloudinary ID) ДЛЯ ЗАПРОСА СТАТУСА
        
        // Проверяем, что videoId корректен перед отправкой запроса
        if (!videoId || typeof videoId !== 'string') {
            console.warn(`[FRONTEND] Skipping polling for invalid videoId: ${videoId}. Video object:`, video);
            continue; // Пропускаем эту итерацию, если ID недействителен
        }

        const currentLocalStatus = video.status; // Текущий статус в локальном хранилище
        const updatedTask = await getTaskStatus(videoId); // updatedTask теперь содержит {id: string (Cloudinary ID) , status: ..., ...}
        const newRemoteStatus = updatedTask.status; // Новый статус от бэкенда

        console.log(`DEBUG: Polling task ${videoId}. Local status: "${currentLocalStatus}". Remote status: "${newRemoteStatus}".`); // Добавлено

        // ИСПОЛЬЗУЕМ videoId (строковый) ДЛЯ ПОИСКА ИНДЕКСА
        const index = uploadedVideos.findIndex(v => v.id === videoId);
        if (index !== -1) {
            // ОБНОВЛЯЕМ СУЩЕСТВУЮЩИЙ ЭЛЕМЕНТ: Явно присваиваем поля, НЕ перезаписывая uploadedVideos[index].id
            // (который всегда должен оставаться строковым Cloudinary ID).
            uploadedVideos[index].status = updatedTask.status;
            // original_filename может измениться, если бэкенд его переименовал
            uploadedVideos[index].original_filename = updatedTask.originalFilename || uploadedVideos[index].original_filename;
            uploadedVideos[index].cloudinary_url = updatedTask.cloudinary_url || uploadedVideos[index].cloudinary_url;
            uploadedVideos[index].metadata = updatedTask.metadata || uploadedVideos[index].metadata;
            uploadedVideos[index].message = updatedTask.message || uploadedVideos[index].message;
            uploadedVideos[index].shotstackRenderId = updatedTask.shotstackRenderId || uploadedVideos[index].shotstackRenderId;
            uploadedVideos[index].shotstackUrl = updatedTask.shotstackUrl || uploadedVideos[index].shotstackUrl;
            // Поле `id` (строковый Cloudinary ID) НЕ ТРОГАЕМ, оно уже установлено корректно.
            console.log(`DEBUG: Task ${videoId} updated in uploadedVideos. New local object status: "${uploadedVideos[index].status}". Metadata exists: ${!!uploadedVideos[index].metadata && Object.keys(uploadedVideos[index].metadata).length > 0}. Current object ID (should be string): ${uploadedVideos[index].id}`); // Добавлено
        } else {
            // ЭТО БЛОК ДЛЯ ДОБАВЛЕНИЯ НОВЫХ ЗАДАЧ (например, объединенное видео), которых еще нет в списке uploadedVideos.
            // Убеждаемся, что id нового элемента - это строковый Cloudinary ID, который нам нужен.
            // updatedTask.id от getTaskStatus, когда ошибка, уже строковый.
            // Для Shotstack-задач бэкенд возвращает `concatenated_task_id` в ответе на изначальный запрос объединения,
            // но `getTaskStatus` должен возвращать его как `id`.
            const newEntryId = updatedTask.id || updatedTask.taskId; 
            if (newEntryId && typeof newEntryId === 'string') { // Только если ID корректен
                uploadedVideos.push({
                    id: newEntryId, // Это строковый Cloudinary ID или ID объединенного видео
                    original_filename: updatedTask.originalFilename || `Задача ${newEntryId}`,
                    status: updatedTask.status,
                    timestamp: updatedTask.timestamp,
                    cloudinary_url: updatedTask.cloudinary_url,
                    metadata: updatedTask.metadata,
                    message: updatedTask.message,
                    shotstackRenderId: updatedTask.shotstackRenderId,
                    shotstackUrl: updatedTask.shotstackUrl
                });
                console.log(`DEBUG: New task ${newEntryId} added to uploadedVideos. Status: "${updatedTask.status}". Metadata exists: ${!!updatedTask.metadata && Object.keys(updatedTask.metadata).length > 0}. New object ID (should be string): ${newEntryId}`); // Добавлено
            } else {
                console.warn(`DEBUG: Could not add new task from polling result due to invalid ID:`, updatedTask);
            }
        }
        // ДОБАВЛЕНО: Полный лог uploadedVideos после обработки каждой задачи
        console.log("DEBUG: Current uploadedVideos array after processing task:", uploadedVideos);

        // Используем videoId (строковый) для bubble ID
        // Находим актуальный объект видео после потенциальных обновлений, чтобы передать его в createOrUpdateBubble
        const videoToRender = uploadedVideos.find(v => v.id === videoId);
        if (videoToRender) {
             createOrUpdateBubble(videoId, videoToRender); 
        } else {
            console.warn(`DEBUG: Could not find video ${videoId} in uploadedVideos to render bubble. It might have been filtered out or is invalid.`);
        }

        // Проверяем, есть ли еще незавершенные задачи
        if (uploadedVideos.find(v => v.id === videoId) && uploadedVideos.find(v => v.id === videoId).status !== 'completed' && uploadedVideos.find(v => v.id === videoId).status !== 'error' && uploadedVideos.find(v => v.id === videoId).status !== 'failed' && uploadedVideos.find(v => v.id === videoId).status !== 'concatenated_completed' && uploadedVideos.find(v => v.id === videoId).status !== 'concatenated_failed') {
            tasksStillPending = true;
        }
    }

    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos)); 
    console.log("DEBUG: localStorage 'uploadedVideos' content after checkTaskStatuses:", localStorage.getItem('uploadedVideos')); // Лог localStorage
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
 * Теперь создает обертку (video-grid-item) для превью.
 * @param {string} videoId Идентификатор видео (строковый Cloudinary ID).
 * @param {Object} data Объект с данными видео (id, original_filename, status, metadata и т.д.).
 */
function createOrUpdateBubble(videoId, data) {
    let videoGridItem = taskBubbles[videoId]; // Храним обертку здесь
    let bubble; // Сам элемент круглого видео-пузыря

    if (!videoGridItem) {
        // Пузырек не существует, создаем его
        videoGridItem = document.createElement('div');
        videoGridItem.className = 'video-grid-item'; // Новый класс-обертка
        videoGridItem.id = `video-item-${videoId}`; // Уникальный ID для обертки (на основе Cloudinary ID)

        bubble = document.createElement('div');
        bubble.className = 'video-bubble loading';
        bubble.id = `bubble-${videoId}`; // Пузырь сохраняет свой ID

        videoGridItem.appendChild(bubble); // Добавляем пузырь в новую обертку
        if (DOM_ELEMENTS.bubblesContainer) DOM_ELEMENTS.bubblesContainer.appendChild(videoGridItem);
        taskBubbles[videoId] = videoGridItem; // Сохраняем обертку для будущих обновлений

        // Удаляем стартовое сообщение "No tasks found", если оно есть
        const initialMessage = document.getElementById('statusMessage');
        if (initialMessage && initialMessage.textContent.includes('No tasks found')) {
            initialMessage.remove();
        }
    } else {
        // Пузырек существует, находим его дочерний элемент 'video-bubble'
        bubble = videoGridItem.querySelector('.video-bubble');
    }

    // Теперь обновляем содержимое пузырька, независимо от того, был ли он создан или найден
    let filenameText = `<h3 class="bubble-title-overlay">${data.original_filename || `Задача ${videoId}`}</h3>`;
    let statusMessageText = '';
    let actionButtonsHtml = '';
    let thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url); // Получаем URL миниатюры

    // Обновляем innerHTML пузыря (круглой части) в зависимости от статуса
    switch (data.status) {
        case 'completed':
            statusMessageText = '<p class="status-message-bubble status-completed">Нажмите для просмотра метаданных</p>';
            bubble.classList.remove('loading');
            break;
        case 'uploaded':
            statusMessageText = `<p class="status-message-bubble status-info">Загружено, ожидание обработки...</p>`;
            bubble.classList.add('loading');
            break;
        case 'processing':
        case 'shotstack_pending':
            statusMessageText = `<p class="status-message-bubble status-pending">Обработка видео (Shotstack)...</p>`;
            bubble.classList.add('loading');
            break;
        case 'concatenated_pending':
            statusMessageText = `<p class="status-message-bubble status-pending">Объединение видео...</p>`;
            bubble.classList.add('loading');
            break;
        case 'concatenated_completed':
            if (data.shotstackUrl) {
                statusMessageText = '<p class="status-message-bubble status-success">Объединение завершено!</p>';
                actionButtonsHtml += `<a href="${data.shotstackUrl}" target="_blank" class="action-button view-generated-button">Посмотреть сгенерированное видео</a>`;
            } else {
                statusMessageText = '<p class="status-message-bubble status-error">Объединение завершено, но URL отсутствует.</p>';
            }
            bubble.classList.remove('loading');
            break;
        case 'error':
        case 'failed':
        case 'concatenated_failed':
            statusMessageText = `<p class="status-message-bubble status-error">Ошибка: ${data.message || 'Неизвестная ошибка.'}</p>`;
            bubble.classList.remove('loading');
            break;
        default:
            statusMessageText = '<p class="status-message-bubble status-info">Получение статуса...</p>';
            bubble.classList.add('loading');
            break;
    }

    // Добавляем изображение миниатюры
    bubble.innerHTML = `
        <img src="${thumbnailUrl}" alt="Видео превью" class="video-thumbnail">
        <div class="bubble-text-overlay">
            ${filenameText}
            ${statusMessageText}
            <div class="bubble-actions">
                ${actionButtonsHtml}
            </div>
        </div>
    `;

    // --- ИЗМЕНЕНИЕ: Убираем обработку клика по пузырьку и показ модального окна ---
    // Убедимся, что нет никаких обработчиков кликов, и курсор по умолчанию.
    videoGridItem.style.cursor = 'default'; 
    videoGridItem.classList.remove('selected-bubble'); // Убираем любой класс "выбрано"

    // Удаляем старую кнопку "Generate with Shotstack" и ее логику, если она присутствует
    const generateButton = bubble.querySelector('.generate-button');
    if (generateButton) {
        generateButton.remove(); // Удаляем кнопку
    }
}

// --- ИЗМЕНЕНИЕ: Функция handleBubbleClick удалена, так как она больше не нужна ---
// Клик по пузырьку теперь не вызывает модальное окно.

/**
 * Обновляет состояние кнопки "Обработать выбранные видео" и статус сообщений.
 * Теперь состояние чекбокса "Объединить видео" учитывается.
 */
function updateConcatenationUI() {
    const completedVideos = uploadedVideos.filter(v => v.status === 'completed' && !String(v.id).startsWith('concatenated_video_'));
    const numCompletedVideos = completedVideos.length;

    console.log("DEBUG: updateConcatenationUI called.");
    console.log("DEBUG: numCompletedVideos:", numCompletedVideos);
    // Получаем фактическое состояние чекбокса "Объединить видео"
    const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false; 
    console.log("DEBUG: shouldConnect (actual checkbox state):", shouldConnect);

    if (DOM_ELEMENTS.processSelectedVideosButton) {
        console.log("DEBUG: processSelectedVideosButton found. Current disabled state:", DOM_ELEMENTS.processSelectedVideosButton.disabled);
    } else {
        console.log("DEBUG: processSelectedVideosButton NOT found!");
    }


    if (!DOM_ELEMENTS.processSelectedVideosButton || !DOM_ELEMENTS.concatenationStatusDiv) return;

    // Чекбокс "Connect videos" теперь будет доступен, если есть 2+ завершенных видео.
    // Его состояние (checked/unchecked) контролируется пользователем, не сбрасывается автоматически.
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        if (numCompletedVideos < 2) {
            DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
            if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '0.5';
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'not-allowed';
            }
            // Состояние checked НЕ СБРАСЫВАЕМ автоматически
            console.log("DEBUG: Connect checkbox disabled (less than 2 completed videos).");
        } else {
            DOM_ELEMENTS.connectVideosCheckbox.disabled = false;
            if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '1';
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'pointer';
            }
            console.log("DEBUG: Connect checkbox enabled (2+ completed videos).");
        }
    }


    if (numCompletedVideos === 0) {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'none';
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Нет готовых видео для обработки или объединения. Загрузите видео.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
        console.log("DEBUG: No completed videos. Button hidden.");
    } else {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'inline-block';
        if (shouldConnect) { // Если чекбокс "Объединить" включен
            if (numCompletedVideos < 2) {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Объединить видео';
                DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Для объединения необходимо 2 или более завершенных видео.';
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
                console.log("DEBUG: Connect option checked, but less than 2 completed. Button disabled.");
            } else {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = `Объединить все ${numCompletedVideos} видео`;
                DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к объединению всех ${numCompletedVideos} завершенных видео.`;
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status success';
                console.log("DEBUG: Ready to concatenate all completed videos. Button enabled.");
            }
        } else { // Если чекбокс "Объединить" выключен (т.е. индивидуальная обработка)
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            DOM_ELEMENTS.processSelectedVideosButton.textContent = `Обработать все ${numCompletedVideos} видео`;
            DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к индивидуальной обработке всех ${numCompletedVideos} видео.`;
            DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
            console.log("DEBUG: Ready for individual processing of all completed videos. Button enabled.");
        }
    }


    // Если есть активные задачи обработки/объединения, отключить кнопки
    const anyVideoProcessing = uploadedVideos.some(v => v.status === 'processing' || v.status === 'shotstack_pending' || v.status === 'concatenated_pending');
    if (anyVideoProcessing) {
        if (DOM_ELEMENTS.processSelectedVideosButton) DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
        if (DOM_ELEMENTS.connectVideosCheckbox) DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Видео обрабатываются. Пожалуйста, подождите.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status pending';
        console.log("DEBUG: Active video processing detected. Buttons disabled.");
    }
}


// --- Инициализация при загрузке DOM ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired.");
    // Инициализируем uploadedVideos из localStorage только один раз при загрузке DOM
    uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    console.log("DEBUG: uploadedVideos after DOMContentLoaded and initial load from localStorage:", uploadedVideos);


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
    if (uploadedVideos.length === 0) {
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
    } else {
        if (DOM_ELEMENTS.bubblesContainer) DOM_ELEMENTS.bubblesContainer.innerHTML = '';
        uploadedVideos.forEach(video => {
            createOrUpdateBubble(video.id, video); // ИСПОЛЬЗУЕМ video.id (строковый Cloudinary ID) ДЛЯ ID ЭЛЕМЕНТА DOM
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
                            shotstackUrl: result.shotstackUrl || null,
                            posterUrl: null // <--- ДОБАВЬТЕ ЭТУ СТРОКУ: Инициализируем posterUrl как null
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
                displayGeneralStatus(`Произошла неожиданная ошибка: ${error.message || 'Неизвестная ошибка'}`, 'error');
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
});
