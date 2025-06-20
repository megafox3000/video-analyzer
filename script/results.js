// В начале вашего скрипта/results.js
console.log("DEBUG: results.js loaded and executing.");

// УКАЖИТТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// Импортируем функцию загрузки из cloudinary_upload.js
import { uploadFileToCloudinary } from './cloudinary_upload.js';
// Импортируем новую функцию для обработки видео из process_videos.js
import { processVideosFromSelection } from './process_videos.js';

// --- Константы и глобальные переменные для таймера неактивности ---
let inactivityTimeout;
const INACTIVITY_THRESHOLD = 90 * 1000; // 90 секунд в миллисекундах

/**
 * Сбрасывает таймер неактивности.
 * Вызывается при любой активности пользователя.
 */
function resetInactivityTimer() {
    clearTimeout(inactivityTimeout); // Очищаем существующий таймер
    inactivityTimeout = setTimeout(handleInactivity, INACTIVITY_THRESHOLD); // Устанавливаем новый
    console.log("[Inactivity Timer] Таймер неактивности сброшен на results.js.");
}

/**
 * Обрабатывает неактивность пользователя: закрывает сессию и перенаправляет.
 * Вызывается, когда таймер неактивности истекает.
 */
function handleInactivity() {
    console.log("[Inactivity Timer] Пользователь неактивен в течение 90 секунд на results.js. Закрытие сессии и перенаправление на index.html.");

    setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('index.html'); // Перенаправляем на index.html
    }, 100);
}

// Добавляем слушатели событий к документу для отслеживания активности пользователя
// При каждом из этих событий таймер неактивности будет сбрасываться.
document.addEventListener('mousemove', resetInactivityTimer); // Движение мыши
document.addEventListener('keypress', resetInactivityTimer); // Нажатие клавиши
document.addEventListener('click', resetInactivityTimer);    // Клик мышью
document.addEventListener('scroll', resetInactivityTimer);   // Прокрутка страницы

// Инициализируем таймер при загрузке скрипта
// Это запускает отсчет с самого начала
resetInactivityTimer();

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
let selectedVideosForConcatenation = []; // Массив для выбранных видео для объединения

// Добавляем глобальный лог при загрузке скрипта, чтобы убедиться, что uploadedVideos инициализируется правильно
console.log("DEBUG: Script initialized. uploadedVideos is currently:", uploadedVideos);


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
function showMetadataModal(filename, metadata) {
    if (DOM_ELEMENTS.modalTitle) DOM_ELEMENTS.modalTitle.textContent = `Метаданные для: ${sanitizeHTML(filename)}`; // Sanitized
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
 * @param {'info'|'success'|'error'|'pending'|'completed'} type Тип сообщения для стилизации.
 */
function displayGeneralStatus(message, type) {
    if (DOM_ELEMENTS.concatenationStatusDiv) {
        DOM_ELEMENTS.concatenationStatusDiv.textContent = message;
        DOM_ELEMENTS.concatenationStatusDiv.className = `concatenation-status ${type}`;
    }
}
/**
 * Функция для отображения статуса обработки в модальном окне или другом элементе,
 * если у вас есть отдельный UI для этого.
 * В данном случае, мы будем использовать displayGeneralStatus, так как
 * process_videos.js передает две функции, но у нас в results.js одна для отображения.
 * @param {string} message Сообщение для отображения.
 * @param {'info'|'success'|'error'|'warning'|'completed'|'pending'} type Тип сообщения для стилизации.
 */
function displayProcessStatus(message, type) {
    // В данном случае, мы просто перенаправляем на displayGeneralStatus,
    // так как в results.js у нас может быть только один общий статус.
    // Если у вас есть отдельный элемент UI для "processStatus", используйте его здесь.
    console.log(`DEBUG: [Process Status] ${type}: ${message}`);
    displayGeneralStatus(message, type); // Используем основную функцию статуса
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
                status: 'uploaded', // Начальный статус после загрузки
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
            updateUploadStatusDisplay(`Ошибка загрузки для ${erroredFile.name}: ${sanitizeHTML(error.error || 'Неизвестная ошибка')}`, 'error'); // Sanitized message
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
        console.log(`DEBUG: [getTaskStatus] Отправка запроса на: ${RENDER_BACKEND_URL}/task-status/${taskId}`);
        const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`DEBUG: [getTaskStatus] Ошибка HTTP! Статус: ${response.status}, Данные ошибки:`, errorData);
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.error}`);
        }
        const data = await response.json();
        console.log("DEBUG: [getTaskStatus] Получены данные статуса:", data);
        // Убедимся, что возвращаемый ID всегда является строковым ID задачи,
        // который мы использовали для запроса, даже если бэкенд возвращает другие ID.
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
 * Асинхронно проверяет статус объединенного видео на бэкенде.
 * ЭТА ФУНКЦИЯ ДОЛЖНА БЫТЬ РЕАЛИЗОВАНА В ВАШЕМ process_videos.js ИЛИ ГДЕ-ТО, ГДЕ ВЫ ДЕЛАЕТЕ API-ВЫЗОВЫ
 * @param {string} concatenatedTaskId ID объединенной задачи (строковый, например, 'concatenated_video_xyz').
 * @returns {Promise<object>} Объект с статусом и URL (если готовы).
 */
async function checkConcatenatedVideoStatus(concatenatedTaskId) {
    try {
        console.log(`DEBUG: [checkConcatenatedVideoStatus] Отправка запроса на: ${RENDER_BACKEND_URL}/concatenated-video-status/${concatenatedTaskId}`);
        const response = await fetch(`${RENDER_BACKEND_URL}/concatenated-video-status/${concatenatedTaskId}`);
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`DEBUG: [checkConcatenatedVideoStatus] Ошибка HTTP! Статус: ${response.status}, Данные ошибки:`, errorData);
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.error}`);
        }
        const data = await response.json();
        console.log("DEBUG: [checkConcatenatedVideoStatus] Получены данные статуса объединенного видео:", data);
        return data; // Ожидаем { status: 'completed'/'pending'/'failed', cloudinary_url: '...', shotstackUrl: '...', posterUrl: '...' }
    } catch (error) {
        console.error(`[FRONTEND] Network error checking concatenated video status for ${concatenatedTaskId}:`, error);
        return { status: 'failed', message: 'Network/Server error' };
    }
}

/**
 * Периодически проверяет статусы задач на бэкенде.
 * Обновляет `uploadedVideos` и DOM-элементы.
 */
async function checkTaskStatuses() {
    console.log("DEBUG: checkTaskStatuses called.");

    // ВСЕГДА перезагружаем uploadedVideos из localStorage, чтобы быть уверенными, что работаем с последней версией.
    uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    console.log("DEBUG: uploadedVideos reloaded from localStorage at checkTaskStatuses start:", uploadedVideos);

    // Фильтруем видео, которые все еще находятся в ожидании.
    const videosStillPendingForPolling = uploadedVideos.filter(v =>
        v.id && typeof v.id === 'string' &&
        v.status !== 'completed' && v.status !== 'error' && v.status !== 'failed' &&
        v.status !== 'concatenated_completed' && v.status !== 'concatenated_failed'
    );

    // --- Основная логика перенаправления/остановки опроса (в начале, для немедленной остановки, если ничего не ожидается) ---
    // Если нет видео для опроса И есть какие-либо видео в целом (что означает, что все они находятся в конечном состоянии)
    if (videosStillPendingForPolling.length === 0 && uploadedVideos.length > 0) {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            console.log("[FRONTEND] All tasks completed or errored. Polling stopped.");
        }

        const hasSuccessfullyCompletedVideo = uploadedVideos.some(video =>
            video.status === 'completed' || video.status === 'concatenated_completed'
        );

        console.log("DEBUG: Initial check - All videos in final state. Has successfully completed video?", hasSuccessfullyCompletedVideo);

        if (hasSuccessfullyCompletedVideo) {
            console.log('DEBUG: [FRONTEND] All tasks processed, redirecting to finish.html (initial check)');
            const videoToDisplay = uploadedVideos.find(v => v.status === 'concatenated_completed') ||
                                       uploadedVideos.find(v => v.status === 'completed');
            if (videoToDisplay) {
                localStorage.setItem('displayVideoId', videoToDisplay.id);
            } else {
                localStorage.removeItem('displayVideoId');
            }
            window.location.href = 'finish.html';
            return; // Выходим немедленно после перенаправления
        } else {
            // Нет успешно завершенных видео, отображаем общий статус для ошибок/сбоев
            displayGeneralStatus('Все процессы обработки видео завершены. Ознакомьтесь с результатами ниже.', 'completed');
        }
    } else if (uploadedVideos.length === 0) {
        // Вообще нет видео
        displayGeneralStatus('Видео еще не загружены. Перейдите на страницу загрузки.', 'info');
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
        return;
    } else {
        // Если есть ожидающие видео, удаляем сообщение "Задач не найдено", если оно присутствует.
        const initialMessage = document.getElementById('statusMessage');
        if (initialMessage) {
            initialMessage.remove();
        }
    }

    // --- Обработка статусов отдельных задач (цикл остается похожим) ---
    const currentUploadedVideosCopy = [...uploadedVideos]; // Работаем с копией, чтобы избежать проблем с изменением во время итерации

    for (const video of currentUploadedVideosCopy) {
        const videoId = video.id;

        if (!videoId || typeof videoId !== 'string') {
            console.warn(`[FRONTEND] Skipping polling for invalid videoId: ${videoId}. Video object:`, video);
            continue;
        }

        const currentLocalStatus = video.status;

        // Пропускаем опрос, если видео уже находится в конечном состоянии
        if (currentLocalStatus === 'completed' || currentLocalStatus === 'error' ||
            currentLocalStatus === 'failed' || currentLocalStatus === 'concatenated_completed' ||
            currentLocalStatus === 'concatenated_failed') {
            continue;
        }

        // Существующая логика опроса для объединенных и отдельных видео
        if (currentLocalStatus === 'concatenated_pending') {
            try {
                console.log(`DEBUG: Checking status for concatenated video with ID: ${videoId}`);
                const statusResponse = await checkConcatenatedVideoStatus(videoId); // Функция для проверки статуса объединенного видео

                const index = uploadedVideos.findIndex(v => v.id === videoId); // Находим исходный объект в основном массиве
                if (index !== -1) {
                    if (statusResponse && statusResponse.status === 'completed' && statusResponse.cloudinary_url && statusResponse.shotstackUrl) {
                        console.log(`DEBUG: Concatenated video ${videoId} completed!`);
                        uploadedVideos[index].status = 'concatenated_completed';
                        uploadedVideos[index].cloudinary_url = statusResponse.cloudinary_url;
                        uploadedVideos[index].shotstackUrl = statusResponse.shotstackUrl;
                        uploadedVideos[index].posterUrl = statusResponse.posterUrl || uploadedVideos[index].posterUrl; // Обновляем posterUrl
                        uploadedVideos[index].message = 'Видео объединено и готово!';
                        createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]); // Обновить пузырек

                        // saveVideosToLocalStorage(); // Перенесено в конец цикла
                        displayMessage('Объединенное видео готово!', 'success');
                    } else if (statusResponse && statusResponse.status === 'failed') {
                        console.error(`DEBUG: Concatenated video ${videoId} failed: ${statusResponse.message}`);
                        uploadedVideos[index].status = 'concatenated_failed';
                        uploadedVideos[index].message = statusResponse.message || 'Объединение видео не удалось.';
                        createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]); // Обновить пузырек
                        // saveVideosToLocalStorage(); // Перенесено в конец цикла
                        displayMessage(`Ошибка при объединении видео: ${uploadedVideos[index].message}`, 'error');
                    } else {
                        console.log(`DEBUG: Concatenated video ${videoId} still pending or status not available.`);
                    }
                }
            } catch (error) {
                console.error(`Ошибка при проверке статуса объединенного видео ${videoId}:`, error);
            }
        } else { // Обрабатываем опрос статуса отдельного видео (первоначальная загрузка/обработка)
            const updatedTask = await getTaskStatus(videoId);
            const newRemoteStatus = updatedTask.status;

            console.log(`DEBUG: Polling task ${videoId}. Local status: "${currentLocalStatus}". Remote status: "${newRemoteStatus}".`); // Добавлено

            const index = uploadedVideos.findIndex(v => v.id === videoId);
            if (index !== -1) {
                uploadedVideos[index].status = updatedTask.status;
                uploadedVideos[index].original_filename = updatedTask.originalFilename || uploadedVideos[index].original_filename;
                uploadedVideos[index].cloudinary_url = updatedTask.cloudinary_url || uploadedVideos[index].cloudinary_url;
                uploadedVideos[index].metadata = updatedTask.metadata || uploadedVideos[index].metadata;
                uploadedVideos[index].message = updatedTask.message || uploadedVideos[index].message;
                uploadedVideos[index].shotstackRenderId = updatedTask.shotstackRenderId || uploadedVideos[index].shotstackRenderId;
                uploadedVideos[index].shotstackUrl = updatedTask.shotstackUrl || uploadedVideos[index].shotstackUrl;
                uploadedVideos[index].posterUrl = updatedTask.posterUrl || uploadedVideos[index].posterUrl; // Обновляем posterUrl
                console.log(`DEBUG: Task ${videoId} updated in uploadedVideos. New local object status: "${uploadedVideos[index].status}". Metadata exists: ${!!uploadedVideos[index].metadata && Object.keys(uploadedVideos[index].metadata).length > 0}. Current object ID (should be string): ${uploadedVideos[index].id}`); // Добавлено
            } else {
                const newEntryId = updatedTask.id || updatedTask.taskId;
                if (newEntryId && typeof newEntryId === 'string') {
                    uploadedVideos.push({
                        id: newEntryId,
                        original_filename: updatedTask.originalFilename || `Задача ${newEntryId}`,
                        status: updatedTask.status,
                        timestamp: updatedTask.timestamp,
                        cloudinary_url: updatedTask.cloudinary_url,
                        metadata: updatedTask.metadata,
                        message: updatedTask.message,
                        shotstackRenderId: updatedTask.shotstackRenderId,
                        shotstackUrl: updatedTask.shotstackUrl,
                        posterUrl: updatedTask.posterUrl
                    });
                    console.log(`DEBUG: New task ${newEntryId} added to uploadedVideos. Status: "${updatedTask.status}". Metadata exists: ${!!updatedTask.metadata && Object.keys(updatedTask.metadata).length > 0}. New object ID (should be string): ${newEntryId}`); // Добавлено
                } else {
                    console.warn(`DEBUG: Could not add new task from polling result due to invalid ID:`, updatedTask);
                }
            }
            console.log("DEBUG: Current uploadedVideos array after processing task:", uploadedVideos);

            const videoToRender = uploadedVideos.find(v => v.id === videoId);
            if (videoToRender) {
                console.log(`DEBUG: Calling createOrUpdateBubble for task ${videoId}. Passed data:`, videoToRender);
                createOrUpdateBubble(videoId, videoToRender);
            } else {
                console.warn(`DEBUG: Could not find video ${videoId} in uploadedVideos to render bubble. It might have been filtered out or is invalid.`);
            }
        }
    }

    // --- Окончательная оценка статуса и управление опросом (после всех индивидуальных обновлений) ---
    saveVideosToLocalStorage(); // Сохраняем все изменения после цикла

    // Переоцениваем, есть ли еще ожидающие задачи после всех потенциальных обновлений в этом цикле
    const anyTasksStillPendingAfterCurrentCycle = uploadedVideos.some(v =>
        v.status !== 'completed' && v.status !== 'error' && v.status !== 'failed' &&
        v.status !== 'concatenated_completed' && v.status !== 'concatenated_failed'
    );

    console.log("DEBUG: Final check - anyTasksStillPendingAfterCurrentCycle:", anyTasksStillPendingAfterCurrentCycle);
    console.log("DEBUG: Final check - uploadedVideos content after update:", uploadedVideos);

    if (anyTasksStillPendingAfterCurrentCycle) {
        // Если задачи все еще ожидаются И опрос неактивен, запускаем его.
        if (!pollingIntervalId) {
            pollingIntervalId = setInterval(checkTaskStatuses, CHECK_STATUS_INTERVAL_MS);
            console.log("DEBUG: Started polling interval for task statuses (final check).");
        }
    } else {
        // Если задач нет в ожидании И опрос активен, останавливаем его.
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
            console.log("[FRONTEND] All tasks completed or errored. Polling stopped (final check).");
        }

        // Теперь, когда опрос окончательно остановлен (или уже был остановлен) и нет ожидающих задач,
        // проверяем успешное завершение и перенаправляем.
        const hasSuccessfullyCompletedVideo = uploadedVideos.some(video =>
            video.status === 'completed' || video.status === 'concatenated_completed'
        );

        console.log("DEBUG: Final check - Has successfully completed video (after polling stopped)?", hasSuccessfullyCompletedVideo);

        if (hasSuccessfullyCompletedVideo) {
            console.log('DEBUG: [FRONTEND] All tasks processed, redirecting to finish.html (final check redirect)');
            const videoToDisplay = uploadedVideos.find(v => v.status === 'concatenated_completed') ||
                                       uploadedVideos.find(v => v.status === 'completed');
            if (videoToDisplay) {
                localStorage.setItem('displayVideoId', videoToDisplay.id);
            } else {
                localStorage.removeItem('displayVideoId');
            }
            window.location.href = 'finish.html';
            return; // Выходим немедленно после перенаправления
        } else {
            displayGeneralStatus('Все процессы обработки видео завершены. Ознакомьтесь с результатами ниже.', 'completed');
        }
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
        if (initialMessage && initialMessage.textContent.includes('Задач не найдено')) { // Corrected message check
            initialMessage.remove();
        }
    } else {
        // Пузырек существует, находим его дочерний элемент 'video-bubble'
        bubble = videoGridItem.querySelector('.video-bubble');
    }

    let filenameText = `<h3 class="bubble-title-overlay">${sanitizeHTML(data.original_filename || `Задача ${videoId}`)}</h3>`; // Sanitized
    let statusMessageText = '';
    let actionButtonsHtml = '';
    let thumbnailUrl; // Определяем здесь

    // LOGIC TO DETERMINE THUMBNAIL URL
    if (String(videoId).startsWith('concatenated_video_') && data.posterUrl) {
        // Если это объединенное видео И у нас есть posterUrl, используем его
        thumbnailUrl = data.posterUrl;
        console.log(`DEBUG: Using Shotstack poster URL for concatenated video ${videoId}: ${thumbnailUrl}`);
    } else if (data.cloudinary_url) {
        // В противном случае, если есть Cloudinary URL, используем его для миниатюры
        thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
        console.log(`DEBUG: Using Cloudinary thumbnail URL for original video ${videoId}: ${thumbnailUrl}`);
    } else {
        // Возвращаемся к плейсхолдеру, если нет специфичного URL
        thumbnailUrl = 'assets/video_placeholder.png';
        console.log(`DEBUG: Using placeholder for video ${videoId} (no specific URL available).`);
    }

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
                actionButtonsHtml += `<a href="${sanitizeHTML(data.shotstackUrl)}" target="_blank" class="action-button view-generated-button">Посмотреть сгенерированное видео</a>`; // Sanitized URL
            } else {
                statusMessageText = '<p class="status-message-bubble status-error">Объединение завершено, но URL отсутствует.</p>';
            }
            bubble.classList.remove('loading');
            break;
        case 'error':
        case 'failed':
        case 'concatenated_failed':
            statusMessageText = `<p class="status-message-bubble status-error">Ошибка: ${sanitizeHTML(data.message || 'Неизвестная ошибка.')}</p>`; // Sanitized message
            bubble.classList.remove('loading');
            break;
        default:
            statusMessageText = '<p class="status-message-bubble status-info">Получение статуса...</p>';
            bubble.classList.add('loading');
            break;
    }

    // Добавляем изображение миниатюры
    bubble.innerHTML = `
        <img src="${sanitizeHTML(thumbnailUrl)}" alt="Видео превью" class="video-thumbnail">
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
    // Добавляем чекбокс для выбора видео
    // Сначала удалим существующий, если он есть, чтобы избежать дублирования
    let existingCheckboxContainer = bubble.querySelector('.bubble-checkbox-container');
    if (existingCheckboxContainer) {
        existingCheckboxContainer.remove();
    }

    const checkboxContainer = document.createElement('label');
    checkboxContainer.className = 'bubble-checkbox-container';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'bubble-checkbox';
    checkbox.value = videoId; // Значение чекбокса - taskId
    // Устанавливаем состояние чекбокса в соответствии с selectedVideosForConcatenation
    checkbox.checked = selectedVideosForConcatenation.includes(videoId);
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(document.createTextNode(' Выбрать'));
    bubble.appendChild(checkboxContainer); // Добавляем чекбокс в пузырек

    // Обработчик события для чекбокса
    checkbox.addEventListener('change', (event) => {
        if (event.target.checked) {
            if (!selectedVideosForConcatenation.includes(videoId)) {
                selectedVideosForConcatenation.push(videoId);
            }
        } else {
            selectedVideosForConcatenation = selectedVideosForConcatenation.filter(id => id !== videoId);
        }
        updateConcatenationUI();
    });

}


/**
 * Загружает данные uploadedVideos из localStorage.
 * Инициализирует uploadedVideos, если данные не найдены.
 */
function loadVideosFromLocalStorage() {
    try {
        const storedVideos = localStorage.getItem('uploadedVideos');
        uploadedVideos = storedVideos ? JSON.parse(storedVideos) : [];
        console.debug('DEBUG: Videos loaded from localStorage: %o', uploadedVideos);
    } catch (e) {
        console.error('ERROR: Could not parse uploadedVideos from localStorage, resetting.', e);
        uploadedVideos = [];
        localStorage.removeItem('uploadedVideos'); // Очищаем некорректные данные
    }
}

/**
 * Сохраняет текущее состояние uploadedVideos в localStorage.
 */
function saveVideosToLocalStorage() {
    try {
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        console.debug('DEBUG: Videos saved to localStorage: %o', uploadedVideos);
    } catch (e) {
        console.error('ERROR: Could not save uploadedVideos to localStorage.', e);
    }
}

/**
 * Отображает общее сообщение о статусе на странице.
 * @param {string} message Сообщение для отображения.
 * @param {'info'|'success'|'error'|'pending'|'completed'} type Тип сообщения для стилизации.
 */
function displayMessage(message, type) {
    if (DOM_ELEMENTS.concatenationStatusDiv) {
        DOM_ELEMENTS.concatenationStatusDiv.textContent = message;
        DOM_ELEMENTS.concatenationStatusDiv.className = `concatenation-status ${type}`;
    }
}


/**
 * Обновляет состояние кнопки "Обработать выбранные видео" и статус сообщений.
 * Теперь состояние чекбокса "Объединить видео" учитывается.
 */
function updateConcatenationUI() {
    // ВСЕГДА перечитываем uploadedVideos из localStorage, чтобы быть уверенными, что работаем с последней версией
    uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

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

/**
 * Обрабатывает запрос на обработку выбранных видео (индивидуально или объединение).
 */
async function handleProcessSelectedVideos() {
    console.debug('DEBUG: --- Process Selected Videos Button Click Handler STARTED ---');
    if (DOM_ELEMENTS.processSelectedVideosButton) { // Использовать DOM_ELEMENTS
        DOM_ELEMENTS.processSelectedVideosButton.disabled = true; // Отключить кнопку, чтобы избежать повторных кликов
        DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Обработка...';
    }

    // Перезагрузить uploadedVideos из localStorage, чтобы убедиться, что данные актуальны
    loadVideosFromLocalStorage();
    console.debug('DEBUG: uploadedVideos reloaded from localStorage at handler start: %o', uploadedVideos);

    const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false; // Использовать DOM_ELEMENTS
    console.debug("DEBUG: Is 'Connect videos' checkbox checked (actual checkbox state)?: %s", shouldConnect);

    // Фильтруем только completed видео, которые будут обработаны
    const videosToProcess = uploadedVideos.filter(video => video.status === 'completed');
    console.debug('DEBUG: Videos to process (filtered by \'completed\' status for ALL): %o', videosToProcess);

    if (videosToProcess.length === 0) {
        displayMessage('Нет завершенных видео для обработки.', 'info');
        if (DOM_ELEMENTS.processSelectedVideosButton) { // Использовать DOM_ELEMENTS
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Обработать/Объединить видео';
        }
        console.debug('DEBUG: --- Process Selected Videos Button Click Handler FINISHED (No videos to process) ---');
        return;
    }

    const taskIdsToProcess = videosToProcess.map(video => video.id);
    console.debug('DEBUG: Task IDs to process (for ALL completed): %o', taskIdsToProcess);

    // DOM_ELEMENTS.identifierTypeSelect and DOM_ELEMENTS.identifierInput are not defined in DOM_ELEMENTS.
    // Assuming these are passed or retrieved from elsewhere, for now, they are undefined.
    // If they exist in your HTML, you'll need to add them to the DOM_ELEMENTS object.
    const identifierType = localStorage.getItem('hifeIdentifierType') || 'instagram_username'; // Fallback to localStorage or default
    const identifierValue = localStorage.getItem('hifeUsername') || localStorage.getItem('hifeEmail') || localStorage.getItem('hifeLinkedin') || '';

    const email = identifierType === 'email' ? identifierValue : null;
    const instagram_username = identifierType === 'instagram_username' ? identifierValue : null;
    const linkedin_profile = identifierType === 'linkedin_profile' ? identifierValue : null;

    try {
        // DOM_ELEMENTS.processingMessage is not defined in DOM_ELEMENTS.
        // If it exists in your HTML, you'll need to add it to the DOM_ELEMENTS object.
        // For now, removing this line to prevent error.
        // if (DOM_ELEMENTS.processingMessage) DOM_ELEMENTS.processingMessage.textContent = 'Отправка видео на обработку...';
        displayMessage('Отправка видео на обработку. Пожалуйста, подождите...', 'info');
        console.debug('DEBUG: Calling processVideosFromSelection...');

        // Предполагаем, что processVideosFromSelection определена в process_videos.js и доступна глобально
            const response = await processVideosFromSelection(
            taskIdsToProcess, // Передаем task_ids первым
            shouldConnect,    // Передаем connect_videos вторым
            instagram_username, // Имя пользователя Instagram
            email,            // Email
            linkedin_profile, // Профиль LinkedIn
            displayGeneralStatus, // Передаем displayGeneralStatus (или displayProcessStatus, если она у вас есть и отличается)
            displayGeneralStatus, // Снова displayGeneralStatus, если process_videos.js ожидает две функции обратного вызова
            RENDER_BACKEND_URL // Передаем URL бэкенда
        );


        console.debug('DEBUG: processVideosFromSelection returned: %o', response);

        if (response.error) {
            displayMessage(response.error, 'error');
            return;
        }

        // Если это объединение, бэкенд должен вернуть новый taskId для объединенного видео
        if (shouldConnect && response.concatenated_task_id) {
            const newConcatenatedVideo = {
                id: response.concatenated_task_id, // Используем ID объединенного видео от бэкенда
                original_filename: 'Объединенное Видео', // Просто название для отображения
                status: 'concatenated_pending', // Новый статус для отслеживания объединенного видео
                timestamp: new Date().toISOString(),
                cloudinary_url: null, // Изначально пусто
                shotstackRenderId: response.shotstackRenderId || null, // ID рендера Shotstack
                shotstackUrl: null // URL Shotstack после завершения
            };
            uploadedVideos.push(newConcatenatedVideo); // Добавляем в общий список
            saveVideosToLocalStorage(); // Сохраняем обновленный список
            createOrUpdateBubble(newConcatenatedVideo.id, newConcatenatedVideo); // Создаем или обновляем пузырек для объединенного видео
            displayMessage('Объединение видео инициировано. Отслеживание статуса...', 'info');
            console.debug('DEBUG: New concatenated video added for tracking: %o', newConcatenatedVideo);
        } else if (response.initiated_tasks && response.initiated_tasks.length > 0) {
            // Если была запрошена индивидуальная обработка (существующая логика)
            response.initiated_tasks.forEach(initiatedTask => {
                const videoIndex = uploadedVideos.findIndex(v => v.id === initiatedTask.taskId);
                if (videoIndex !== -1) {
                    uploadedVideos[videoIndex].status = 'shotstack_pending';
                    uploadedVideos[videoIndex].shotstackRenderId = initiatedTask.shotstackRenderId;
                    uploadedVideos[videoIndex].message = initiatedTask.message;
                    createOrUpdateBubble(uploadedVideos[videoIndex].id, uploadedVideos[videoIndex]); // Обновить пузырек
                }
            });
            saveVideosToLocalStorage(); // Сохраняем все изменения после цикла forEach
            displayMessage('Индивидуальная обработка видео инициирована. Отслеживание статуса...', 'info');
        } else {
            displayMessage('Не удалось инициировать обработку видео. Пожалуйста, попробуйте еще раз.', 'error');
        }

        // Запускаем опрос статусов после инициирования обработки
        // Это важно для запуска опроса, если он еще не был активен.
        if (!pollingIntervalId) {
            pollingIntervalId = setInterval(checkTaskStatuses, CHECK_STATUS_INTERVAL_MS);
            console.log("DEBUG: Started polling interval after initiating tasks.");
        }
    } catch (error) {
        console.error('ERROR: Failed to process selected videos:', error);
        displayMessage(`Ошибка при обработке видео: ${error.message}`, 'error');
    } finally {
        // Убедитесь, что кнопка снова активна после попытки обработки (даже если есть ошибка)
        if (DOM_ELEMENTS.processSelectedVideosButton) {
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Обработать/Объединить видео';
        }
        console.debug('DEBUG: --- Process Selected Videos Button Click Handler FINISHED ---');
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
        // taskBubbles = {}; // Очищаем кэш DOM-элементов - ЭТО МОЖЕТ БЫТЬ ПРОБЛЕМОЙ, если не все пузырьки пересоздаются
        uploadedVideos = []; // Очищаем глобальный массив uploadedVideos
        localStorage.removeItem('uploadedVideos'); // Очищаем localStorage
        selectedVideosForConcatenation = []; // Очищаем выбор при новой загрузке

        if (data.length > 0) {
            // DEBUG: Логируем, если видео найдено
            console.log("DEBUG: [fetchUserVideos] Найдено видео, очищаем и добавляем в uploadedVideos.");
            data.forEach(video => {
                // DEBUG: Логируем каждое обрабатываемое видео
                console.log("DEBUG: [fetchUserVideos] Обработка видео:", video);
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
            console.log("DEBUG: [fetchUserVideos] uploadedVideos после добавления:", uploadedVideos);
            displayGeneralStatus(`Найдено ${data.length} видео для этого пользователя.`, 'success');
        } else {
            // DEBUG: Логируем, если видео не найдено
            console.log("DEBUG: [fetchUserVideos] Видео для пользователя не найдено (data.length === 0).");
            displayGeneralStatus('Задач не найдено для этого пользователя.', 'info');
            if (DOM_ELEMENTS.bubblesContainer) {
                DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
            }
        }
        updateConcatenationUI(); // Обновляем UI объединения, чтобы оно отражало новое количество видео

    } catch (error) {
        // DEBUG: Логируем общую ошибку при получении видео
        console.error('DEBUG: [fetchUserVideos] Ошибка при получении видео:', error);
        displayGeneralStatus(`Ошибка при загрузке видео: ${sanitizeHTML(error.message)}. Пожалуйста, попробуйте позже.`, 'error'); // Sanitized message
        uploadedVideos = []; // Очищаем при ошибке
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message error">Не удалось загрузить видео. Пожалуйста, проверьте подключение и попробуйте снова.</p>';
        }
        updateConcatenationUI();
    }
}


/**
 * Настраивает все обработчики событий для DOM-элементов.
 */
function setupEventListeners() {
    console.debug("DEBUG: setupEventListeners STARTED.");

    if (DOM_ELEMENTS.uploadNewBtn) {
        DOM_ELEMENTS.uploadNewBtn.addEventListener('click', () => {
            console.debug("DEBUG: 'Upload New Video' button clicked. Triggering hidden file input.");
            if (DOM_ELEMENTS.videoFileInput) {
                DOM_ELEMENTS.videoFileInput.click();
            }
        });
    }

    if (DOM_ELEMENTS.videoFileInput) {
        DOM_ELEMENTS.videoFileInput.addEventListener('change', async (event) => {
            console.debug("DEBUG: Video file input changed. Files selected: %o", event.target.files);
            const file = event.target.files[0];
            if (file) {
                console.debug(`DEBUG: Selected file: ${file.name}, type: ${file.type}, size: ${file.size} bytes.`);
                if (!file.type.startsWith('video/')) {
                    displayGeneralStatus('Пожалуйста, выберите файл видео.', 'error');
                    console.warn('WARN: Non-video file selected.');
                    return;
                }
                await uploadVideoFromResults(file);
            } else {
                console.debug('DEBUG: No file selected.');
            }
            // Очищаем значение инпута, чтобы можно было загрузить тот же файл снова
            event.target.value = '';
        });
    }

    if (DOM_ELEMENTS.finishSessionBtn) {
        DOM_ELEMENTS.finishSessionBtn.addEventListener('click', () => {
            console.log("DEBUG: Finish Session button clicked. Clearing localStorage and redirecting.");
            localStorage.clear();
            sessionStorage.clear(); // Также очищаем sessionStorage
            window.location.replace('index.html'); // Используем replace для предотвращения возврата
        });
    }

    if (DOM_ELEMENTS.closeButton) {
        DOM_ELEMENTS.closeButton.addEventListener('click', () => {
            console.debug("DEBUG: Close button clicked. Hiding metadata modal.");
            if (DOM_ELEMENTS.metadataModal) {
                DOM_ELEMENTS.metadataModal.style.display = 'none';
            }
        });
    }

    // Обработчик кнопки "Обработать/Объединить выбранные видео"
    if (DOM_ELEMENTS.processSelectedVideosButton) {
        DOM_ELEMENTS.processSelectedVideosButton.addEventListener('click', handleProcessSelectedVideos);
        console.debug('DEBUG: Process Selected Videos Button event listener attached.');
    }

    // Обработчик для чекбокса "Объединить видео"
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        DOM_ELEMENTS.connectVideosCheckbox.addEventListener('change', updateConcatenationUI);
        console.debug('DEBUG: Connect Videos Checkbox event listener attached.');
    }

    // Обработчики для закрытия модального окна по клику вне его
    if (DOM_ELEMENTS.metadataModal) {
        DOM_ELEMENTS.metadataModal.addEventListener('click', (event) => {
            if (event.target === DOM_ELEMENTS.metadataModal) {
                console.debug("DEBUG: Clicked outside metadata modal. Hiding modal.");
                DOM_ELEMENTS.metadataModal.style.display = 'none';
            }
        });
    }

    console.debug("DEBUG: setupEventListeners FINISHED.");
}


// --- Инициализация при загрузке страницы ---

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DEBUG: DOMContentLoaded event fired. Initializing application.");
    loadVideosFromLocalStorage(); // Загружаем видео при старте
    setupEventListeners(); // Настраиваем все обработчики событий

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

    // Начальное обновление UI объединения при загрузке страницы
    updateConcatenationUI();
    // checkTaskStatuses() is already called after fetchUserVideos or if no user data.
});
