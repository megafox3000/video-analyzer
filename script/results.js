// В начале вашего скрипта/results.js
console.log("DEBUG: results.js loaded and executing.");

// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// --- Константы и глобальные переменные ---

const DOM_ELEMENTS = {
    resultsHeader: document.getElementById('resultsHeader'),
    usernameDisplay: document.getElementById('usernameDisplay'),
    uploadNewBtn: document.getElementById('uploadNewBtn'),
    bubblesContainer: document.getElementById('bubblesContainer'),
    metadataModal: document.getElementById('metadataModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMetadata: document.getElementById('modalMetadata'),
    closeButton: document.querySelector('.close-button'),
    videoFileInput: document.getElementById('videoFileInput'),
    dynamicUploadStatusContainer: document.getElementById('dynamicUploadStatusContainer'),
    uploadStatusText: document.getElementById('uploadStatusText'),
    progressBarContainer: null, // Инициализируется ниже
    progressBar: null, // Инициализируется ниже
    progressText: null // Инициализируется ниже
};

// Инициализация элементов прогресс-бара, так как они могут быть внутри dynamicUploadStatusContainer
if (DOM_ELEMENTS.dynamicUploadStatusContainer) {
    DOM_ELEMENTS.progressBarContainer = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-bar-container');
    DOM_ELEMENTS.progressBar = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-bar');
    DOM_ELEMENTS.progressText = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-text');
}

const taskBubbles = {}; // Объект для хранения ссылок на DOM-элементы "пузырей" по их taskId
const CHECK_STATUS_INTERVAL_MS = 3000; // Интервал опроса статусов (3 секунды)

// --- Вспомогательные функции ---

/**
 * Генерирует URL миниатюры Cloudinary из URL видео.
 * @param {string} videoUrl Оригинальный URL видео на Cloudinary.
 * @returns {string} URL миниатюры или путь к дефолтной заглушке.
 */
function getCloudinaryThumbnailUrl(videoUrl) {
    if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
        return 'assets/default_video_thumbnail.png';
    }

    const parts = videoUrl.split('/upload/');
    if (parts.length < 2) {
        return 'assets/default_video_thumbnail.png';
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
    if (DOM_ELEMENTS.modalTitle) DOM_ELEMENTS.modalTitle.textContent = `Metadata for: ${filename}`;
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

// --- Функции для загрузки и опроса статусов ---

/**
 * Загружает выбранный файл видео на бэкенд со страницы результатов.
 * @param {File} file Файл для загрузки.
 */
async function uploadVideoFromResults(file) {
    const currentUsername = localStorage.getItem('hifeUsername');
    const currentEmail = localStorage.getItem('hifeEmail');
    const currentLinkedin = localStorage.getItem('hifeLinkedin'); // Убедитесь, что вы сохраняете LinkedIn

    if (!currentUsername && !currentEmail && !currentLinkedin) {
        alert('No user data found. Redirecting to the home page to start over.');
        window.location.replace('index.html');
        return;
    }

    const formData = new FormData();
    formData.append('video', file);
    if (currentUsername) formData.append('instagram_username', currentUsername);
    if (currentEmail) formData.append('email', currentEmail);
    if (currentLinkedin) formData.append('linkedin_profile', currentLinkedin);

    if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
    updateUploadStatusDisplay('Starting upload...', 'info');
    if (DOM_ELEMENTS.progressBarContainer) DOM_ELEMENTS.progressBarContainer.style.display = 'flex';
    resetProgressBar(); // Убедимся, что прогресс-бар сброшен
    if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = true;

    try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                if (DOM_ELEMENTS.progressBar) DOM_ELEMENTS.progressBar.style.width = `${percent.toFixed(0)}%`;
                if (DOM_ELEMENTS.progressText) DOM_ELEMENTS.progressText.textContent = `${percent.toFixed(0)}%`;
                updateUploadStatusDisplay(`Uploading: ${percent.toFixed(0)}%`, 'info');
            }
        });

        xhr.onload = function() {
            if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;

            if (xhr.status >= 200 && xhr.status < 300) {
                const response = JSON.parse(xhr.responseText);
                const taskId = response.taskId;

                updateUploadStatusDisplay(`Video uploaded. Task ID: ${taskId}. Waiting for processing.`, 'pending');
                resetProgressBar();

                let uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                const newVideoEntry = {
                    id: taskId,
                    original_filename: response.originalFilename || file.name,
                    status: 'uploaded', // Исходный статус после загрузки
                    timestamp: new Date().toISOString(),
                    cloudinary_url: response.cloudinary_url || null, // Добавляем Cloudinary URL
                    metadata: response.metadata || {}
                };
                uploadedVideosData.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideosData));

                createOrUpdateBubble(taskId, newVideoEntry);
                checkTaskStatuses([newVideoEntry]); // Начинаем опрашивать только что загруженное видео

                setTimeout(() => {
                    if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.add('hidden');
                    updateUploadStatusDisplay('Ready for new upload.', 'info');
                }, 5000);

            } else {
                const error = JSON.parse(xhr.responseText);
                updateUploadStatusDisplay(`Upload error: ${error.error || 'Unknown error'}`, 'error');
                resetProgressBar();
            }
        };

        xhr.onerror = function() {
            if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;
            updateUploadStatusDisplay('Network error during upload.', 'error');
            resetProgressBar();
        };

        xhr.send(formData);

    } catch (error) {
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;
        console.error('Error sending upload request:', error);
        updateUploadStatusDisplay(`An error occurred: ${error.message}`, 'error');
        resetProgressBar();
    }
}

/**
 * Периодически проверяет статусы задач на бэкенде.
 * @param {Array<Object>} videosToPoll Массив объектов видео, статусы которых нужно опросить.
 */
async function checkTaskStatuses(videosToPoll) {
    let tasksStillPending = false; // Флаг, указывающий, остались ли задачи в обработке
    const updatedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let currentStatusMessageElement = document.getElementById('statusMessage');

    if (!currentStatusMessageElement && DOM_ELEMENTS.bubblesContainer) {
        currentStatusMessageElement = document.createElement('p');
        currentStatusMessageElement.id = 'statusMessage';
        DOM_ELEMENTS.bubblesContainer.prepend(currentStatusMessageElement);
    }

    if (videosToPoll.length === 0) {
        if (currentStatusMessageElement) {
            currentStatusMessageElement.textContent = 'All tasks completed or processed.';
            currentStatusMessageElement.className = 'status-message info';
        }
        return;
    }

    for (const video of videosToPoll) {
        const taskId = video.id;
        let currentVideoInLocalStorage = updatedVideosData.find(v => v.id === taskId);

        // Если задача уже завершена или произошла ошибка, пропускаем её опрос
        if (currentVideoInLocalStorage && (currentVideoInLocalStorage.status === 'completed' || currentVideoInLocalStorage.status === 'error' || currentVideoInLocalStorage.status === 'failed')) {
            createOrUpdateBubble(taskId, currentVideoInLocalStorage);
            continue;
        }

        try {
            const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
            const data = await response.json();

            if (response.ok) {
                if (currentVideoInLocalStorage) {
                    currentVideoInLocalStorage.status = data.status;
                    currentVideoInLocalStorage.message = data.message || '';
                    currentVideoInLocalStorage.metadata = data.metadata || {};
                    currentVideoInLocalStorage.cloudinary_url = data.cloudinary_url || null;
                    currentVideoInLocalStorage.shotstackRenderId = data.shotstackRenderId || null;
                    currentVideoInLocalStorage.shotstackUrl = data.shotstackUrl || null;
                } else { // Если по какой-то причине нет в localStorage, но бэкенд знает о задаче
                    currentVideoInLocalStorage = {
                        id: taskId,
                        original_filename: data.original_filename || `Task ${taskId}`,
                        status: data.status,
                        message: data.message || '',
                        metadata: data.metadata || {},
                        cloudinary_url: data.cloudinary_url || null,
                        shotstackRenderId: data.shotstackRenderId || null,
                        shotstackUrl: data.shotstackUrl || null,
                        timestamp: new Date().toISOString()
                    };
                    updatedVideosData.push(currentVideoInLocalStorage);
                }
                createOrUpdateBubble(taskId, currentVideoInLocalStorage);

                if (currentVideoInLocalStorage.status !== 'completed' && currentVideoInLocalStorage.status !== 'error' && currentVideoInLocalStorage.status !== 'failed') {
                    tasksStillPending = true;
                }

            } else {
                console.error(`[FRONTEND] Error getting status for task ${taskId}:`, data.message || response.statusText);
                if (currentVideoInLocalStorage) {
                    currentVideoInLocalStorage.status = 'error';
                    currentVideoInLocalStorage.message = data.message || 'Failed to fetch status.';
                } else {
                    currentVideoInLocalStorage = {
                        id: taskId,
                        original_filename: `Task ${taskId}`,
                        status: 'error',
                        message: data.message || 'Failed to fetch status.',
                        timestamp: new Date().toISOString()
                    };
                    updatedVideosData.push(currentVideoInLocalStorage);
                }
                createOrUpdateBubble(taskId, currentVideoInLocalStorage);
            }
        } catch (error) {
            console.error(`[FRONTEND] Network error checking status for task ${taskId}:`, error);
            if (currentVideoInLocalStorage) {
                currentVideoInLocalStorage.status = 'error';
                currentVideoInLocalStorage.message = 'Network error or backend unreachable.';
            } else {
                currentVideoInLocalStorage = {
                    id: taskId,
                    original_filename: `Task ${taskId}`,
                    status: 'error',
                    message: 'Network error or backend unreachable.',
                    timestamp: new Date().toISOString()
                };
                updatedVideosData.push(currentVideoInLocalStorage);
            }
            createOrUpdateBubble(taskId, currentVideoInLocalStorage);
        }
    }

    // Сохраняем обновленные данные в localStorage
    localStorage.setItem('uploadedVideos', JSON.stringify(updatedVideosData));

    // Обновляем общее сообщение о статусе
    if (currentStatusMessageElement) {
        if (tasksStillPending) {
            currentStatusMessageElement.textContent = 'Checking status of your videos...';
            currentStatusMessageElement.className = 'status-message pending';
        } else {
            currentStatusMessageElement.textContent = 'All tasks completed or processed.';
            currentStatusMessageElement.className = 'status-message info';
        }
    }

    // Продолжаем опрос, если есть незавершенные задачи
    if (tasksStillPending) {
        setTimeout(() => checkTaskStatuses(updatedVideosData.filter(v => v.status !== 'completed' && v.status !== 'error' && v.status !== 'failed')), CHECK_STATUS_INTERVAL_MS);
    } else {
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
        bubble.className = 'video-bubble loading'; // Начальное состояние
        bubble.id = `bubble-${taskId}`;
        if (DOM_ELEMENTS.bubblesContainer) DOM_ELEMENTS.bubblesContainer.appendChild(bubble);
        taskBubbles[taskId] = bubble;

        // Удаляем стартовое сообщение "No tasks found", если оно есть
        const initialMessage = document.getElementById('statusMessage');
        if (initialMessage && initialMessage.textContent.includes('No tasks found')) {
            initialMessage.remove();
        }
    }

    let filenameText = `<h3 class="bubble-title-overlay">${data.original_filename || `Task ${taskId}`}</h3>`;
    let previewHtml = '';
    let statusMessageText = '';
    let actionButtonsHtml = '';

    // Определяем содержимое пузыря в зависимости от статуса
    switch (data.status) {
        case 'completed':
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewHtml = `<img class="bubble-preview-img" src="${thumbnailUrl}" alt="Video Preview">`;
            statusMessageText = '<p class="status-message-bubble status-completed">Click to view metadata</p>';
            bubble.classList.remove('loading');
            actionButtonsHtml += `<button class="action-button generate-button" data-task-id="${taskId}">Generate with Shotstack</button>`;
            if (data.shotstackUrl) {
                actionButtonsHtml += `<a href="${data.shotstackUrl}" target="_blank" class="action-button view-generated-button">View Generated Video</a>`;
            }
            break;
        case 'shotstack_pending':
        case 'processing': // Предполагаем, что 'processing' также относится к длительной обработке
        case 'uploaded': // Сразу после загрузки, до получения первого статуса обработки
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Video Processing">`;
            statusMessageText = `<p class="status-message-bubble status-pending">Video in processing (Shotstack)...</p>`;
            bubble.classList.add('loading');
            break;
        case 'error':
        case 'failed':
            previewHtml = `<img class="bubble-preview-img" src="assets/error_placeholder.png" alt="Processing Error">`;
            statusMessageText = `<p class="status-message-bubble status-error">Error: ${data.message || 'Unknown error.'}</p>`;
            bubble.classList.remove('loading');
            // Если есть ошибка, может быть кнопка "Retry" или "View Logs"
            // actionButtonsHtml += `<button class="action-button retry-button" data-task-id="${taskId}">Retry</button>`;
            break;
        default: // Для неизвестных или промежуточных статусов
            previewHtml = `<img class="bubble-preview-img" src="assets/placeholder.png" alt="Status Unknown">`;
            statusMessageText = '<p class="status-message-bubble status-info">Getting status...</p>';
            bubble.classList.add('loading');
            break;
    }

    bubble.innerHTML = `
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
        bubble.onclick = () => showMetadataModal(data.original_filename || `Task ${taskId}`, data.metadata);
        bubble.style.cursor = 'pointer';
    } else {
        bubble.onclick = null; // Удаляем обработчик, если условия не выполнены
        bubble.style.cursor = 'default';
    }

    // Обработчик для кнопки "Generate with Shotstack"
    const generateButton = bubble.querySelector('.generate-button');
    if (generateButton) {
        generateButton.addEventListener('click', async (event) => {
            event.stopPropagation(); // Предотвращаем срабатывание onclick на пузыре
            generateButton.disabled = true;
            generateButton.textContent = 'Generating...';
            generateButton.style.backgroundColor = 'var(--status-pending-color)';

            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/generate-shotstack-video`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: taskId })
                });

                const result = await response.json();
                if (response.ok) {
                    alert(`Shotstack generation initiated for ${data.original_filename || `Task ${taskId}`}. Render ID: ${result.shotstackRenderId}`);
                    let updatedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    let taskToUpdate = updatedVideosData.find(v => v.id === taskId);
                    if (taskToUpdate) {
                        taskToUpdate.status = 'shotstack_pending';
                        taskToUpdate.shotstackRenderId = result.shotstackRenderId;
                        localStorage.setItem('uploadedVideos', JSON.stringify(updatedVideosData));
                        createOrUpdateBubble(taskId, taskToUpdate); // Перерисовываем bubble
                        checkTaskStatuses([taskToUpdate]); // Начинаем опрашивать только эту задачу
                    }
                } else {
                    alert(`Error initiating Shotstack generation: ${result.error || 'Unknown error'}`);
                    generateButton.disabled = false;
                    generateButton.textContent = 'Generate with Shotstack';
                    generateButton.style.backgroundColor = '';
                }
            } catch (error) {
                console.error('Network error during Shotstack initiation:', error);
                alert('Network error during Shotstack initiation.');
                generateButton.disabled = false;
                generateButton.textContent = 'Generate with Shotstack';
                generateButton.style.backgroundColor = '';
            }
        });
    }
}

// --- Инициализация при загрузке DOM ---
document.addEventListener('DOMContentLoaded', () => {
    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');
    const linkedin = localStorage.getItem('hifeLinkedin'); // Получаем LinkedIn

    let headerText = 'Your Video(s)';
    if (username) {
        headerText = `Your Video(s) for @${username}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `For: @${username}`;
    } else if (email) {
        headerText = `Your Video(s) for ${email}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `For: ${email}`;
    } else if (linkedin) { // Добавляем обработку LinkedIn
        headerText = `Your Video(s) for ${linkedin}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `For: ${linkedin}`;
    } else {
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = 'For: Guest';
    }
    if (DOM_ELEMENTS.resultsHeader) DOM_ELEMENTS.resultsHeader.textContent = headerText;

    // Управление кнопкой "Upload New Video(s)"
    if (username || email || linkedin) {
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.textContent = 'Upload New Video(s)';
        updateUploadStatusDisplay('Ready for new upload.', 'info');
        if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
        resetProgressBar(); // Убедимся, что прогресс-бар скрыт
    } else {
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = true;
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.textContent = 'Upload (Login first)';
        updateUploadStatusDisplay('Cannot re-upload: no user data found. Please upload videos from the upload page.', 'error');
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
                DOM_ELEMENTS.videoFileInput.value = ''; // Очищаем input для повторного выбора того же файла
            } else {
                updateUploadStatusDisplay('File selection canceled.', 'info');
                resetProgressBar();
            }
        });
    }

    // Загружаем и отображаем уже загруженные видео при загрузке страницы
    const storedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

    if (storedVideosData.length === 0) {
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No tasks found. Please upload a video from the <a href="index.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
        }
    } else {
        if (DOM_ELEMENTS.bubblesContainer) DOM_ELEMENTS.bubblesContainer.innerHTML = ''; // Очищаем контейнер перед добавлением пузырей
        storedVideosData.forEach(video => {
            createOrUpdateBubble(video.id, video);
        });
        // Проверяем статусы для всех, кто не 'completed', 'error', 'failed'
        checkTaskStatuses(storedVideosData.filter(v => v.status !== 'completed' && v.status !== 'error' && v.status !== 'failed'));
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

    // Обработчик кнопки "Finish Session"
    const finishSessionBtn = document.getElementById('finishSessionBtn');
    if (finishSessionBtn) {
        // Показываем кнопку, только если есть загруженные видео
        if (JSON.parse(localStorage.getItem('uploadedVideos') || '[]').length > 0) {
            finishSessionBtn.style.display = 'inline-block';
        } else {
            finishSessionBtn.style.display = 'none';
        }

        finishSessionBtn.addEventListener('click', () => {
            localStorage.removeItem('hifeUsername');
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('hifeLinkedin'); // Удаляем LinkedIn
            localStorage.removeItem('uploadedVideos');
            console.log("Session finished. LocalStorage cleared.");
            window.location.replace('index.html'); // Перенаправляем на главную страницу
        });
    }
});
