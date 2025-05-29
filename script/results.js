// results.js
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render

const resultsHeader = document.getElementById('resultsHeader');
const usernameDisplay = document.getElementById('usernameDisplay'); // Используется для приветствия и статуса
const uploadNewBtn = document.getElementById('uploadNewBtn');
const bubblesContainer = document.getElementById('bubblesContainer'); // Главный контейнер для бабблов
const metadataModal = document.getElementById('metadataModal');
const modalTitle = document.getElementById('modalTitle');
const modalMetadata = document.getElementById('modalMetadata');
const closeButton = document.querySelector('.close-button');

// Вспомогательная функция для форматирования метаданных
function formatMetadataForDisplay(metadata) {
    if (!metadata) return 'No metadata available yet.';

    const lines = [];

    lines.push(`File Name: ${metadata.format?.filename || 'N/A'}`);
    lines.push(`File Size: ${metadata.format?.size ? Math.round(metadata.format.size / 1024) + ' kB' : 'N/A'}`);
    lines.push(`Duration: ${metadata.format?.duration ? parseFloat(metadata.format.duration).toFixed(2) + ' seconds' : 'N/A'}`);
    lines.push(`Bit Rate: ${metadata.format?.bit_rate ? Math.round(metadata.format.bit_rate / 1000) + ' kb/s' : 'N/A'}`);
    lines.push(`Format Name: ${metadata.format?.format_name || 'N/A'}`);
    lines.push(`Start Time: ${metadata.format?.start_time || 'N/A'}`);
    lines.push(`Probe Score: ${metadata.format?.probe_score || 'N/A'}`);
    lines.push(`Tags:`);
    if (metadata.format?.tags && Object.keys(metadata.format.tags).length > 0) {
        for (const tag in metadata.format.tags) {
            lines.push(`  ${tag}: ${metadata.format.tags[tag]}`);
        }
    } else {
        lines.push(`  No format tags.`);
    }

    if (metadata.streams && metadata.streams.length > 0) {
        metadata.streams.forEach((stream, i) => {
            lines.push(`\n--- Stream #${i} ---`);
            lines.push(`Codec Name: ${stream.codec_name || 'N/A'}`);
            lines.push(`Codec Type: ${stream.codec_type || 'N/A'}`);
            if (stream.width && stream.height) {
                lines.push(`Resolution: ${stream.width}x${stream.height}`);
            }
            if (stream.avg_frame_rate) {
                lines.push(`Frame Rate: ${stream.avg_frame_rate}`);
            }
            if (stream.bit_rate) {
                lines.push(`Stream Bit Rate: ${Math.round(stream.bit_rate / 1000)} kb/s`);
            }
            lines.push(`Stream Tags:`);
            if (stream.tags && Object.keys(stream.tags).length > 0) {
                for (const tag in stream.tags) {
                    lines.push(`  ${tag}: ${stream.tags[tag]}`);
                }
            } else {
                lines.push(`  No stream tags.`);
            }
        });
    }

    if (metadata.gps && metadata.gps.length > 0) {
        lines.push("\n--- GPS Data ---");
        metadata.gps.forEach(gps => {
            lines.push(`GPS Tag: ${gps.tag}`);
            lines.push(`Location: ${gps.lat}, ${gps.lon}`);
            if (gps.address) lines.push(`Address: ${gps.address}`);
        });
    }

    return lines.join('\n');
}

document.addEventListener('DOMContentLoaded', () => {
    const username = sessionStorage.getItem('hifeUsername') || 'Guest';
    usernameDisplay.textContent = `For: @${username}`;

    let pendingTaskIds = JSON.parse(sessionStorage.getItem('pendingTaskIds') || '[]');

    resultsHeader.textContent = 'Your Video Analysis Results';
    
    // Начальное сообщение о статусе
    if (pendingTaskIds.length === 0) {
        bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No pending tasks found for this session. Please upload a video from the previous page.</p>';
    } else {
        bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message">Checking status of your videos...</p>';
    }

    uploadNewBtn.addEventListener('click', () => {
        sessionStorage.removeItem('pendingTaskIds'); // Очищаем ID задач при начале новой загрузки
        sessionStorage.removeItem('hifeUsername'); // Очищаем имя пользователя
        window.location.href = 'upload.html'; // Перенаправляем на страницу загрузки
    });

    const CHECK_STATUS_INTERVAL_MS = 2000; // Опрос каждые 2 секунды
    const taskBubbles = {}; // Объект для хранения ссылок на элементы "пузырей" по taskId

    // Функция для создания или обновления "пузыря" статуса задачи
    function createOrUpdateBubble(taskId, data) {
        let bubble = taskBubbles[taskId];
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'video-bubble loading'; // Добавляем класс loading для индикации
            bubble.id = `bubble-${taskId}`; 
            bubblesContainer.appendChild(bubble); 
            taskBubbles[taskId] = bubble; 
            
            // Удаляем начальное сообщение, как только появляется первый баббл
            const initialMessage = document.getElementById('statusMessage');
            if (initialMessage) {
                initialMessage.remove(); 
            }
        }

        let statusClass = `status-${data.status}`;
        let statusText = data.status.replace(/_/g, ' ');
        let previewHtml = ''; // Переменная для HTML превью
        let metadataBtnHtml = ''; // Переменная для кнопки метаданных
        let downloadLinkHtml = ''; // Переменная для ссылки на скачивание

        // Логика определения URL превью и кнопки "Show Details"
        if (data.status === 'completed') {
            if (data.previewUrl) { // Проверяем наличие previewUrl в ответе бэкенда
                previewHtml = `<img class="bubble-preview-img" src="${data.previewUrl}" alt="Превью видео">`;
            } else {
                previewHtml = `<img class="bubble-preview-img" src="assets/no_preview.png" alt="Превью недоступно">`; // Плейсхолдер
            }
            if (data.outputDriveId) {
                const downloadLink = `https://fake.googledrive.com/file/${data.outputDriveId}`; // Замените на реальную ссылку
                downloadLinkHtml = `<a href="${downloadLink}" target="_blank" class="download-link gold-button">Скачать видео</a>`;
            }
            if (data.metadata) {
                metadataBtnHtml = `<button class="show-details-btn gold-button" data-metadata='${JSON.stringify(data.metadata)}' data-filename="${data.inputFileName || 'Unknown File'}">Показать детали</button>`;
            }
            bubble.classList.remove('loading'); // Убираем индикатор загрузки
        } else if (data.status === 'pending' || data.status === 'processing') {
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Видео в обработке">`;
            bubble.classList.add('loading'); // Сохраняем индикатор загрузки
        } else if (data.status === 'error' || data.status === 'failed') {
            previewHtml = `<img class="bubble-preview-img" src="assets/error_placeholder.png" alt="Ошибка обработки">`;
            bubble.classList.remove('loading'); // Убираем индикатор загрузки
        } else {
            // Дефолтный плейсхолдер для неизвестных статусов
            previewHtml = `<img class="bubble-preview-img" src="assets/placeholder.png" alt="Статус неизвестен">`;
            bubble.classList.add('loading'); // Можно оставить, если ожидается дальнейшая обработка
        }

        // Обновляем содержимое "пузыря"
        bubble.innerHTML = `
            <h3>${data.inputFileName || `Task ${taskId}`}</h3>
            ${previewHtml}
            <p class="status-text">Статус: <span class="${statusClass}">${statusText}</span></p>
            <p class="message-text">Сообщение: ${data.message || 'Нет конкретного сообщения.'}</p>
            ${downloadLinkHtml}
            ${metadataBtnHtml}
        `;

        // Добавляем обработчик для кнопки "Show Details" (если она есть)
        const showDetailsBtn = bubble.querySelector('.show-details-btn');
        if (showDetailsBtn) {
            showDetailsBtn.addEventListener('click', (event) => {
                event.stopPropagation(); // Предотвращаем всплытие события
                const metadata = JSON.parse(showDetailsBtn.dataset.metadata);
                const filename = showDetailsBtn.dataset.filename;
                showMetadataModal(filename, metadata);
            });
        }
    }

    // Функция для периодической проверки статусов задач
    async function checkTaskStatuses() {
        if (pendingTaskIds.length === 0 && bubblesContainer.children.length <= 1) { // Учитываем, что statusMessage может быть дочерним
            bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No pending tasks found for this session. Please upload a video from the previous page.</p>';
            return;
        }

        const tasksToKeepPolling = []; // Задачи, которые еще не завершены

        for (const taskId of pendingTaskIds) {
            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
                const data = await response.json();

                if (response.ok) {
                    createOrUpdateBubble(taskId, data);
                    if (data.status !== 'completed' && data.status !== 'error' && data.status !== 'failed') {
                        tasksToKeepPolling.push(taskId); // Продолжаем опрос для этой задачи
                    }
                } else {
                    console.error(`[FRONTEND] Ошибка при получении статуса для задачи ${taskId}:`, data.message || response.statusText);
                    createOrUpdateBubble(taskId, { status: 'error', message: data.message || 'Failed to fetch status.', inputFileName: `Task ${taskId}` });
                }
            } catch (error) {
                console.error(`[FRONTEND] Сетевая ошибка при проверке статуса для задачи ${taskId}:`, error);
                createOrUpdateBubble(taskId, { status: 'error', message: 'Network error or backend unreachable.', inputFileName: `Task ${taskId}` });
            }
        }
        
        // Обновляем список задач для опроса
        pendingTaskIds = tasksToKeepPolling; 
        sessionStorage.setItem('pendingTaskIds', JSON.stringify(pendingTaskIds)); // Сохраняем обновленный список

        // Если есть еще незавершенные задачи, планируем следующий опрос
        if (pendingTaskIds.length > 0) {
            setTimeout(checkTaskStatuses, CHECK_STATUS_INTERVAL_MS);
        } else {
            console.log("[FRONTEND] Все задачи завершены или произошла ошибка. Опрос остановлен.");
            // Опционально: показать окончательное сообщение или кнопку "Upload New Video"
        }
    }

    // Функции для модального окна
    function showMetadataModal(filename, metadata) {
        modalTitle.textContent = `Metadata for ${filename}`;
        modalMetadata.textContent = formatMetadataForDisplay(metadata); // Используем pre-formatted текст
        metadataModal.style.display = 'block';
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
