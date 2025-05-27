// results.js
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render

const resultsHeader = document.getElementById('resultsHeader');
const usernameDisplay = document.getElementById('usernameDisplay');
const uploadNewBtn = document.getElementById('uploadNewBtn');
const bubblesContainer = document.getElementById('bubblesContainer');
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
    
    if (pendingTaskIds.length === 0) {
        bubblesContainer.innerHTML = '<p id="statusMessage">No pending tasks found for this session. Please upload a video from the previous page.</p>';
    } else {
        bubblesContainer.innerHTML = '<p id="statusMessage">Checking status of your videos...</p>';
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
            bubble.className = 'video-bubble'; // Используем video-bubble
            bubble.id = `bubble-${taskId}`; 
            bubblesContainer.appendChild(bubble); 
            taskBubbles[taskId] = bubble; 
            
            const initialMessage = document.getElementById('statusMessage');
            if (initialMessage && bubblesContainer.children.length > 1) { // Если есть сообщение и добавлен первый пузырь
                initialMessage.remove(); // Удаляем начальное сообщение
            }
        }

        // Обновляем содержимое "пузыря"
        let content = `<span class="bubble-text">${data.inputFileName || 'Unknown File'}</span><br>`;
        content += `<strong>Status:</strong> <span class="status-${data.status}">${data.status.replace(/_/g, ' ')}</span><br>`;
        content += `<strong>Message:</strong> ${data.message || 'No specific message.'}<br>`;

        if (data.status === 'completed' && data.outputDriveId) {
            const fakeLink = `https://fake.googledrive.com/file/${data.outputDriveId}`;
            content += `<br><a href="${fakeLink}" target="_blank" class="download-link">Download processed video (Fake)</a>`;
            if (data.metadata) { // Если метаданные доступны
                // Сохраняем метаданные в data-атрибуте кнопки
                content += `<button class="show-details-btn gold-button" data-metadata='${JSON.stringify(data.metadata)}' data-filename="${data.inputFileName}">Show Details</button>`;
            }
        }

        bubble.innerHTML = content;

        // Добавляем обработчик для кнопки "Show Details"
        const showDetailsBtn = bubble.querySelector('.show-details-btn');
        if (showDetailsBtn) {
            showDetailsBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const metadata = JSON.parse(showDetailsBtn.dataset.metadata);
                const filename = showDetailsBtn.dataset.filename;
                showMetadataModal(filename, metadata);
            });
        }
    }

    // Функция для периодической проверки статусов задач
    async function checkTaskStatuses() {
        if (pendingTaskIds.length === 0) {
            bubblesContainer.innerHTML = '<p id="statusMessage">No pending tasks found for this session. Please upload a video from the previous page.</p>';
            return;
        }

        const tasksToKeepPolling = []; // Задачи, которые еще не завершены

        for (const taskId of pendingTaskIds) {
            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
                const data = await response.json();

                if (response.ok) {
                    createOrUpdateBubble(taskId, data);
                    if (data.status !== 'completed' && data.status !== 'error') {
                        tasksToKeepPolling.push(taskId); // Продолжаем опрос для этой задачи
                    }
                } else {
                    console.error(`[FRONTEND] Ошибка при получении статуса для задачи ${taskId}:`, data.message);
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
        modalMetadata.textContent = formatMetadataForDisplay(metadata);
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
