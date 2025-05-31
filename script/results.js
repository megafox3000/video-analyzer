document.addEventListener('DOMContentLoaded', () => {
    // --- Константы ---
    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render
    const MAX_VIDEO_SIZE_MB = 100; // Максимальный размер видео в мегабайтах
    const MAX_VIDEO_DURATION_SECONDS = 60; // Максимальная длительность видео в секундах (10 минут)
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024; // Конвертация в байты
    const CHECK_STATUS_INTERVAL_MS = 2000; // Интервал опроса статуса (2 секунды)

    // --- Элементы DOM ---
    const resultsHeader = document.getElementById('resultsHeader');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const uploadNewBtn = document.getElementById('uploadNewBtn'); // Кнопка "Upload New Video(s)"
    const bubblesContainer = document.getElementById('bubblesContainer');
    const metadataModal = document.getElementById('metadataModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMetadata = document.getElementById('modalMetadata');
    const closeButton = document.querySelector('.close-button');
    const finishSessionBtn = document.getElementById('finishSessionBtn');

    // Элементы для дозагрузки (убедитесь, что они существуют в results.html)
    const videoFileInput = document.getElementById('videoFileInput'); // Скрытое поле ввода файла
    const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const progressBarContainer = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar-container') : null;
    const progressBar = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar') : null;
    const progressText = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-text') : null;

    // ПЕРЕМЕСТИЛИ СЮДА: Объявляем taskBubbles в глобальной области видимости
    const taskBubbles = {};

    // --- Вспомогательная функция для создания URL превью из URL видео Cloudinary ---
    function getCloudinaryThumbnailUrl(videoUrl) {
        if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
            return 'assets/default_video_thumbnail.png'; // Заглушка, если это не Cloudinary URL
        }

        const parts = videoUrl.split('/upload/');
        if (parts.length < 2) {
            return 'assets/default_video_thumbnail.png';
        }

        const baseUrl = parts[0];
        // Можно использовать e_preview для коротких видео для более качественного превью
        // или использовать трансформации c_fill,w_200,h_150,g_auto,q_auto,f_jpg,so_auto/
        const transformations = 'c_fill,w_200,h_150,g_auto,q_auto,f_jpg,so_auto/'; 

        let publicIdPath = parts[1];
        publicIdPath = publicIdPath.replace(/v\d+\//, ''); // Удаляем версию, если есть
        publicIdPath = publicIdPath.substring(0, publicIdPath.lastIndexOf('.')) + '.jpg'; // Меняем расширение на .jpg

        return `${baseUrl}/upload/${transformations}${publicIdPath}`;
    }

    // --- Логика инициализации страницы при загрузке DOM ---
    // Получаем username (Instagram) и email из localStorage
    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');

    // Логика персонализированного заголовка
    let headerText = 'Your Video(s)'; // Заголовок по умолчанию
    if (username) {
        headerText = `Your Video(s) for @${username}`;
        if (usernameDisplay) usernameDisplay.textContent = `For: @${username}`;
    } else if (email) {
        headerText = `Your Video(s) for ${email}`;
        if (usernameDisplay) usernameDisplay.textContent = `For: ${email}`;
    } else {
        if (usernameDisplay) usernameDisplay.textContent = 'For: Guest';
    }
    if (resultsHeader) resultsHeader.textContent = headerText;

    // Логика кнопки "Upload New Video(s)" и области дозагрузки
    if (username || email) { // Если есть хоть какие-то данные пользователя
        if (uploadNewBtn) uploadNewBtn.disabled = false;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload New Video(s)';
        if (uploadStatusText) uploadStatusText.textContent = 'Ready for new upload.';
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.style.display = 'block'; // Показываем область статуса
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    } else {
        // Если нет данных пользователя (не было первой загрузки), деактивируем кнопку дозагрузки
        if (uploadNewBtn) uploadNewBtn.disabled = true;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload (Login first)';
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Cannot re-upload: no user data found. Please upload videos from the upload page.';
            uploadStatusText.style.color = 'var(--status-error-color)';
        }
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.style.display = 'block'; // Показываем сообщение об ошибке
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    }

    // Обработчик клика по кнопке "Upload New Video(s)"
    if (uploadNewBtn) {
        uploadNewBtn.addEventListener('click', () => {
            if (uploadNewBtn.disabled) return;
            if (videoFileInput) videoFileInput.click();
        });
    }

    // Обработчик изменения файла в скрытом поле ввода
    if (videoFileInput) {
        videoFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                // Валидация файла перед началом загрузки
                validateFileAndUpload(file);
                videoFileInput.value = ''; // Очищаем input
            } else {
                displayUploadStatus('File selection canceled.', 'info');
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            }
        });
    }

    // --- Валидация файла и запуск загрузки (для дозагрузки) ---
    async function validateFileAndUpload(file) {
        displayUploadStatus('Validating file...', 'info');
        if (progressBarContainer) progressBarContainer.style.display = 'none'; // Скрываем прогресс пока идет валидация длительности

        // 1. Проверка типа и размера
        if (!file.type.startsWith('video/')) {
            displayUploadStatus('Invalid file type. Please select a video file.', 'error');
            return false;
        }
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
            displayUploadStatus(`File size exceeds the limit of ${MAX_VIDEO_SIZE_MB}MB.`, 'error');
            return false;
        }

        // 2. Проверка длительности (асинхронно)
        const video = document.createElement('video');
        video.preload = 'metadata'; // Загружаем только метаданные
        let durationValid = true;

        const durationPromise = new Promise((resolve) => {
            video.onloadedmetadata = function() {
                window.URL.revokeObjectURL(video.src); // Освобождаем URL
                if (video.duration === Infinity || isNaN(video.duration)) {
                    // Предупреждение, но не блокировка загрузки
                    displayUploadStatus('Warning: Could not determine video duration. Attempting upload anyway.', 'info');
                } else if (video.duration > MAX_VIDEO_DURATION_SECONDS) {
                    displayUploadStatus(`Video duration exceeds the limit of ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`, 'error');
                    durationValid = false;
                }
                resolve();
            };
            video.onerror = function() {
                displayUploadStatus('Failed to load video metadata. The file might be corrupted.', 'error');
                durationValid = false;
                resolve();
            };
            video.src = URL.createObjectURL(file);
        });

        await durationPromise;

        if (!durationValid) {
            return false;
        }

        // Если все проверки пройдены, запускаем загрузку
        uploadVideoFromResults(file);
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
            window.location.replace('index.html');
            return;
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
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.style.display = 'block';
        displayUploadStatus('Starting upload...', 'info');
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
                    displayUploadStatus(`Uploading: ${percent.toFixed(0)}%`, 'info');
                }
            });

            xhr.onload = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false; // Активируем кнопку после завершения загрузки

                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId;
                    displayUploadStatus(`Video uploaded. Task ID: ${taskId}. Waiting for processing.`, 'pending');
                    if (progressBarContainer) progressBarContainer.style.display = 'none'; // Скрываем прогресс-бар

                    // --- Сохраняем новую задачу в localStorage ---
                    let uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    const newVideoEntry = {
                        id: taskId,
                        original_filename: file.name,
                        status: 'pending', // Начальный статус новой задачи
                        timestamp: new Date().toISOString()
                    };
                    uploadedVideosData.push(newVideoEntry);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideosData));

                    // Создаем новый пузырь для только что загруженной задачи
                    createOrUpdateBubble(taskId, newVideoEntry);

                    // Сразу же запускаем опрос статусов для всех задач, чтобы новая тоже начала обновляться
                    checkTaskStatuses(uploadedVideosData);

                    // Опционально: скрыть контейнер статуса через несколько секунд
                    setTimeout(() => {
                        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.style.display = 'none'; // Убираем display: block;
                        displayUploadStatus('Ready for new upload.', 'info'); // Сброс текста для следующей загрузки
                    }, 5000);

                } else {
                    const error = JSON.parse(xhr.responseText);
                    displayUploadStatus(`Upload error: ${error.error || 'Unknown error'}`, 'error');
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                }
            };

            xhr.onerror = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false;
                displayUploadStatus('Network error during upload.', 'error');
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            };

            xhr.send(formData);

        } catch (error) {
            if (uploadNewBtn) uploadNewBtn.disabled = false;
            console.error('Error sending upload request:', error);
            displayUploadStatus(`An error occurred: ${error.message}`, 'error');
            if (progressBarContainer) progressBarContainer.style.display = 'none';
        }
    }

    // --- Отображение статуса загрузки для области дозагрузки на results.html ---
    function displayUploadStatus(message, type = 'info') {
        if (uploadStatusText) {
            uploadStatusText.textContent = message;
            switch (type) {
                case 'info':
                    uploadStatusText.style.color = 'var(--status-info-color)';
                    break;
                case 'pending':
                    uploadStatusText.style.color = 'var(--status-pending-color)';
                    break;
                case 'completed':
                    uploadStatusText.style.color = 'var(--status-completed-color)';
                    break;
                case 'error':
                    uploadStatusText.style.color = 'var(--status-error-color)';
                    break;
                default:
                    uploadStatusText.style.color = 'var(--text-color-light)';
            }
        }
    }


    // --- Логика загрузки данных из localStorage и опроса статусов ---
    const storedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

    if (storedVideosData.length === 0) {
        const existingStatusMessage = document.getElementById('statusMessage');
        if (!existingStatusMessage || existingStatusMessage.textContent.includes('No tasks found')) {
            if (bubblesContainer) bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
        }
    } else {
        if (bubblesContainer) bubblesContainer.innerHTML = ''; // Очищаем контейнер, чтобы перерисовать
        storedVideosData.forEach(video => {
            createOrUpdateBubble(video.id, video);
        });

        // Обновляем общий статус страницы
        const hasPendingTasks = storedVideosData.some(video => video.status !== 'completed' && video.status !== 'error' && video.status !== 'failed');
        let statusMessageElement = document.getElementById('statusMessage');
        if (!statusMessageElement) {
            statusMessageElement = document.createElement('p');
            statusMessageElement.id = 'statusMessage';
            if (bubblesContainer) bubblesContainer.prepend(statusMessageElement); // Добавляем перед пузырями
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

    // Запускаем опрос статусов для всех задач
    checkTaskStatuses(storedVideosData);


    async function checkTaskStatuses(currentVideosData) {
        const tasksToKeepPolling = [];
        const updatedVideosData = [];

        // Если нет задач для опроса и в контейнере только статусное сообщение, выходим
        if (currentVideosData.length === 0 && bubblesContainer && bubblesContainer.children.length === 1 && bubblesContainer.querySelector('#statusMessage')) {
            return;
        }

        for (const video of currentVideosData) {
            const taskId = video.id;
            // Если задача уже завершена или содержит ошибку, просто обновляем пузырь и продолжаем
            if (video.status === 'completed' || video.status === 'error' || video.status === 'failed') {
                updatedVideosData.push(video);
                createOrUpdateBubble(taskId, video);
                continue;
            }

            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
                const data = await response.json();

                if (response.ok) {
                    createOrUpdateBubble(taskId, data); // Обновляем пузырь с новыми данными
                    if (data.status !== 'completed' && data.status !== 'error' && data.status !== 'failed') {
                        tasksToKeepPolling.push(taskId);
                        // Важно: сохраняем original_filename из исходного объекта video
                        updatedVideosData.push({ ...video, ...data }); // Обновляем данные, сохраняя старые
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
                    const errorMessage = data.message || 'Failed to fetch status.';
                    createOrUpdateBubble(taskId, { id: taskId, status: 'error', message: errorMessage, original_filename: video.original_filename || `Task ${taskId}` });
                    updatedVideosData.push({ ...video, status: 'error', message: errorMessage });
                }
            } catch (error) {
                console.error(`[FRONTEND] Network error checking status for task ${taskId}:`, error);
                const networkErrorMessage = 'Network error or backend unreachable.';
                createOrUpdateBubble(taskId, { id: taskId, status: 'error', message: networkErrorMessage, original_filename: video.original_filename || `Task ${taskId}` });
                updatedVideosData.push({ ...video, status: 'error', message: networkErrorMessage });
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

        // Если есть задачи для продолжения опроса, устанавливаем таймер
        if (tasksToKeepPolling.length > 0) {
            // Передаем только те данные, которые нужно продолжать опрашивать
            const nextPollingData = updatedVideosData.filter(v => tasksToKeepPolling.includes(v.id));
            setTimeout(() => checkTaskStatuses(nextPollingData), CHECK_STATUS_INTERVAL_MS);
        } else {
            console.log("[FRONTEND] All tasks completed or errored. Polling stopped.");
        }
    }


    // --- Функция создания/обновления "пузыря" видео ---
    function createOrUpdateBubble(taskId, data) {
        let bubble = taskBubbles[taskId];
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'video-bubble loading';
            bubble.id = `bubble-${taskId}`;
            if (bubblesContainer) bubblesContainer.appendChild(bubble);
            taskBubbles[taskId] = bubble;

            // Удаляем начальное сообщение "No tasks found", если добавлен первый пузырь
            const initialMessage = document.getElementById('statusMessage');
            if (initialMessage && initialMessage.textContent.includes('No tasks found')) {
                initialMessage.remove();
            }
        }

        // Обновление содержимого пузыря
        let filenameText = `<h3 class="bubble-title-overlay">${data.original_filename || `Task ${taskId}`}</h3>`;
        let previewHtml = '';
        let statusMessageText = '';

        if (data.status === 'completed') {
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewHtml = `<img class="bubble-preview-img" src="${thumbnailUrl}" alt="Video Preview">`;
            statusMessageText = '<p class="status-message-bubble status-completed">Click to view metadata</p>'; // Обновленный текст
            bubble.classList.remove('loading');
        } else if (data.status === 'pending' || data.status === 'processing') {
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Video Processing">`;
            statusMessageText = '<p class="status-message-bubble status-pending">Video in processing...</p>';
            bubble.classList.add('loading');
        } else if (data.status === 'error' || data.status === 'failed') {
            previewHtml = `<img class="bubble-preview-img" src="assets/error_placeholder.png" alt="Processing Error">`;
            statusMessageText = `<p class="status-message-bubble status-error">Error: ${data.message || 'Unknown error.'}</p>`;
            bubble.classList.remove('loading');
        } else { // Для начального состояния или неизвестного статуса
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

        // Установка обработчика клика для модального окна
        if (data.status === 'completed' && data.metadata) {
            bubble.onclick = () => showMetadataModal(data.original_filename || `Task ${taskId}`, data.metadata);
            bubble.style.cursor = 'pointer';
        } else {
            bubble.onclick = null; // Отключаем клик, если нет метаданных или статус не "completed"
            bubble.style.cursor = 'default';
        }
    }

    // --- Функции для модального окна ---
    function showMetadataModal(filename, metadata) {
        if (modalTitle) modalTitle.textContent = `Metadata for: ${filename}`;
        // Преобразуем объект метаданных в читабельную строку JSON
        if (modalMetadata) modalMetadata.textContent = JSON.stringify(metadata, null, 2);
        if (metadataModal) metadataModal.style.display = 'flex'; // Показываем модальное окно
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            if (metadataModal) metadataModal.style.display = 'none'; // Скрываем модальное окно
        });
    }

    // Скрытие модального окна при клике вне его содержимого
    window.addEventListener('click', (event) => {
        if (metadataModal && event.target == metadataModal) {
            metadataModal.style.display = 'none';
        }
    });

    // --- Обработчик кнопки "Finish Session" ---
    if (finishSessionBtn) {
        finishSessionBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to finish the session? This will clear all your saved video data and redirect you to the home page.')) {
                localStorage.removeItem('hifeUsername');
                localStorage.removeItem('hifeEmail');
                localStorage.removeItem('uploadedVideos');
                window.location.replace('index.html'); // Перенаправляем на домашнюю страницу
            }
        });
    }
});
