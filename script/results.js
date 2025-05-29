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

document.addEventListener('DOMContentLoaded', () => {
    // Получаем все сохраненные видео, включая те, что уже завершены
    const uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    
    // Определяем, какие задачи все еще нужно опрашивать (pending, processing)
    let pendingTaskIds = uploadedVideosData
        .filter(video => video.status !== 'completed' && video.status !== 'error' && video.status !== 'failed')
        .map(video => video.id);

    const username = localStorage.getItem('hifeUsername') || 'Guest'; 
    usernameDisplay.textContent = `For: @${username}`;

    resultsHeader.textContent = 'Your Video Analysis Results';
    
    // Изначально отображаем все сохраненные бабблы
    if (uploadedVideosData.length === 0) {
        bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
    } else {
        // Создаем бабблы для всех ранее загруженных видео, чтобы они сразу отобразились
        bubblesContainer.innerHTML = ''; // Очищаем начальное сообщение
        uploadedVideosData.forEach(video => {
            createOrUpdateBubble(video.id, video); // Создаем бабблы со статусом, который уже известен
        });
        // Если есть задачи для опроса, показываем сообщение "Checking status..."
        if (pendingTaskIds.length > 0) {
            const statusMessage = document.createElement('p');
            statusMessage.id = 'statusMessage';
            statusMessage.className = 'status-message';
            statusMessage.textContent = 'Checking status of your videos...';
            bubblesContainer.prepend(statusMessage); // Добавляем в начало
        } else {
            // Если все задачи уже завершены, но мы что-то отображаем
             const statusMessage = document.createElement('p');
             statusMessage.id = 'statusMessage';
             statusMessage.className = 'status-message info';
             statusMessage.textContent = 'All tasks completed or processed.';
             bubblesContainer.prepend(statusMessage);
        }
    }

    uploadNewBtn.addEventListener('click', () => {
        localStorage.removeItem('uploadedVideos'); // Очищаем данные при начале новой загрузки
        localStorage.removeItem('hifeUsername'); // Очищаем имя пользователя
        window.location.href = 'upload.html'; // Перенаправляем на страницу загрузки
    });

    const CHECK_STATUS_INTERVAL_MS = 2000;
    const taskBubbles = {}; // Эта карта уже используется для DOM-элементов
    
    // Передаем uploadedVideosData в checkTaskStatuses, чтобы она могла оперировать со всем списком
    checkTaskStatuses(uploadedVideosData); 

    async function checkTaskStatuses(currentVideosData) {
        const tasksToKeepPolling = []; // Задачи, которые будут продолжать опрашиваться
        const updatedVideosData = []; // Новый полный список видео для сохранения в localStorage

        if (currentVideosData.length === 0 && bubblesContainer.children.length <= 1) { 
            bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
            return;
        }

        // Проходимся по всем видео, которые у нас есть (изначально загруженные + те, что уже есть в localStorage)
        for (const video of currentVideosData) {
            const taskId = video.id;
            // Если задача уже завершена или с ошибкой, мы ее не опрашиваем, но сохраняем в updatedVideosData
            if (video.status === 'completed' || video.status === 'error' || video.status === 'failed') {
                updatedVideosData.push(video);
                createOrUpdateBubble(taskId, video); // Убеждаемся, что баббл отображается корректно
                continue; // Переходим к следующему видео, если оно уже завершено
            }

            // Если задача pending/processing, опрашиваем
            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
                const data = await response.json();

                if (response.ok) {
                    createOrUpdateBubble(taskId, data);
                    if (data.status !== 'completed' && data.status !== 'error' && data.status !== 'failed') {
                        tasksToKeepPolling.push(taskId);
                        updatedVideosData.push(video); // Задача все еще в обработке, сохраняем ее как есть
                    } else {
                        // Задача только что завершилась или выдала ошибку
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
        
        // Сохраняем полный обновленный список видео (включая завершенные)
        localStorage.setItem('uploadedVideos', JSON.stringify(updatedVideosData)); 
        
        // Если еще есть задачи для опроса, продолжаем
        if (tasksToKeepPolling.length > 0) {
            setTimeout(() => checkTaskStatuses(updatedVideosData.filter(v => tasksToKeepPolling.includes(v.id))), CHECK_STATUS_INTERVAL_MS);
            // При следующем вызове передаем только те видео, которые мы опрашиваем
        } else {
            console.log("[FRONTEND] Все задачи завершены или произошла ошибка. Опрос остановлен.");
            // Здесь мы НЕ очищаем localStorage, так как completed/error задачи должны оставаться видимыми
        }
    }

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
            if (initialMessage && initialMessage.textContent === 'No tasks found. Please upload a video from the upload page.') {
                initialMessage.remove(); // Удаляем сообщение "No tasks found"
            }
        }

        let filenameText = `<h3>${data.original_filename || `Task ${taskId}`}</h3>`; // Используем original_filename
        let previewHtml = '';
        let statusMessageText = '';

        // Логика определения URL превью и статуса
        if (data.status === 'completed') {
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
            bubble.onclick = () => showMetadataModal(data.original_filename || `Task ${taskId}`, data.metadata); // Передаем оригинальное имя и полные метаданные
            bubble.style.cursor = 'pointer'; // Делаем курсор кликабельным
        } else {
            bubble.onclick = null; 
            bubble.style.cursor = 'default'; 
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
    // checkTaskStatuses(); // Теперь вызывается один раз в начале с uploadedVideosData
});
