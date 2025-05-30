const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render

const resultsHeader = document.getElementById('resultsHeader');
const usernameDisplay = document.getElementById('usernameDisplay');
const uploadNewBtn = document.getElementById('uploadNewBtn');
const bubblesContainer = document.getElementById('bubblesContainer');
const metadataModal = document.getElementById('metadataModal');
const modalTitle = document.getElementById('modalTitle');
const modalMetadata = document.getElementById('modalMetadata');
const closeButton = document.querySelector('.close-button');

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
    const uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    
    let pendingTaskIds = uploadedVideosData
        .filter(video => video.status !== 'completed' && video.status !== 'error' && video.status !== 'failed')
        .map(video => video.id);

    const username = localStorage.getItem('hifeUsername') || 'Guest'; 
    usernameDisplay.textContent = `For: @${username}`;

    resultsHeader.textContent = 'Your Video(s)';
    
    if (uploadedVideosData.length === 0) {
        bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
    } else {
        bubblesContainer.innerHTML = ''; 
        uploadedVideosData.forEach(video => {
            createOrUpdateBubble(video.id, video); 
        });

        if (pendingTaskIds.length > 0) {
            const statusMessage = document.createElement('p');
            statusMessage.id = 'statusMessage';
            statusMessage.className = 'status-message';
            statusMessage.textContent = 'Checking status of your videos...';
            bubblesContainer.prepend(statusMessage); 
        } else {
             const statusMessage = document.createElement('p');
             statusMessage.id = 'statusMessage';
             statusMessage.className = 'status-message info';
             statusMessage.textContent = 'All tasks completed or processed.';
             bubblesContainer.prepend(statusMessage);
        }
    }

    uploadNewBtn.addEventListener('click', () => {
        localStorage.removeItem('uploadedVideos'); 
        localStorage.removeItem('hifeUsername'); 
        window.location.href = 'upload.html'; 
    });

    const CHECK_STATUS_INTERVAL_MS = 2000;
    // const taskBubbles = {}; // ЭТУ СТРОКУ УДАЛИЛИ ОТСЮДА!
    
    checkTaskStatuses(uploadedVideosData); 

    async function checkTaskStatuses(currentVideosData) {
        const tasksToKeepPolling = []; 
        const updatedVideosData = []; 

        if (currentVideosData.length === 0 && bubblesContainer.children.length <= 1) { 
            bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
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
                        updatedVideosData.push(video); 
                    } else {
                        updatedVideosData.push({ ...video, status: data.status, message: data.message, metadata: data.metadata, cloudinary_url: data.cloudinary_url, original_filename: video.original_filename });
                    }
                } else {
                    console.error(`[FRONTEND] Ошибка при получении статуса для задачи ${taskId}:`, data.message || response.statusText);
                    createOrUpdateBubble(taskId, { status: 'error', message: data.message || 'Failed to fetch status.', filename: video.original_filename || `Task ${taskId}` });
                    updatedVideosData.push({ ...video, status: 'error', message: data.message || 'Failed to fetch status.' });
                }
            } catch (error) {
                console.error(`[FRONTEND] Сетевая ошибка при проверке статуса для задачи ${taskId}:`, error);
                createOrUpdateBubble(taskId, { status: 'error', message: 'Network error or backend unreachable.', filename: video.original_filename || `Task ${taskId}` });
                updatedVideosData.push({ ...video, status: 'error', message: 'Network error or backend unreachable.' });
            }
        }
        
        localStorage.setItem('uploadedVideos', JSON.stringify(updatedVideosData)); 
        
        if (tasksToKeepPolling.length > 0) {
            setTimeout(() => checkTaskStatuses(updatedVideosData.filter(v => tasksToKeepPolling.includes(v.id))), CHECK_STATUS_INTERVAL_MS);
        } else {
            console.log("[FRONTEND] Все задачи завершены или произошла ошибка. Опрос остановлен.");
        }
    }

function createOrUpdateBubble(taskId, data) {
        let bubble = taskBubbles[taskId];
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'video-bubble loading';
            bubble.id = `bubble-${taskId}`;
            bubblesContainer.appendChild(bubble);
            taskBubbles[taskId] = bubble;

            const initialMessage = document.getElementById('statusMessage');
            if (initialMessage && initialMessage.textContent === 'Задач не найдено. Пожалуйста, загрузите видео со страницы загрузки.') {
                initialMessage.remove();
            }
        }

        // --- Изменения начинаются здесь ---
        // Заголовок (имя файла)
        // Оставляем только имя файла
        let filenameText = `<h3 class="bubble-title-overlay">${data.original_filename || `Задача ${taskId}`}</h3>`;
        let previewHtml = '';
        let statusMessageText = '';

        if (data.status === 'completed') {
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewHtml = `<img class="bubble-preview-img" src="${thumbnailUrl}" alt="Превью видео">`;
            // Заменяем "Обработано. Клик для деталей." на "Клик"
            statusMessageText = '<p class="status-message-bubble status-completed">Click</p>';
            bubble.classList.remove('loading');
        } else if (data.status === 'pending' || data.status === 'processing') {
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Видео в обработке">`;
            statusMessageText = '<p class="status-message-bubble status-pending">Видео в обработке...</p>';
            bubble.classList.add('loading');
        } else if (data.status === 'error' || data.status === 'failed') {
            previewHtml = `<img class="bubble-preview-img" src="assets/error_placeholder.png" alt="Ошибка обработки">`;
            statusMessageText = `<p class="status-message-bubble status-error">Ошибка: ${data.message || 'Неизвестная ошибка.'}</p>`;
            bubble.classList.remove('loading');
        } else {
            previewHtml = `<img class="bubble-preview-img" src="assets/placeholder.png" alt="Статус неизвестен">`;
            statusMessageText = '<p class="status-message-bubble status-info">Получение статуса...</p>';
            bubble.classList.add('loading');
        }

        // Теперь в innerHTML будет только превью, имя файла и статус
        bubble.innerHTML = `
            ${previewHtml}
            <div class="bubble-text-overlay">
                ${filenameText}
                ${statusMessageText}
            </div>
        `;
        // --- Изменения заканчиваются здесь ---

        if (data.status === 'completed' && data.metadata) {
            bubble.onclick = () => showMetadataModal(data.original_filename || `Задача ${taskId}`, data.metadata);
            bubble.style.cursor = 'pointer';
        } else {
            bubble.onclick = null;
            bubble.style.cursor = 'default';
        }
    }

    function showMetadataModal(filename, metadata) {
        modalTitle.textContent = `Метаданные для: ${filename}`;
        modalMetadata.textContent = JSON.stringify(metadata, null, 2); 
        metadataModal.style.display = 'flex'; 
    }

    closeButton.addEventListener('click', () => {
        metadataModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == metadataModal) {
            metadataModal.style.display = 'none';
        }
    });
});
