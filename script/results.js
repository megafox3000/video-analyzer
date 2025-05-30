const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render

const resultsHeader = document.getElementById('resultsHeader');
const usernameDisplay = document.getElementById('usernameDisplay');
const uploadNewBtn = document.getElementById('uploadNewBtn'); // Кнопка "Upload New Video(s)"
const bubblesContainer = document.getElementById('bubblesContainer');
const metadataModal = document.getElementById('metadataModal');
const modalTitle = document.getElementById('modalTitle');
const modalMetadata = document.getElementById('modalMetadata');
const closeButton = document.querySelector('.close-button');

// --- НОВЫЕ ЭЛЕМЕНТЫ ДЛЯ ДОЗАГРУЗКИ ---
// Убедись, что эти элементы существуют в твоем results.html
const videoFileInput = document.getElementById('videoFileInput'); // Скрытое поле ввода файла
const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
const uploadStatusText = document.getElementById('uploadStatusText');
// Проверяем, что элементы существуют, прежде чем пытаться получить их дочерние элементы
const progressBarContainer = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar-container') : null;
const progressBar = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar') : null;
const progressText = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-text') : null;

let selectedFile = null; // Переменная для хранения выбранного файла

// ПЕРЕМЕСТИЛИ СЮДА: Объявляем taskBubbles в глобальной области видимости
const taskBubbles = {};

// Вспомогательная функция для создания URL превью из URL видео Cloudinary
function getCloudinaryThumbnailUrl(videoUrl) {
    if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
        return 'assets/default_video_thumbnail.png'; // Заглушка, если это не Cloudinary URL
    }

    const parts = videoUrl.split('/upload/');
    if (parts.length < 2) {
        return 'assets/default_video_thumbnail.png';
    }

    const baseUrl = parts[0];
    const transformations = 'c_fill,w_200,h_150,g_auto,q_auto,f_jpg,so_auto/';

    let publicIdPath = parts[1];
    publicIdPath = publicIdPath.replace(/v\d+\//, '');
    publicIdPath = publicIdPath.substring(0, publicIdPath.lastIndexOf('.')) + '.jpg';

    return `${baseUrl}/upload/${transformations}${publicIdPath}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // Получаем username (Instagram) и email из localStorage
    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');

    // --- ЛОГИКА ПЕРСОНАЛИЗИРОВАННОГО ЗАГОЛОВКА ---
    let headerText = 'Your Video(s)'; // Заголовок по умолчанию

    if (username) {
        headerText = `Your Video(s) for @${username}`;
        if (usernameDisplay) usernameDisplay.textContent = `For: @${username}`; // Обновляем также и текст под заголовком
    } else if (email) {
        headerText = `Your Video(s) for ${email}`;
        if (usernameDisplay) usernameDisplay.textContent = `For: ${email}`; // Обновляем также и текст под заголовком
    } else {
        if (usernameDisplay) usernameDisplay.textContent = 'For: Guest';
    }
    if (resultsHeader) resultsHeader.textContent = headerText;
    // --- КОНЕЦ ЛОГИКИ ПЕРСОНАЛИЗИРОВАННОГО ЗАГОЛОВКА ---


    // --- НАЧАЛО ЛОГИКИ КНОПКИ "Upload New Video(s)" И ДОЗАГРУЗКИ ---
    if (username || email) { // Если есть хоть какие-то данные пользователя
        if (uploadNewBtn) uploadNewBtn.disabled = false;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload New Video(s)';
        if (uploadStatusText) uploadStatusText.textContent = 'Ready for new upload.'; // Начальное сообщение в динамическом статусе
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden'); // Показываем область статуса сразу
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    } else {
        // Если нет данных пользователя (не было первой загрузки), деактивируем кнопку дозагрузки
        if (uploadNewBtn) uploadNewBtn.disabled = true;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload (Login first)';
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Cannot re-upload: no user data found. Please upload videos from the upload page.';
            uploadStatusText.style.color = 'var(--status-error-color)';
        }
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden'); // Показываем сообщение об ошибке
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    }

    // Обработчик клика по кнопке "Upload New Video(s)"
    if (uploadNewBtn) {
        uploadNewBtn.addEventListener('click', () => {
            if (uploadNewBtn.disabled) {
                return; // Ничего не делаем, если кнопка деактивирована
            }
            // Программно кликаем по скрытому полю ввода файла
            if (videoFileInput) videoFileInput.click();
        });
    }


    // Обработчик изменения файла в скрытом поле ввода
    if (videoFileInput) {
        videoFileInput.addEventListener('change', (event) => {
            selectedFile = event.target.files[0];
            if (selectedFile) {
                // Если файл выбран, запускаем процесс загрузки
                uploadVideoFromResults(selectedFile);
                // Сбрасываем выбранный файл после запуска загрузки
                videoFileInput.value = ''; // Очищаем input, чтобы можно было загрузить тот же файл снова
                selectedFile = null;
            } else {
                // Если файл не выбран (пользователь отменил диалог)
                if (uploadStatusText) {
                    uploadStatusText.textContent = 'File selection canceled.';
                    uploadStatusText.style.color = 'var(--status-info-color)';
                }
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            }
        });
    }


    /**
     * Отправляет видео на сервер для обработки, используя имя пользователя из localStorage.
     * @param {File} file - Файл видео для загрузки.
     */
    async function uploadVideoFromResults(file) {
        const currentUsername = localStorage.getItem('hifeUsername');
        const currentEmail = localStorage.getItem('hifeEmail');

        if (!currentUsername && !currentEmail) {
            alert('No user data found. Redirecting to the home page to start over.');
            window.location.replace('index.html'); // Перенаправляем на index.html
            return; // Завершаем выполнение функции
        }

        const formData = new FormData();
        formData.append('video', file);
        if (currentUsername) {
            formData.append('instagram_username', currentUsername);
        }
        if (currentEmail) {
            formData.append('email', currentEmail);
        }

        // Показываем контейнер статуса и сбрасываем прогресс
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden');
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Starting upload...';
            uploadStatusText.style.color = 'var(--status-info-color)';
        }
        if (progressBarContainer) progressBarContainer.style.display = 'flex';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        if (uploadNewBtn) uploadNewBtn.disabled = true; // Деактивируем кнопку во время загрузки


        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    if (progressBar) progressBar.style.width = `${percent.toFixed(0)}%`;
                    if (progressText) progressText.textContent = `${percent.toFixed(0)}%`;
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Uploading: ${percent.toFixed(0)}%`;
                        uploadStatusText.style.color = 'var(--status-info-color)';
                    }
                }
            });

            xhr.onload = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false; // Активируем кнопку после завершения загрузки

                if (xhr.status >= 200 && xhr.status < 300) { // Учитываем 2xx коды как успех
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId; // Используем taskId, как в upload_validation.js
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Video uploaded. Task ID: ${taskId}. Waiting for processing.`;
                        uploadStatusText.style.color = 'var(--status-pending-color)';
                    }
                    if (progressBarContainer) progressBarContainer.style.display = 'none'; // Скрываем прогресс-бар после загрузки

                    // --- Сохраняем новую задачу в localStorage ---
                    let uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    const newVideoEntry = {
                        id: taskId,
                        original_filename: file.name,
                        status: 'pending', // Начальный статус новой задачи
                        timestamp: new Date().toISOString()
                        // metadata и cloudinary_url будут добавлены позже при обновлении статуса
                    };
                    uploadedVideosData.push(newVideoEntry);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideosData));

                    // Создаем новый пузырь для только что загруженной задачи
                    createOrUpdateBubble(taskId, newVideoEntry);

                    // Сразу же запускаем опрос статусов для всех задач, чтобы новая тоже начала обновляться
                    checkTaskStatuses(uploadedVideosData);

                    // Опционально: скрыть контейнер статуса через несколько секунд
                    setTimeout(() => {
                        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.add('hidden');
                        if (uploadStatusText) uploadStatusText.textContent = 'Ready for new upload.'; // Сброс текста для следующей загрузки
                    }, 5000);

                } else {
                    const error = JSON.parse(xhr.responseText);
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Upload error: ${error.error || 'Unknown error'}`;
                        uploadStatusText.style.color = 'var(--status-error-color)';
                    }
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                    // Оставляем сообщение об ошибке видимым
                }
            };

            xhr.onerror = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false; // Активируем кнопку после ошибки
                if (uploadStatusText) {
                    uploadStatusText.textContent = 'Network error during upload.';
                    uploadStatusText.style.color = 'var(--status-error-color)';
                }
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            };

            xhr.send(formData);

        } catch (error) {
            if (uploadNewBtn) uploadNewBtn.disabled = false; // Активируем кнопку после ошибки
            console.error('Error sending upload request:', error);
            if (uploadStatusText) {
                uploadStatusText.textContent = `An error occurred: ${error.message}`;
                uploadStatusText.style.color = 'var(--status-error-color)';
            }
            if (progressBarContainer) progressBarContainer.style.display = 'none';
        }
    }
    // --- КОНЕЦ ЛОГИКИ КНОПКИ "Upload New Video(s)" И ДОЗАГРУЗКИ ---

    // --- СУЩЕСТВУЮЩАЯ ЛОГИКА ЗАГРУЗКИ ДАННЫХ ИЗ localStorage И ОПРОСА СТАТУСОВ ---
    // (Этот блок остался почти без изменений, но я добавил проверки существования элементов)
    const storedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

    if (storedVideosData.length === 0) {
        const existingStatusMessage = document.getElementById('statusMessage');
        if (!existingStatusMessage || existingStatusMessage.textContent.includes('No tasks found')) {
            if (bubblesContainer) bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
        }
    } else {
        if (bubblesContainer) bubblesContainer.innerHTML = '';
        storedVideosData.forEach(video => {
            createOrUpdateBubble(video.id, video);
        });

        const hasPendingTasks = storedVideosData.some(video => video.status !== 'completed' && video.status !== 'error' && video.status !== 'failed');
        let statusMessageElement = document.getElementById('statusMessage');
        if (!statusMessageElement) {
             statusMessageElement = document.createElement('p');
             statusMessageElement.id = 'statusMessage';
             if (bubblesContainer) bubblesContainer.prepend(statusMessageElement);
        }

        if (statusMessageElement) {
            if (hasPendingTasks) {
                statusMessageElement.textContent = 'Checking status of your videos...';
                statusMessageElement.className = 'status-message pending';
            } else {
                statusMessageElement.textContent = 'All tasks completed or processed.';
                statusMessageElement.className = 'status-message info';
            }
        }
    }

    const CHECK_STATUS_INTERVAL_MS = 2000;

    // Запускаем опрос статусов для всех задач, которые находятся в localStorage
    checkTaskStatuses(storedVideosData);


    async function checkTaskStatuses(currentVideosData) {
        const tasksToKeepPolling = [];
        const updatedVideosData = [];

        if (currentVideosData.length === 0 && (!bubblesContainer || bubblesContainer.children.length <= 1)) {
             return;
        }

        for (const video of currentVideosData) {
            const taskId = video.id;
            if (video.status === 'completed' || video.status === 'error' || video.status === 'failed') {
                updatedVideosData.push(video);
                createOrUpdateBubble(taskId, video);
                continue;
            }

            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
                const data = await response.json();

                if (response.ok) {
                    createOrUpdateBubble(taskId, data);
                    if (data.status !== 'completed' && data.status !== 'error' && data.status !== 'failed') {
                        tasksToKeepPolling.push(taskId);
                        // Важно передавать исходный объект видео, чтобы сохранить original_filename
                        updatedVideosData.push(video);
                    } else {
                        updatedVideosData.push({
                            ...video, // Копируем все существующие свойства (включая original_filename)
                            status: data.status,
                            message: data.message,
                            metadata: data.metadata,
                            cloudinary_url: data.cloudinary_url
                        });
                    }
                } else {
                    console.error(`[FRONTEND] Error getting status for task ${taskId}:`, data.message || response.statusText);
                    createOrUpdateBubble(taskId, { id: taskId, status: 'error', message: data.message || 'Failed to fetch status.', original_filename: video.original_filename || `Task ${taskId}` });
                    updatedVideosData.push({ ...video, status: 'error', message: data.message || 'Failed to fetch status.' });
                }
            } catch (error) {
                console.error(`[FRONTEND] Network error checking status for task ${taskId}:`, error);
                createOrUpdateBubble(taskId, { id: taskId, status: 'error', message: 'Network error or backend unreachable.', original_filename: video.original_filename || `Task ${taskId}` });
                updatedVideosData.push({ ...video, status: 'error', message: 'Network error or backend unreachable.' });
            }
        }

        localStorage.setItem('uploadedVideos', JSON.stringify(updatedVideosData));

        const statusMessageElement = document.getElementById('statusMessage');
        if (statusMessageElement) {
            if (tasksToKeepPolling.length > 0) {
                statusMessageElement.textContent = 'Checking status of your videos...';
                statusMessageElement.className = 'status-message pending';
            } else {
                statusMessageElement.textContent = 'All tasks completed or processed.';
                statusMessageElement.className = 'status-message info';
            }
        }

        if (tasksToKeepPolling.length > 0) {
            setTimeout(() => checkTaskStatuses(updatedVideosData.filter(v => tasksToKeepPolling.includes(v.id))), CHECK_STATUS_INTERVAL_MS);
        } else {
            console.log("[FRONTEND] All tasks completed or errored. Polling stopped.");
        }
    }


    function createOrUpdateBubble(taskId, data) {
        let bubble = taskBubbles[taskId];
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'video-bubble loading';
            bubble.id = `bubble-${taskId}`;
            if (bubblesContainer) bubblesContainer.appendChild(bubble);
            taskBubbles[taskId] = bubble;

            const initialMessage = document.getElementById('statusMessage');
            if (initialMessage && initialMessage.textContent.includes('No tasks found')) {
                initialMessage.remove();
            }
        }

        let filenameText = `<h3 class="bubble-title-overlay">${data.original_filename || `Task ${taskId}`}</h3>`;
        let previewHtml = '';
        let statusMessageText = '';

        if (data.status === 'completed') {
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewHtml = `<img class="bubble-preview-img" src="${thumbnailUrl}" alt="Video Preview">`;
            statusMessageText = '<p class="status-message-bubble status-completed">Click</p>';
            bubble.classList.remove('loading');
        } else if (data.status === 'pending' || data.status === 'processing') {
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Video Processing">`;
            statusMessageText = '<p class="status-message-bubble status-pending">Video in processing...</p>';
            bubble.classList.add('loading');
        } else if (data.status === 'error' || data.status === 'failed') {
            previewHtml = `<img class="bubble-preview-img" src="assets/error_placeholder.png" alt="Processing Error">`;
            statusMessageText = `<p class="status-message-bubble status-error">Error: ${data.message || 'Unknown error.'}</p>`;
            bubble.classList.remove('loading');
        } else {
            previewHtml = `<img class="bubble-preview-img" src="assets/placeholder.png" alt="Status Unknown">`;
            statusMessageText = '<p class="status-message-bubble status-info">Getting status...</p>';
            bubble.classList.add('loading');
        }

        bubble.innerHTML = `
            ${previewHtml}
            <div class="bubble-text-overlay">
                ${filenameText}
                ${statusMessageText}
            </div>
        `;

        if (data.status === 'completed' && data.metadata) {
            bubble.onclick = () => showMetadataModal(data.original_filename || `Task ${taskId}`, data.metadata);
            bubble.style.cursor = 'pointer';
        } else {
            bubble.onclick = null;
            bubble.style.cursor = 'default';
        }
    }

    function showMetadataModal(filename, metadata) {
        if (modalTitle) modalTitle.textContent = `Metadata for: ${filename}`;
        if (modalMetadata) modalMetadata.textContent = JSON.stringify(metadata, null, 2);
        if (metadataModal) metadataModal.style.display = 'flex';
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            if (metadataModal) metadataModal.style.display = 'none';
        });
    }


    window.addEventListener('click', (event) => {
        if (metadataModal && event.target == metadataModal) {
            metadataModal.style.display = 'none';
        }
    });
});
