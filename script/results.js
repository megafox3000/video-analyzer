const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';

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

// Check that elements exist before attempting to get their children
const progressBarContainer = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar-container') : null;
const progressBar = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar') : null;
const progressText = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-text') : null;

// Declare taskBubbles in global scope
const taskBubbles = {};

// Helper function to create a thumbnail URL from a Cloudinary video URL
function getCloudinaryThumbnailUrl(videoUrl) {
    if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
        return 'assets/default_video_thumbnail.png'; // Placeholder if not a Cloudinary URL
    }

    const parts = videoUrl.split('/upload/');
    if (parts.length < 2) {
        return 'assets/default_video_thumbnail.png';
    }

    const baseUrl = parts[0];
    // Transformations for a 120x120 thumbnail, auto-cropped, auto-quality, JPG format
    const transformations = 'c_thumb,w_120,h_120,g_auto,q_auto:eco,f_jpg,so_auto/'; 

    let publicIdPath = parts[1];
    publicIdPath = publicIdPath.replace(/v\d+\//, '');
    publicIdPath = publicIdPath.substring(0, publicIdPath.lastIndexOf('.')) + '.jpg';

    return `${baseUrl}/upload/${transformations}${publicIdPath}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // Get username (Instagram), email, and LinkedIn from localStorage
    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');
    const linkedin = localStorage.getItem('hifeLinkedin'); 

    // --- PERSONALIZED HEADER LOGIC ---
    let headerText = 'Ваши видео'; 
    let userIdentifier = '';

    if (username) {
        userIdentifier = `@${username}`;
    } else if (email) {
        userIdentifier = email;
    } else if (linkedin) { 
        userIdentifier = `LinkedIn: ${linkedin}`;
    } else {
        userIdentifier = 'Гость'; 
    }

    if (resultsHeader) resultsHeader.textContent = `Ваши видео: ${userIdentifier}`;
    if (usernameDisplay) usernameDisplay.textContent = `Для: ${userIdentifier}`;
    // --- END PERSONALIZED HEADER LOGIC ---


    // --- START "Upload New Video(s)" BUTTON AND RE-UPLOAD LOGIC ---
    if (username || email || linkedin) { 
        if (uploadNewBtn) uploadNewBtn.disabled = false;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Загрузить новое видео'; 
        if (uploadStatusText) uploadStatusText.textContent = 'Готов к новой загрузке.'; 
        // dynamicUploadStatusContainer starts hidden in HTML, show it if user data exists
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden'); 
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    } else {
        // If no user data (no initial upload), deactivate re-upload button
        if (uploadNewBtn) uploadNewBtn.disabled = true;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Загрузить (сначала войдите)'; 
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Невозможно повторно загрузить: данные пользователя не найдены. Пожалуйста, загрузите видео со страницы загрузки.'; 
            uploadStatusText.style.color = 'var(--status-error-color)';
        }
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden'); 
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    }

    // Click handler for "Upload New Video(s)" button
    if (uploadNewBtn) {
        uploadNewBtn.addEventListener('click', () => {
            if (uploadNewBtn.disabled) {
                return; 
            }
            // Programmatically click the hidden file input
            if (videoFileInput) videoFileInput.click();
        });
    }

    // Change handler for the hidden file input
    if (videoFileInput) {
        videoFileInput.addEventListener('change', (event) => {
            const selectedFile = event.target.files[0];
            if (selectedFile) {
                uploadVideoFromResults(selectedFile);
                videoFileInput.value = ''; 
            } else {
                if (uploadStatusText) {
                    uploadStatusText.textContent = 'Выбор файла отменен.'; 
                    uploadStatusText.style.color = 'var(--status-info-color)';
                }
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            }
        });
    }


    /**
     * Sends the video to the server for processing, using user data from localStorage.
     * @param {File} file - Video file to upload.
     */
    async function uploadVideoFromResults(file) {
        const currentUsername = localStorage.getItem('hifeUsername');
        const currentEmail = localStorage.getItem('hifeEmail');
        const currentLinkedin = localStorage.getItem('hifeLinkedin'); 

        if (!currentUsername && !currentEmail && !currentLinkedin) { 
            console.error('No user data found. Redirecting to the home page to start over.');
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
        if (currentLinkedin) { 
            formData.append('linkedin_profile', currentLinkedin);
        }

        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden');
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Начало загрузки...'; 
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
                        uploadStatusText.textContent = `Загрузка: ${percent.toFixed(0)}%`; 
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
                        uploadStatusText.textContent = `Видео загружено. ID задачи: ${taskId}. Ожидание обработки.`; 
                        uploadStatusText.style.color = 'var(--status-pending-color)';
                    }
                    if (progressBarContainer) progressBarContainer.style.display = 'none'; 

                    let uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    const newVideoEntry = {
                        id: taskId,
                        original_filename: file.name,
                        status: 'pending', 
                        timestamp: new Date().toISOString(),
                        cloudinary_url: response.cloudinary_url || '' 
                    };
                    uploadedVideosData.push(newVideoEntry);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideosData));

                    createOrUpdateBubble(taskId, newVideoEntry);

                    checkTaskStatuses(uploadedVideosData);

                    setTimeout(() => {
                        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.add('hidden');
                        if (uploadStatusText) uploadStatusText.textContent = 'Готов к новой загрузке.'; 
                    }, 5000);

                } else {
                    const error = JSON.parse(xhr.responseText);
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Ошибка загрузки: ${error.error || 'Неизвестная ошибка'}`; 
                        uploadStatusText.style.color = 'var(--status-error-color)';
                    }
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                }
            };

            xhr.onerror = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false; 
                if (uploadStatusText) {
                    uploadStatusText.textContent = 'Ошибка сети во время загрузки.'; 
                    uploadStatusText.style.color = 'var(--status-error-color)';
                }
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            };

            xhr.send(formData);

        } catch (error) {
            if (uploadNewBtn) uploadNewBtn.disabled = false; 
            console.error('Error sending upload request:', error);
            if (uploadStatusText) {
                uploadStatusText.textContent = `Произошла ошибка: ${error.message}`; 
                uploadStatusText.style.color = 'var(--status-error-color)';
            }
            if (progressBarContainer) progressBarContainer.style.display = 'none';
        }
    }

    const storedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

    if (storedVideosData.length === 0) {
        const existingStatusMessage = document.getElementById('statusMessage');
        if (!existingStatusMessage || (existingStatusMessage.textContent.includes('Задач не найдено') && existingStatusMessage.id === 'statusMessage')) { 
            if (bubblesContainer) bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со страницы <a href="upload.html" style="color: #FFD700; text-decoration: underline;">загрузки</a>.</p>'; 
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
            // Prepend the status message to the bubblesContainer
            if (bubblesContainer) bubblesContainer.prepend(statusMessageElement);
        }

        if (statusMessageElement) {
            if (hasPendingTasks) {
                statusMessageElement.textContent = 'Проверка статуса ваших видео...'; 
                statusMessageElement.className = 'status-message pending';
            } else {
                statusMessageElement.textContent = 'Все задачи завершены или обработаны.'; 
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
                statusMessageElement.textContent = 'Все задачи завершены или обработаны.'; 
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
                    } else {
                        currentVideoInLocalStorage = {
                            id: taskId,
                            original_filename: data.original_filename || `Задача ${taskId}`, 
                            status: data.status,
                            message: data.message,
                            metadata: data.metadata,
                            cloudinary_url: data.cloudinary_url,
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
                            original_filename: `Задача ${taskId}`,
                            status: 'error',
                            message: 'Failed to fetch status.',
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
                        original_filename: `Задача ${taskId}`,
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
                statusMessageElement.textContent = 'Проверка статуса ваших видео...'; 
                statusMessageElement.className = 'status-message pending';
            } else {
                statusMessageElement.textContent = 'Все задачи завершены или обработаны.'; 
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
            bubble.classList.add('media-bubble'); 
            bubble.id = `bubble-${taskId}`;
            if (bubblesContainer) bubblesContainer.appendChild(bubble);
            taskBubbles[taskId] = bubble;

            const initialMessage = document.getElementById('statusMessage');
            if (initialMessage && initialMessage.textContent.includes('Задач не найдено')) { 
                initialMessage.remove();
            }
        }

        let filenameText = data.original_filename || `Задача ${taskId}`; 
        let previewContent = ''; 
        let statusText = '';
        let statusClass = '';

        switch (data.status) {
            case 'pending':
                statusText = 'Ожидает'; 
                statusClass = 'status-pending';
                bubble.classList.add('loading'); 
                break;
            case 'processing':
                statusText = 'В обработке'; 
                statusClass = 'status-processing';
                bubble.classList.add('loading'); 
                break;
            case 'completed':
                statusText = 'ОК'; // Changed from 'Готово' to 'ОК'
                statusClass = 'status-completed';
                bubble.classList.remove('loading'); 
                break;
            case 'error':
            case 'failed':
                statusText = 'BAD'; // Changed from 'Ошибка' to 'BAD'
                statusClass = 'status-error'; // Will use status-error which links to bad color
                bubble.classList.remove('loading'); 
                break;
            default:
                statusText = 'Неизвестно'; 
                statusClass = '';
                bubble.classList.add('loading'); 
        }

        if (data.cloudinary_url) { 
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewContent = `<img class="media-bubble-img" src="${thumbnailUrl}" alt="Предпросмотр видео" onerror="this.onerror=null;this.src='assets/default_video_thumbnail.png';">`; 
        } else {
            previewContent = `<img class="media-bubble-img" src="assets/default_video_thumbnail.png" alt="Заглушка видео">`; 
        }
        
        bubble.innerHTML = `
            ${previewContent}
            <div class="result-bubble-overlay">
                <span class="bubble-title">${filenameText}</span>
                <span class="bubble-status ${statusClass}">${statusText}</span>
            </div>
        `;

        if (data.status === 'completed' && data.metadata) {
            bubble.onclick = () => showMetadataModal(data.original_filename || `Задача ${taskId}`, data.metadata); 
            bubble.style.cursor = 'pointer';
        } else {
            bubble.onclick = null; 
            bubble.style.cursor = 'default';
        }
    }

    function showMetadataModal(filename, metadata) {
        if (modalTitle) modalTitle.textContent = `Метаданные для: ${filename}`; 
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
        // Only show finish session button if there are uploaded videos
        if (JSON.parse(localStorage.getItem('uploadedVideos') || '[]').length > 0) {
            finishSessionBtn.style.display = 'inline-block';
        } else {
            finishSessionBtn.style.display = 'none';
        }

        finishSessionBtn.addEventListener('click', () => {
            localStorage.removeItem('hifeUsername');
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('hifeLinkedin'); 
            localStorage.removeItem('uploadedVideos');
            console.log("Сессия завершена. Локальное хранилище очищено."); 
            window.location.replace('index.html');
        });
    }
});
