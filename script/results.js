document.addEventListener('DOMContentLoaded', () => {
    // --- Константы ---
    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render
    const MAX_VIDEO_SIZE_MB = 100; // Максимальный размер видео в мегабайтах
    const MAX_VIDEO_DURATION_SECONDS = 600; // Максимальная длительность видео в секундах (10 минут)
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024; // Конвертация в байты
    const CHECK_STATUS_INTERVAL_MS = 2000; // Интервал опроса статуса (2 секунды)

    // --- Элементы DOM ---
    const resultsHeader = document.getElementById('resultsHeader');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const uploadNewBtn = document.getElementById('uploadNewBtn');
    const bubblesContainer = document.getElementById('bubblesContainer');
    const metadataModal = document.getElementById('metadataModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMetadata = document.getElementById('modalMetadata');
    const closeButton = document.querySelector('.close-button');
    const finishSessionBtn = document.getElementById('finishSessionBtn');

    const videoFileInput = document.getElementById('videoFileInput');
    const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const progressBarContainer = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar-container') : null;
    const progressBar = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar') : null;
    const progressText = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-text') : null;

    const taskBubbles = {};

    // --- Вспомогательная функция для создания URL превью из URL видео Cloudinary ---
    function getCloudinaryThumbnailUrl(videoUrl) {
        if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
            return 'assets/default_video_thumbnail.png';
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

    // --- Логика инициализации страницы при загрузке DOM ---
    const username = localStorage.getItem('hifeUsername');
    const linkedin = localStorage.getItem('hifeLinkedin'); // Получаем LinkedIn из localStorage
    const email = localStorage.getItem('hifeEmail');

    let headerText = 'Your Video(s)';
    let displayUser = '';

    if (username) {
        displayUser += `@${username}`;
    }
    if (linkedin) {
        if (displayUser) displayUser += ', ';
        displayUser += `LinkedIn`; // Можно отобразить URL или просто "LinkedIn"
    }
    if (email) {
        if (displayUser) displayUser += ', ';
        displayUser += `${email}`;
    }

    if (displayUser) {
        headerText = `Your Video(s) for ${displayUser}`;
        if (usernameDisplay) usernameDisplay.textContent = `For: ${displayUser}`;
    } else {
        if (usernameDisplay) usernameDisplay.textContent = 'For: Guest';
    }
    if (resultsHeader) resultsHeader.textContent = headerText;

    // Логика кнопки "Upload New Video(s)" и области дозагрузки
    if (username || linkedin || email) { // Обновлено условие
        if (uploadNewBtn) uploadNewBtn.disabled = false;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload New Video(s)';
        if (uploadStatusText) uploadStatusText.textContent = 'Ready for new upload.';
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.style.display = 'block';
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    } else {
        if (uploadNewBtn) uploadNewBtn.disabled = true;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload (Login first)';
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Cannot re-upload: no user data found. Please upload videos from the upload page.';
            uploadStatusText.style.color = 'var(--status-error-color)';
        }
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.style.display = 'block';
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    }

    if (uploadNewBtn) {
        uploadNewBtn.addEventListener('click', () => {
            if (uploadNewBtn.disabled) return;
            if (videoFileInput) videoFileInput.click();
        });
    }

    if (videoFileInput) {
        videoFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                validateFileAndUpload(file);
                videoFileInput.value = '';
            } else {
                displayUploadStatus('File selection canceled.', 'info');
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            }
        });
    }

    // --- Валидация файла и запуск загрузки (для дозагрузки) ---
    async function validateFileAndUpload(file) {
        displayUploadStatus('Validating file...', 'info');
        if (progressBarContainer) progressBarContainer.style.display = 'none';

        if (!file.type.startsWith('video/')) {
            displayUploadStatus('Invalid file type. Please select a video file.', 'error');
            return false;
        }
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
            displayUploadStatus(`File size exceeds the limit of ${MAX_VIDEO_SIZE_MB}MB.`, 'error');
            return false;
        }

        const video = document.createElement('video');
        video.preload = 'metadata';
        let durationValid = true;

        const durationPromise = new Promise((resolve) => {
            video.onloadedmetadata = function() {
                window.URL.revokeObjectURL(video.src);
                if (video.duration === Infinity || isNaN(video.duration)) {
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

        uploadVideoFromResults(file);
    }

    async function uploadVideoFromResults(file) {
        const currentUsername = localStorage.getItem('hifeUsername');
        const currentLinkedin = localStorage.getItem('hifeLinkedin'); // Получаем LinkedIn
        const currentEmail = localStorage.getItem('hifeEmail');

        if (!currentUsername && !currentLinkedin && !currentEmail) { // Обновлено условие
            alert('No user data found. Redirecting to the home page to start over.');
            window.location.replace('index.html');
            return;
        }

        const formData = new FormData();
        formData.append('video', file);
        if (currentUsername) {
            formData.append('instagram_username', currentUsername);
        }
        if (currentLinkedin) {
            formData.append('linkedin_profile', currentLinkedin); // Отправляем LinkedIn
        }
        if (currentEmail) {
            formData.append('email', currentEmail);
        }

        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.style.display = 'block';
        displayUploadStatus('Starting upload...', 'info');
        if (progressBarContainer) progressBarContainer.style.display = 'flex';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        if (uploadNewBtn) uploadNewBtn.disabled = true;

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
                if (uploadNewBtn) uploadNewBtn.disabled = false;

                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId;
                    displayUploadStatus(`Video uploaded. Task ID: ${taskId}. Waiting for processing.`, 'pending');
                    if (progressBarContainer) progressBarContainer.style.display = 'none';

                    let uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    const newVideoEntry = {
                        id: taskId,
                        original_filename: file.name,
                        status: 'pending',
                        timestamp: new Date().toISOString()
                    };
                    uploadedVideosData.push(newVideoEntry);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideosData));

                    createOrUpdateBubble(taskId, newVideoEntry);

                    checkTaskStatuses(uploadedVideosData);

                    setTimeout(() => {
                        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.style.display = 'none';
                        displayUploadStatus('Ready for new upload.', 'info');
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

    checkTaskStatuses(storedVideosData);

    async function checkTaskStatuses(currentVideosData) {
        const tasksToKeepPolling = [];
        const updatedVideosData = [];

        if (currentVideosData.length === 0 && bubblesContainer && bubblesContainer.children.length === 1 && bubblesContainer.querySelector('#statusMessage')) {
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
                        updatedVideosData.push({ ...video, ...data });
                    } else {
                        updatedVideosData.push({
                            ...video,
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

        if (tasksToKeepPolling.length > 0) {
            const nextPollingData = updatedVideosData.filter(v => tasksToKeepPolling.includes(v.id));
            setTimeout(() => checkTaskStatuses(nextPollingData), CHECK_STATUS_INTERVAL_MS);
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
            statusMessageText = '<p class="status-message-bubble status-completed">Click to view metadata</p>';
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

    if (finishSessionBtn) {
        finishSessionBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to finish the session? This will clear all your saved video data and redirect you to the home page.')) {
                localStorage.removeItem('hifeUsername');
                localStorage.removeItem('hifeLinkedin'); // Удаляем LinkedIn
                localStorage.removeItem('hifeEmail');
                localStorage.removeItem('uploadedVideos');
                window.location.replace('index.html');
            }
        });
    }
});
