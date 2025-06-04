document.addEventListener('DOMContentLoaded', () => {
    // УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
    const backendUrl = "https://video-meta-api.onrender.com"; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

    // Получение элементов DOM
    const usernameDisplay = document.getElementById('usernameDisplay');
    const resultsHeader = document.getElementById('resultsHeader');
    const bubblesContainer = document.getElementById('bubblesContainer');
    const uploadNewBtn = document.getElementById('uploadNewBtn');
    const finishSessionBtn = document.getElementById('finishSessionBtn');
    const videoFileInput = document.getElementById('videoFileInput');
    const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const metadataModal = document.getElementById('metadataModal');
    const closeButton = document.querySelector('.modal-content .close-button');
    const modalTitle = document.getElementById('modalTitle');
    const modalMetadata = document.getElementById('modalMetadata');

    // ЭЛЕМЕНТЫ ДЛЯ КОНКАТЕНАЦИИ
    const connectVideosCheckbox = document.getElementById('connectVideosCheckbox');
    const concatenationStatusDiv = document.getElementById('concatenationStatusDiv');

    // Переменные для отслеживания состояния
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos')) || [];
    let pollingIntervals = {};
    const selectedVideoPublicIds = new Set();

    console.log("results.js: DOMContentLoaded - Начальная загрузка.");
    console.log("results.js: Загруженные видео из localStorage:", uploadedVideos);

    // Функция для обновления статуса конкатенации в UI
    function updateConcatenationStatus() {
        const count = selectedVideoPublicIds.size;
        console.log(`results.js: updateConcatenationStatus - Выбрано видео: ${count}`);
        if (connectVideosCheckbox.checked) {
            if (count < 2) {
                concatenationStatusDiv.textContent = 'Выберите как минимум 2 видео для объединения.';
                concatenationStatusDiv.className = 'concatenation-status info';
                concatenationStatusDiv.style.cursor = 'default'; // Не кликабельно
            } else {
                concatenationStatusDiv.textContent = `Выбрано видео: ${count}. Нажмите здесь для объединения.`; // Уточнено
                concatenationStatusDiv.className = 'concatenation-status pending';
                concatenationStatusDiv.style.cursor = 'pointer'; // Кликабельно
            }
        } else {
            selectedVideoPublicIds.clear();
            document.querySelectorAll('.media-bubble.selected').forEach(bubble => {
                bubble.classList.remove('selected');
            });
            concatenationStatusDiv.textContent = 'Выберите 2 или более видео для объединения.';
            concatenationStatusDiv.className = 'concatenation-status info';
            concatenationStatusDiv.style.cursor = 'default'; // Не кликабельно
        }
    }

    // Функция для переключения выбора видео
    function toggleVideoSelection(publicId, bubbleElement) {
        console.log(`results.js: toggleVideoSelection - publicId: ${publicId}`);
        if (!publicId) {
            console.warn('results.js: Попытка выбрать видео без publicId.');
            return;
        }

        if (connectVideosCheckbox.checked) {
            if (selectedVideoPublicIds.has(publicId)) {
                selectedVideoPublicIds.delete(publicId);
                bubbleElement.classList.remove('selected');
                console.log(`results.js: Видео ${publicId} снято с выбора.`);
            } else {
                selectedVideoPublicIds.add(publicId);
                bubbleElement.classList.add('selected');
                console.log(`results.js: Видео ${publicId} выбрано.`);
            }
            updateConcatenationStatus();
        } else {
            bubbleElement.classList.remove('selected');
            selectedVideoPublicIds.delete(publicId);
            updateConcatenationStatus();
            console.log('results.js: Конкатенация не включена, выбор запрещен.');
        }
    }

    // Функция: fetchAndDisplayVideos
    async function fetchAndDisplayVideos() {
        console.log("results.js: fetchAndDisplayVideos - Запуск.");
        const username = localStorage.getItem('hifeUsername') || 'Guest';
        usernameDisplay.textContent = `Пользователь: ${username}`;
        resultsHeader.textContent = `Ваши Видео (${username})`;
        bubblesContainer.innerHTML = ''; // Очистка перед отображением

        if (uploadedVideos.length === 0) {
            bubblesContainer.innerHTML = '<p class="status-message info">Видео не найдены. Загрузите видео на предыдущей странице.</p>';
            console.log("results.js: fetchAndDisplayVideos - Видео не найдены в localStorage.");
            return;
        }

        for (const videoData of uploadedVideos) {
            const taskId = videoData.taskId;
            console.log(`results.js: Обработка видео: ${taskId}`);
            
            if (!taskId) {
                console.warn('results.js: Пропуск записи видео из-за отсутствия taskId:', videoData);
                continue;
            }

            const originalFilename = videoData.originalFilename || 'video'; 
            const cloudinaryUrl = videoData.cloudinary_url; 
            let status = videoData.status || 'pending';
            let displayUrl = cloudinaryUrl;
            let metadata = videoData.metadata || {};

            console.log(`results.js: Исходные данные для ${taskId}: URL=${cloudinaryUrl}, Статус=${status}, Метаданные=${JSON.stringify(metadata)}`);

            // Запрашиваем актуальный статус с бэкенда
            if (status === 'uploaded' || status === 'pending' || status === 'processing' || status === 'completed') {
                try {
                    console.log(`results.js: Запрос статуса с бэкенда для ${taskId}...`);
                    const response = await fetch(`${backendUrl}/task-status/${taskId}`); 
                    const data = await response.json();
                    if (response.ok) {
                        status = data.status;
                        displayUrl = data.cloudinary_url || displayUrl;
                        metadata = data.metadata || metadata;
                        if (data.originalFilename) {
                            videoData.originalFilename = data.originalFilename;
                        }
                        console.log(`results.js: Статус для ${taskId} обновлен: ${status}, URL=${displayUrl}, Метаданные=${JSON.stringify(metadata)}`);
                    } else {
                        console.error(`results.js: Ошибка получения статуса для ${taskId}:`, data.error);
                        status = 'error';
                    }
                } catch (error) {
                    console.error(`results.js: Сетевая ошибка при получении статуса для ${taskId}:`, error);
                    status = 'error';
                }
            }

            // Обновляем uploadedVideos в localStorage с актуальными данными
            const index = uploadedVideos.findIndex(v => v.taskId === taskId);
            if (index !== -1) {
                uploadedVideos[index] = { 
                    ...uploadedVideos[index], 
                    status, 
                    cloudinary_url: displayUrl, 
                    metadata: metadata, 
                    originalFilename: videoData.originalFilename 
                }; 
            }
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

            const bubble = document.createElement('div');
            bubble.className = 'media-bubble';
            bubble.dataset.taskId = taskId;
            bubble.dataset.publicId = taskId;

            let statusClass = '';
            let statusText = '';
            let thumbnailUrl = '';
            let videoElementHTML = '';

            if (status === 'uploaded') {
                statusClass = 'status-info';
                statusText = 'Загружено, ожидает обработки';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
            } else if (status === 'processing') {
                statusClass = 'status-pending';
                statusText = 'В процессе анализа...';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                startPolling(taskId);
            } else if (status === 'completed') {
                statusClass = 'status-completed';
                statusText = 'Анализ завершен!';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            } else if (status === 'error') {
                statusClass = 'status-error';
                statusText = 'Ошибка анализа';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            } else if (status === 'concatenated') {
                statusClass = 'status-completed';
                statusText = 'Видео объединено!';
                if (displayUrl) {
                     thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                     videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            }
            else {
                statusClass = 'status-info';
                statusText = 'Статус неизвестен';
            }

            console.log(`results.js: Для ${taskId} - videoElementHTML: ${videoElementHTML ? 'сгенерирован' : 'пустой'}`);
            console.log(`results.js: Для ${taskId} - thumbnailUrl: ${thumbnailUrl}`);

            bubble.innerHTML = `
                <div class="video-thumbnail">
                    ${videoElementHTML ? videoElementHTML : `<img src="${thumbnailUrl || 'assets/placeholder.png'}" alt="Video Thumbnail">`}
                </div>
                <div class="video-info">
                    <p class="file-name" title="${originalFilename}">${originalFilename}</p>
                    <p class="status ${statusClass}">${statusText}</p>
                    <button class="view-metadata-btn gold-button" data-task-id="${taskId}" ${Object.keys(metadata).length === 0 ? 'disabled' : ''}>Метаданные</button>
                </div>
            `;
            bubblesContainer.appendChild(bubble);

            // Обработчик для кнопки метаданных
            const viewMetadataBtn = bubble.querySelector('.view-metadata-btn');
            if (viewMetadataBtn) {
                viewMetadataBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    displayMetadata(taskId, metadata);
                    console.log(`results.js: Клик по кнопке Метаданные для ${taskId}`);
                });
            }

            // Добавляем обработчик клика на весь бабл для выбора
            if (status === 'completed' || status === 'concatenated') {
                bubble.addEventListener('click', () => {
                    toggleVideoSelection(taskId, bubble);
                    console.log(`results.js: Клик по баблу для выбора: ${taskId}`);
                });
            } else {
                console.log(`results.js: Видео ${taskId} не в статусе 'completed' или 'concatenated', выбор по клику отключен.`);
            }

            // Восстанавливаем состояние выбора при перезагрузке страницы
            if (selectedVideoPublicIds.has(taskId)) {
                bubble.classList.add('selected');
                console.log(`results.js: Видео ${taskId} восстановлено как выбранное.`);
            }
        }
        updateConcatenationStatus();
        console.log("results.js: fetchAndDisplayVideos - Завершено.");
    }

    // Существующая функция: startPolling
    function startPolling(taskId) {
        if (!pollingIntervals[taskId]) {
            pollingIntervals[taskId] = setInterval(async () => {
                try {
                    console.log(`results.js: Опрос статуса для ${taskId}...`);
                    const response = await fetch(`${backendUrl}/task-status/${taskId}`); 
                    const data = await response.json();
                    if (response.ok) {
                        const task = uploadedVideos.find(v => v.taskId === taskId);
                        if (task && task.status !== data.status) {
                            console.log(`results.js: Статус задачи ${taskId} изменен на: ${data.status}`);
                            await fetchAndDisplayVideos();
                            if (data.status === 'completed' || data.status === 'error' || data.status === 'concatenated') {
                                stopPolling(taskId);
                            }
                        } else if (task && task.status === data.status) {
                            console.log(`results.js: Статус задачи ${taskId} не изменился: ${data.status}`);
                        }
                    } else {
                        console.error(`results.js: Ошибка опроса для ${taskId}:`, data.error);
                        stopPolling(taskId);
                        await fetchAndDisplayVideos();
                    }
                } catch (error) {
                    console.error(`results.js: Сетевая ошибка опроса для ${taskId}:`, error);
                    stopPolling(taskId);
                    await fetchAndDisplayVideos();
                }
            }, 5000);
        }
    }

    // Существующая функция: stopPolling
    function stopPolling(taskId) {
        if (pollingIntervals[taskId]) {
            clearInterval(pollingIntervals[taskId]);
            delete pollingIntervals[taskId];
            console.log(`results.js: Опрос для задачи ${taskId} остановлен`);
        }
    }

    // Существующая функция: displayMetadata
    function displayMetadata(taskId, metadata) {
        modalTitle.textContent = `Метаданные видео ${taskId}`;
        modalMetadata.textContent = JSON.stringify(metadata, null, 2);
        metadataModal.style.display = 'block';
    }

    // Существующая функция: close modal
    closeButton.addEventListener('click', () => {
        metadataModal.style.display = 'none';
    });

    // Существующая функция: close modal on outside click
    window.addEventListener('click', (event) => {
        if (event.target === metadataModal) {
            metadataModal.style.display = 'none';
        }
    });

    // Существующая функция: uploadVideoFromResults
    uploadNewBtn.addEventListener('click', () => {
        videoFileInput.click();
    });

    videoFileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (files.length === 0) {
            uploadStatusText.textContent = 'Выберите видео для загрузки.';
            uploadStatusText.className = 'status-message info';
            dynamicUploadStatusContainer.classList.remove('hidden');
            return;
        }

        dynamicUploadStatusContainer.classList.remove('hidden');
        uploadStatusText.textContent = `Начинается загрузка ${files.length} видео...`;
        uploadStatusText.className = 'status-message info';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        document.querySelector('.progress-bar-container').style.display = 'block';

        const totalFiles = files.length;
        let uploadedCount = 0;

        for (const file of files) {
            const formData = new FormData();
            formData.append('video', file);
            formData.append('instagram_username', localStorage.getItem('hifeUsername') || 'unknown');
            formData.append('email', localStorage.getItem('hifeEmail') || 'unknown@example.com');
            formData.append('linkedin_profile', localStorage.getItem('hifeLinkedin') || 'N/A');

            try {
                uploadStatusText.textContent = `Загрузка: ${file.name}`;
                const response = await fetch(`${backendUrl}/upload_video`, { 
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    uploadedCount++;
                    const progress = Math.round((uploadedCount / totalFiles) * 100);
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `${progress}%`;
                    uploadStatusText.textContent = `Успешно загружено: ${file.name}. Ожидание обработки...`;
                    uploadStatusText.className = 'status-message info';

                    const existingVideoIndex = uploadedVideos.findIndex(v => v.taskId === data.taskId);
                    if (existingVideoIndex === -1) {
                           uploadedVideos.push({
                                taskId: data.taskId,
                                originalFilename: data.originalFilename || file.name, 
                                status: 'completed', 
                                cloudinary_url: data.cloudinary_url,
                                metadata: data.metadata || {} 
                            });
                    } else {
                        uploadedVideos[existingVideoIndex] = {
                            ...uploadedVideos[existingVideoIndex],
                            status: 'completed', 
                            cloudinary_url: data.cloudinary_url,
                            originalFilename: data.originalFilename || file.name, 
                            metadata: data.metadata || {}
                        };
                    }
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                    await fetchAndDisplayVideos();
                    startPolling(data.taskId);
                } else {
                    uploadStatusText.textContent = `Ошибка загрузки ${file.name}: ${data.error || 'Неизвестная ошибка'}`;
                    uploadStatusText.className = 'status-message error';
                    console.error('Ошибка загрузки:', data);
                }
            } catch (error) {
                uploadStatusText.textContent = `Сетевая ошибка при загрузке ${file.name}: ${error.message}`;
                uploadStatusText.className = 'status-message error';
                console.error('Сетевая ошибка при загрузке:', error);
            }
        }
        setTimeout(() => {
            document.querySelector('.progress-bar-container').style.display = 'none';
            uploadStatusText.textContent = 'Готов к загрузке нового видео.';
            uploadStatusText.className = 'status-message info';
        }, 3000);
    });

    // Существующая функция: finishSessionBtn
    finishSessionBtn.addEventListener('click', () => {
        window.location.replace('finish.html');
    });

    // НОВОЕ: Функция для запуска конкатенации
    async function initiateConcatenation() {
        const count = selectedVideoPublicIds.size;
        if (count < 2) {
            console.warn('results.js: Недостаточно видео для объединения.');
            concatenationStatusDiv.textContent = 'Выберите как минимум 2 видео для объединения.';
            concatenationStatusDiv.className = 'concatenation-status info';
            return;
        }

        const orderedPublicIds = Array.from(bubblesContainer.children)
            .filter(bubble => bubble.classList.contains('selected'))
            .map(bubble => bubble.dataset.publicId)
            .filter(id => selectedVideoPublicIds.has(id));

        console.log('results.js: Попытка объединить видео с public_ids (в порядке):', orderedPublicIds);
        concatenationStatusDiv.textContent = 'Начинаем объединение видео... Это может занять некоторое время.';
        concatenationStatusDiv.className = 'concatenation-status pending';
        concatenationStatusDiv.style.cursor = 'default'; // Отключаем клик во время обработки

        try {
            const response = await fetch(`${backendUrl}/concatenate_videos`, { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ public_ids: orderedPublicIds })
            });

            const data = await response.json();

            if (response.ok) {
                concatenationStatusDiv.textContent = 'Видео успешно объединены!';
                concatenationStatusDiv.className = 'concatenation-status completed';
                console.log('results.js: Объединение успешно:', data);

                const newConcatenatedVideo = {
                    taskId: data.new_public_id,
                    originalFilename: `concatenated_video_${data.new_public_id.substring(0, 8)}.mp4`,
                    status: 'concatenated',
                    cloudinary_url: data.new_video_url,
                    metadata: {
                        description: "Это видео было объединено из нескольких видео."
                    }
                };
                uploadedVideos.push(newConcatenatedVideo);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                await fetchAndDisplayVideos();

                window.location.replace(`finish.html?videoUrl=${encodeURIComponent(data.new_video_url)}`);

            } else {
                concatenationStatusDiv.textContent = `Ошибка объединения: ${data.error || 'Неизвестная ошибка'}`;
                concatenationStatusDiv.className = 'concatenation-status error';
                console.error('results.js: Ошибка объединения:', data);
                connectVideosCheckbox.checked = false; 
                updateConcatenationStatus(); 
            }
        } catch (error) {
            concatenationStatusDiv.textContent = `Сетевая ошибка при объединении: ${error.message}`;
            console.error('results.js: Сетевая ошибка при объединении:', error);
            connectVideosCheckbox.checked = false; 
            updateConcatenationStatus(); 
        }
    }


    // Обработчик для чекбокса "Объединить видео"
    connectVideosCheckbox.addEventListener('change', () => {
        console.log('results.js: connectVideosCheckbox changed. Checked:', connectVideosCheckbox.checked);
        updateConcatenationStatus(); // Обновляем статус при изменении чекбокса
    });

    // НОВОЕ: Обработчик клика по тексту статуса конкатенации
    concatenationStatusDiv.addEventListener('click', () => {
        console.log('results.js: Клик по тексту статуса конкатенации. Проверка условий...'); // Добавлен лог
        if (connectVideosCheckbox.checked && selectedVideoPublicIds.size >= 2) {
            console.log('results.js: Условия для конкатенации выполнены. Запуск initiateConcatenation().'); // Добавлен лог
            initiateConcatenation(); // Запускаем конкатенацию
        } else {
            console.log('results.js: Условия для конкатенации не выполнены (чекбокс не выбран или < 2 видео).');
        }
    });


    // Инициализация при загрузке страницы
    fetchAndDisplayVideos();
    updateConcatenationStatus(); 
});
