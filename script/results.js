// script/results.js
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render

const resultsHeader = document.getElementById('resultsHeader');
const usernameDisplay = document.getElementById('usernameDisplay');
const uploadNewBtn = document.getElementById('uploadNewBtn');
const bubblesContainer = document.getElementById('bubblesContainer');
const metadataModal = document.getElementById('metadataModal');
const modalTitle = document.getElementById('modalTitle');
const modalMetadata = document.getElementById('modalMetadata');
const closeButton = document.querySelector('.close-button');

// НОВАЯ ФУНКЦИЯ: Вспомогательная функция для создания URL превью из URL видео Cloudinary
function getCloudinaryThumbnailUrl(videoUrl) {
    if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
        return 'assets/default_video_thumbnail.png'; // Заглушка, если это не Cloudinary URL
    }

    const parts = videoUrl.split('/upload/');
    if (parts.length < 2) {
        return 'assets/default_video_thumbnail.png';
    }

    const baseUrl = parts[0];
    // c_fill,w_200,h_150,g_auto,q_auto,f_jpg,so_auto
    // crop fill (c_fill), width 200, height 150, auto gravity (g_auto), auto quality (q_auto), format jpg, start offset auto
    const transformations = 'c_fill,w_200,h_150,g_auto,q_auto,f_jpg,so_auto/'; 

    let publicIdPath = parts[1];
    publicIdPath = publicIdPath.replace(/v\d+\//, ''); // Убираем версию (vXXXXXXXX/) если она есть
    
    // Убираем расширение видео и добавляем .jpg
    publicIdPath = publicIdPath.substring(0, publicIdPath.lastIndexOf('.')) + '.jpg';

    return `${baseUrl}/upload/${transformations}${publicIdPath}`;
}

// УДАЛЕНА: Функция formatMetadataForDisplay больше не нужна, так как мы будем отображать JSON.stringify
// function formatMetadataForDisplay(metadata) { ... }

document.addEventListener('DOMContentLoaded', () => {
    // Внимание: теперь мы получаем данные из localStorage, а не sessionStorage.
    // Убедитесь, что ваш upload_validation.js сохраняет данные в localStorage.
    const uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let pendingTaskIds = uploadedVideosData.map(video => video.id); // Получаем taskId (public_id) из сохраненных данных

    const username = localStorage.getItem('hifeUsername') || 'Guest'; // Или получите username из localStorage
    usernameDisplay.textContent = `For: @${username}`;

    resultsHeader.textContent = 'Your Video Analysis Results';
    
    if (pendingTaskIds.length === 0) {
        bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No pending tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
    } else {
        bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message">Checking status of your videos...</p>';
    }

    uploadNewBtn.addEventListener('click', () => {
        localStorage.removeItem('uploadedVideos'); // Очищаем данные при начале новой загрузки
        localStorage.removeItem('hifeUsername'); // Очищаем имя пользователя
        window.location.href = 'upload.html'; // Перенаправляем на страницу загрузки
    });

    const CHECK_STATUS_INTERVAL_MS = 2000;
    const taskBubbles = {};

    // Функция для создания или обновления "пузыря" статуса задачи
    function createOrUpdateBubble(taskId, data) {
        let bubble = taskBubbles[taskId];
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'video-bubble loading'; 
            bubble.id = `bubble-${taskId}`;
            bubblesContainer.appendChild(bubble);
            taskBubbles[taskId] = bubble;
            
            const initialMessage = document.getElementById('statusMessage');
            if (initialMessage) {
                initialMessage.remove();
            }
        }

        // Используем data.filename, который ваш сервер возвращает
        let filenameText = `<h3>${data.filename || `Task ${taskId}`}</h3>`; 
        let previewHtml = '';
        let statusMessageText = '';

        // Логика определения URL превью и статуса
        if (data.status === 'completed') {
            // Используем Cloudinary URL из data.cloudinary_url
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewHtml = `<img class="bubble-preview-img" src="${thumbnailUrl}" alt="Превью видео">`;
            statusMessageText = '<p class="status-message-bubble status-completed">Обработано. Клик для деталей.</p>';
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

        bubble.innerHTML = `
            ${filenameText}
            ${previewHtml}
            ${statusMessageText}
        `;

        // Добавляем обработчик для открытия модального окна по клику на весь баббл
        // Только если статус "completed" И есть метаданные (metadata)
        if (data.status === 'completed' && data.metadata) {
            bubble.onclick = () => showMetadataModal(data.filename, data.metadata); // Передаем оригинальное имя и полные метаданные
            bubble.style.cursor = 'pointer'; // Делаем курсор кликабельным
        } else {
            bubble.onclick = null; 
            bubble.style.cursor = 'default'; 
        }
    }

    async function checkTaskStatuses() {
        if (pendingTaskIds.length === 0 && bubblesContainer.children.length <= 1) {
            bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No pending tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
            return;
        }

        const tasksToKeepPolling = []; 

        for (const taskId of pendingTaskIds) {
            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
                const data = await response.json();

                if (response.ok) {
                    createOrUpdateBubble(taskId, data);
                    if (data.status !== 'completed' && data.status !== 'error' && data.status !== 'failed') {
                        tasksToKeepPolling.push(taskId); 
                    }
                } else {
                    console.error(`[FRONTEND] Ошибка при получении статуса для задачи ${taskId}:`, data.message || response.statusText);
                    createOrUpdateBubble(taskId, { status: 'error', message: data.message || 'Failed to fetch status.', filename: `Task ${taskId}` });
                }
            } catch (error) {
                console.error(`[FRONTEND] Сетевая ошибка при проверке статуса для задачи ${taskId}:`, error);
                createOrUpdateBubble(taskId, { status: 'error', message: 'Network error or backend unreachable.', filename: `Task ${taskId}` });
            }
        }
        
        // Обновляем список задач для опроса
        // Важно: если вы хотите сохранять историю для текущей сессии,
        // то `uploadedVideos` из `localStorage` должны быть пополнены,
        // а не просто `pendingTaskIds`. Но для текущей логики этого достаточно.
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideosData.filter(video => tasksToKeepPolling.includes(video.id)))); 
        pendingTaskIds = tasksToKeepPolling;

        if (pendingTaskIds.length > 0) {
            setTimeout(checkTaskStatuses, CHECK_STATUS_INTERVAL_MS);
        } else {
            console.log("[FRONTEND] Все задачи завершены или произошла ошибка. Опрос остановлен.");
            // Очищаем localStorage после того, как все задачи завершены и отображены
            localStorage.removeItem('uploadedVideos'); 
            localStorage.removeItem('hifeUsername'); 
        }
    }

    // Функции для модального окна
    function showMetadataModal(filename, metadata) {
        modalTitle.textContent = `Метаданные для: ${filename}`;
        // Теперь отображаем полные JSON-метаданные
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

    // Запускаем проверку статусов при загрузке страницы
    checkTaskStatuses();
});
