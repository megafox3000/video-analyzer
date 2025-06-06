const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш URL бэкенда

const resultsHeader = document.getElementById('resultsHeader');
const usernameDisplay = document.getElementById('usernameDisplay');
const uploadNewBtn = document.getElementById('uploadNewBtn');
const bubblesContainer = document.getElementById('bubblesContainer');
const metadataModal = document.getElementById('metadataModal');
const modalTitle = document.getElementById('modalTitle');
const modalMetadata = document.getElementById('modalMetadata');
const closeButton = document.querySelector('.close-button');

// Elements for re-uploading
const videoFileInput = document.getElementById('videoFileInput');
const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
const uploadStatusText = document.getElementById('uploadStatusText');

const progressBarContainer = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar-container') : null;
const progressBar = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar') : null;
const progressText = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-text') : null;

const taskBubbles = {};

function getCloudinaryThumbnailUrl(videoUrl) {
    if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
        return 'assets/default_video_thumbnail.png';
    }

    const parts = videoUrl.split('/upload/');
    if (parts.length < 2) {
        return 'assets/default_video_thumbnail.png';
    }

    const baseUrl = parts[0];
    const transformations = 'c_fill,w_200,h_150,g_auto,q_auto:eco,f_jpg,so_auto/';

    let publicIdPath = parts[1];
    publicIdPath = publicIdPath.replace(/v\d+\//, '');
    publicIdPath = publicIdPath.substring(0, publicIdPath.lastIndexOf('.')) + '.jpg';

    return `${baseUrl}/upload/${transformations}${publicIdPath}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');

    let headerText = 'Your Video(s)';
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

    if (username || email) {
        if (uploadNewBtn) uploadNewBtn.disabled = false;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload New Video(s)';
        if (uploadStatusText) uploadStatusText.textContent = 'Ready for new upload.';
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden');
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    } else {
        if (uploadNewBtn) uploadNewBtn.disabled = true;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload (Login first)';
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Cannot re-upload: no user data found. Please upload videos from the upload page.';
            uploadStatusText.style.color = 'var(--status-error-color)';
        }
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden');
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    }

    if (uploadNewBtn) {
        uploadNewBtn.addEventListener('click', () => {
            if (uploadNewBtn.disabled) {
                return;
            }
            if (videoFileInput) videoFileInput.click();
        });
    }

    if (videoFileInput) {
        videoFileInput.addEventListener('change', (event) => {
            const selectedFile = event.target.files[0];
            if (selectedFile) {
                uploadVideoFromResults(selectedFile);
                videoFileInput.value = '';
            } else {
                if (uploadStatusText) {
                    uploadStatusText.textContent = 'File selection canceled.';
                    uploadStatusText.style.color = 'var(--status-info-color)';
                }
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            }
        });
    }

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

        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden');
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Starting upload...';
            uploadStatusText.style.color = 'var(--status-info-color)';
        }
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
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Uploading: ${percent.toFixed(0)}%`;
                        uploadStatusText.style.color = 'var(--status-info-color)';
                    }
                }
            });

            xhr.onload = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false;

                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId;
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Video uploaded. Task ID: ${taskId}. Waiting for processing.`;
                        uploadStatusText.style.color = 'var(--status-pending-color)';
                    }
                    if (progressBarContainer) progressBarContainer.style.display = 'none';

                    let uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    const newVideoEntry = {
                        id: taskId,
                        original_filename: file.name,
                        status: 'completed', // Initial status after upload is 'completed' as per backend
                        timestamp: new Date().toISOString()
                    };
                    uploadedVideosData.push(newVideoEntry);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideosData));

                    createOrUpdateBubble(taskId, newVideoEntry);
                    checkTaskStatuses(uploadedVideosData);

                    setTimeout(() => {
                        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.add('hidden');
                        if (uploadStatusText) uploadStatusText.textContent = 'Ready for new upload.';
                    }, 5000);

                } else {
                    const error = JSON.parse(xhr.responseText);
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Upload error: ${error.error || 'Unknown error'}`;
                        uploadStatusText.style.color = 'var(--status-error-color)';
                    }
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                }
            };

            xhr.onerror = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false;
                if (uploadStatusText) {
                    uploadStatusText.textContent = 'Network error during upload.';
                    uploadStatusText.style.color = 'var(--status-error-color)';
                }
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            };

            xhr.send(formData);

        } catch (error) {
            if (uploadNewBtn) uploadNewBtn.disabled = false;
            console.error('Error sending upload request:', error);
            if (uploadStatusText) {
                uploadStatusText.textContent = `An error occurred: ${error.message}`;
                uploadStatusText.style.color = 'var(--status-error-color)';
            }
            if (progressBarContainer) progressBarContainer.style.display = 'none';
        }
    }

    const storedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

    if (storedVideosData.length === 0) {
        const existingStatusMessage = document.getElementById('statusMessage');
        if (!existingStatusMessage || (existingStatusMessage.textContent.includes('No tasks found') && existingStatusMessage.id === 'statusMessage')) {
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

    checkTaskStatuses(storedVideosData.filter(v => v.status !== 'completed' && v.status !== 'error' && v.status !== 'failed'));


    async function checkTaskStatuses(currentVideosData) {
        const tasksToKeepPolling = [];
        const updatedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

        if (currentVideosData.length === 0 && (!bubblesContainer || bubblesContainer.children.length <= 1)) {
            const statusMessageElement = document.getElementById('statusMessage');
            if (statusMessageElement) {
                statusMessageElement.textContent = 'All tasks completed or processed.';
                statusMessageElement.className = 'status-message info';
            }
            return;
        }

        for (const video of currentVideosData) {
            const taskId = video.id;
            let currentVideoInLocalStorage = updatedVideosData.find(v => v.id === taskId);
            
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
                        currentVideoInLocalStorage.message = data.message;
                        currentVideoInLocalStorage.metadata = data.metadata;
                        currentVideoInLocalStorage.cloudinary_url = data.cloudinary_url;
                        // --- Обновляем поля Shotstack ---
                        currentVideoInLocalStorage.shotstackRenderId = data.shotstackRenderId || null;
                        currentVideoInLocalStorage.shotstackUrl = data.shotstackUrl || null;
                        // --- Конец обновления полей Shotstack ---
                    } else {
                        currentVideoInLocalStorage = {
                            id: taskId,
                            original_filename: data.original_filename || `Task ${taskId}`,
                            status: data.status,
                            message: data.message,
                            metadata: data.metadata,
                            cloudinary_url: data.cloudinary_url,
                            // --- Добавляем поля Shotstack для новых задач ---
                            shotstackRenderId: data.shotstackRenderId || null,
                            shotstackUrl: data.shotstackUrl || null,
                            // --- Конец добавления полей Shotstack ---
                            timestamp: new Date().toISOString()
                        };
                        updatedVideosData.push(currentVideoInLocalStorage);
                    }
                    createOrUpdateBubble(taskId, currentVideoInLocalStorage);
                    
                    if (currentVideoInLocalStorage.status !== 'completed' && currentVideoInLocalStorage.status !== 'error' && currentVideoInLocalStorage.status !== 'failed') {
                        tasksToKeepPolling.push(currentVideoInLocalStorage.id);
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
        let actionButtonsHtml = ''; // Для кнопок действий

        if (data.status === 'completed') {
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewHtml = `<img class="bubble-preview-img" src="${thumbnailUrl}" alt="Video Preview">`;
            statusMessageText = '<p class="status-message-bubble status-completed">Click to view metadata</p>';
            bubble.classList.remove('loading');
            
            // Кнопка для запуска Shotstack
            actionButtonsHtml += `<button class="action-button generate-button" data-task-id="${taskId}">Generate with Shotstack</button>`;

            // Кнопка для просмотра сгенерированного видео (если оно есть)
            if (data.shotstackUrl) {
                actionButtonsHtml += `<a href="${data.shotstackUrl}" target="_blank" class="action-button view-generated-button">View Generated Video</a>`;
            }

        } else if (data.status === 'shotstack_pending' || data.status === 'processing') {
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Video Processing">`;
            statusMessageText = '<p class="status-message-bubble status-pending">Video in processing (Shotstack)...</p>';
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
                <div class="bubble-actions">
                    ${actionButtonsHtml}
                </div>
            </div>
        `;

        // Устанавливаем обработчик для модального окна метаданных
        if (data.status === 'completed' && data.metadata) {
            bubble.onclick = () => showMetadataModal(data.original_filename || `Task ${taskId}`, data.metadata);
            bubble.style.cursor = 'pointer';
        } else {
            bubble.onclick = null;
            bubble.style.cursor = 'default';
        }

        // Обработчик для кнопки "Generate with Shotstack"
        const generateButton = bubble.querySelector('.generate-button');
        if (generateButton) {
            generateButton.addEventListener('click', async (event) => {
                event.stopPropagation(); // Предотвращаем всплытие события к bubble.onclick
                generateButton.disabled = true; // Отключаем кнопку, чтобы избежать повторных кликов
                generateButton.textContent = 'Generating...';
                generateButton.style.backgroundColor = 'var(--status-pending-color)';

                try {
                    const response = await fetch(`${RENDER_BACKEND_URL}/generate-shotstack-video`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ taskId: taskId })
                    });

                    const result = await response.json();
                    if (response.ok) {
                        alert(`Shotstack generation initiated for ${data.original_filename || `Task ${taskId}`}. Render ID: ${result.shotstackRenderId}`);
                        // Обновляем статус в localStorage и UI
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
                        alert(`Error initiating Shotstack generation: ${result.error}`);
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

    function showMetadataModal(filename, metadata) {
        if (modalTitle) modalTitle.textContent = `Metadata for: ${filename}`;
        if (modalMetadata) modalMetadata.textContent = typeof metadata === 'object' && metadata !== null ? JSON.stringify(metadata, null, 2) : String(metadata);
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

    const finishSessionBtn = document.getElementById('finishSessionBtn');
    if (finishSessionBtn) {
        if (JSON.parse(localStorage.getItem('uploadedVideos') || '[]').length > 0) {
            finishSessionBtn.style.display = 'inline-block';
        } else {
            finishSessionBtn.style.display = 'none';
        }

        finishSessionBtn.addEventListener('click', () => {
            localStorage.removeItem('hifeUsername');
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('uploadedVideos');
            console.log("Session finished. LocalStorage cleared.");
            window.location.replace('index.html');
        });
    }
});
