document.addEventListener('DOMContentLoaded', () => {
    // УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
    // ЭТО ОЧЕНЬ ВАЖНОЕ ИЗМЕНЕНИЕ!
    const backendUrl = "https://video-meta-api.onrender.com"; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

    // Получение элементов DOM (существующие и НОВЫЕ)
    const usernameDisplay = document.getElementById('usernameDisplay');
    const resultsHeader = document.getElementById('resultsHeader');
    const bubblesContainer = document.getElementById('bubblesContainer');
    const uploadNewBtn = document.getElementById('uploadNewBtn');
    const finishSessionBtn = document.getElementById('finishSessionBtn');
    const videoFileInput = document.getElementById('videoFileInput'); // Для новой загрузки из results.html
    const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const metadataModal = document.getElementById('metadataModal');
    const closeButton = document.querySelector('.modal-content .close-button');
    const modalTitle = document.getElementById('modalTitle');
    const modalMetadata = document.getElementById('modalMetadata');

    // НОВЫЕ ЭЛЕМЕНТЫ ДЛЯ КОНКАТЕНАЦИИ
    const connectVideosCheckbox = document.getElementById('connectVideosCheckbox');
    const concatenationStatusDiv = document.getElementById('concatenationStatusDiv');

    // Переменные для отслеживания состояния
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos')) || [];
    let pollingIntervals = {}; // Для отслеживания интервалов опроса статуса
    const selectedVideoPublicIds = new Set(); // NEW: Для отслеживания выбранных видео для конкатенации

    // НОВЫЙ: Функция для обновления статуса конкатенации в UI
    function updateConcatenationStatus() {
        const count = selectedVideoPublicIds.size;
        if (connectVideosCheckbox.checked) {
            if (count < 2) {
                concatenationStatusDiv.textContent = 'Выберите как минимум 2 видео для объединения.';
                concatenationStatusDiv.className = 'concatenation-status info';
            } else {
                concatenationStatusDiv.textContent = `Выбрано видео: ${count}. Нажмите для объединения.`;
                concatenationStatusDiv.className = 'concatenation-status pending'; // Можно изменить на 'info' если не начат процесс
            }
        } else {
            selectedVideoPublicIds.clear(); // Очищаем выбор при снятии галочки
            // Удаляем все классы 'selected'
            document.querySelectorAll('.media-bubble.selected').forEach(bubble => {
                bubble.classList.remove('selected');
                const checkbox = bubble.querySelector('.video-selection-checkbox');
                if (checkbox) checkbox.checked = false;
            });
            concatenationStatusDiv.textContent = 'Выберите 2 или более видео для объединения.';
            concatenationStatusDiv.className = 'concatenation-status info';
        }
    }

    // НОВЫЙ: Функция для переключения выбора видео
    function toggleVideoSelection(publicId, bubbleElement, checkboxElement) {
        if (!publicId) {
            console.warn('Attempted to select a video without a publicId.');
            checkboxElement.checked = false; // Снимаем выбор, если publicId нет
            return;
        }

        if (connectVideosCheckbox.checked) {
            if (selectedVideoPublicIds.has(publicId)) {
                selectedVideoPublicIds.delete(publicId);
                bubbleElement.classList.remove('selected');
                checkboxElement.checked = false;
            } else {
                selectedVideoPublicIds.add(publicId);
                bubbleElement.classList.add('selected');
                checkboxElement.checked = true;
            }
            updateConcatenationStatus();
        } else {
            // Если чекбокс "Объединить" неактивен, запрещаем выбор
            // Включаем этот блок, чтобы предотвратить выбор, если галочка снята
            checkboxElement.checked = false;
            bubbleElement.classList.remove('selected');
            selectedVideoPublicIds.delete(publicId); // На всякий случай
            updateConcatenationStatus();
        }
    }

    // Существующая функция: fetchAndDisplayVideos, теперь с добавлением чекбоксов и public_id
    async function fetchAndDisplayVideos() {
        const username = localStorage.getItem('hifeUsername') || 'Guest';
        usernameDisplay.textContent = `Пользователь: ${username}`;
        resultsHeader.textContent = `Ваши Видео (${username})`;
        bubblesContainer.innerHTML = ''; // Очистка перед отображением

        if (uploadedVideos.length === 0) {
            bubblesContainer.innerHTML = '<p class="status-message info">Видео не найдены. Загрузите видео на предыдущей странице.</p>';
            return;
        }

        for (const videoData of uploadedVideos) {
            const taskId = videoData.taskId;
            // НАЧАЛО ИСПРАВЛЕНИЯ: Защитная проверка на наличие taskId
            if (!taskId) {
                console.warn('Skipping video entry due to missing taskId:', videoData);
                continue; // Пропускаем эту запись и переходим к следующей
            }
            // КОНЕЦ ИСПРАВЛЕНИЯ

            const originalFilename = videoData.originalFilename || 'video';
            const cloudinaryUrl = videoData.cloudinary_url; // Получаем URL из localStorage

            let status = videoData.status || 'pending'; // По умолчанию 'pending' если нет статуса
            let displayUrl = cloudinaryUrl;
            let metadata = videoData.metadata || {}; // Сохраняем метаданные

            // Запрашиваем актуальный статус с бэкенда
            if (status === 'uploaded' || status === 'pending' || status === 'processing') {
                try {
                    // ИСПРАВЛЕНО: Явное указание backendUrl для всех запросов
                    const response = await fetch(`${backendUrl}/task-status/${taskId}`); 
                    const data = await response.json();
                    if (response.ok) {
                        status = data.status;
                        displayUrl = data.cloudinary_url || displayUrl; // Обновляем URL, если пришел новый
                        metadata = data.metadata || metadata;
                        // Обновляем public_id в localStorage, если он есть
                        if (data.public_id && videoData.taskId !== data.public_id) {
                             // Это может быть проблемой, если taskId и public_id должны быть строго равны.
                             // В текущей логике они должны быть равны. Но если вдруг backend изменил,
                             // то нужно обновить. Пока оставляем как есть.
                        }
                    } else {
                        console.error(`Error fetching status for ${taskId}:`, data.error);
                        status = 'error';
                    }
                } catch (error) {
                    console.error(`Network error fetching status for ${taskId}:`, error);
                    status = 'error';
                }
            }

            // Обновляем uploadedVideos в localStorage с актуальными данными
            const index = uploadedVideos.findIndex(v => v.taskId === taskId);
            if (index !== -1) {
                uploadedVideos[index] = { ...uploadedVideos[index], status, cloudinary_url: displayUrl, metadata: metadata };
            }
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));


            const bubble = document.createElement('div');
            bubble.className = 'media-bubble';
            bubble.dataset.taskId = taskId;
            bubble.dataset.publicId = taskId; // Добавляем public_id для конкатенации

            let statusClass = '';
            let statusText = '';
            let thumbnailUrl = ''; // Для видео
            let videoElementHTML = ''; // Для видео

            if (status === 'uploaded') {
                statusClass = 'status-info';
                statusText = 'Загружено, ожидает обработки';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD"; // Cloudinary thumb
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
            } else if (status === 'processing') {
                statusClass = 'status-pending';
                statusText = 'В процессе анализа...';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                startPolling(taskId); // Запускаем опрос только для 'processing'
            } else if (status === 'completed') {
                statusClass = 'status-completed';
                statusText = 'Анализ завершен!';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            } else if (status === 'error') {
                statusClass = 'status-error';
                statusText = 'Ошибка анализа';
                if (displayUrl) { // Попытка отобразить, если URL есть даже при ошибке
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            } else if (status === 'concatenated') { // НОВЫЙ СТАТУС
                statusClass = 'status-completed';
                statusText = 'Видео объединено!';
                if (displayUrl) {
                     thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                     videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            }
            else {
                statusClass = 'status-info';
                statusText = 'Статус неизвестен';
            }

            // НОВЫЙ: Добавляем чекбокс для выбора видео
            const checkboxHTML = `
                <input type="checkbox" class="video-selection-checkbox" data-public-id="${taskId}" ${status === 'completed' || status === 'concatenated' ? '' : 'disabled'}>
            `;
            // Важно: public_id в data-public-id должен соответствовать taskId
            // Отключаем чекбокс, если видео не обработано или есть ошибка

            bubble.innerHTML = `
                <div class="video-thumbnail">
                    ${videoElementHTML ? videoElementHTML : `<img src="${thumbnailUrl || 'assets/placeholder.png'}" alt="Video Thumbnail">`}
                    ${checkboxHTML}
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
                viewMetadataBtn.addEventListener('click', () => {
                    displayMetadata(taskId, metadata);
                });
            }

            // НОВЫЙ: Обработчик для чекбокса выбора видео
            const videoSelectionCheckbox = bubble.querySelector('.video-selection-checkbox');
            if (videoSelectionCheckbox) {
                videoSelectionCheckbox.addEventListener('change', () => {
                    toggleVideoSelection(taskId, bubble, videoSelectionCheckbox);
                });
                // Восстанавливаем состояние выбора при перезагрузке страницы
                if (selectedVideoPublicIds.has(taskId)) {
                    videoSelectionCheckbox.checked = true;
                    bubble.classList.add('selected');
                }
            }
        }
        updateConcatenationStatus(); // Обновляем статус после загрузки всех видео
    }

    // Существующая функция: startPolling (без изменений)
    function startPolling(taskId) {
        if (!pollingIntervals[taskId]) {
            pollingIntervals[taskId] = setInterval(async () => {
                try {
                    // ИСПРАВЛЕНО: Явное указание backendUrl
                    const response = await fetch(`${backendUrl}/task-status/${taskId}`); 
                    const data = await response.json();
                    if (response.ok) {
                        const task = uploadedVideos.find(v => v.taskId === taskId);
                        if (task && task.status !== data.status) {
                            console.log(`Task ${taskId} status changed to: ${data.status}`);
                            await fetchAndDisplayVideos(); // Перерисовать все видео
                            if (data.status === 'completed' || data.status === 'error' || data.status === 'concatenated') {
                                stopPolling(taskId);
                            }
                        }
                    } else {
                        console.error(`Polling error for ${taskId}:`, data.error);
                        stopPolling(taskId);
                        await fetchAndDisplayVideos();
                    }
                } catch (error) {
                    console.error(`Polling network error for ${taskId}:`, error);
                    stopPolling(taskId);
                    await fetchAndDisplayVideos();
                }
            }, 5000); // Опрос каждые 5 секунд
        }
    }

    // Существующая функция: stopPolling (без изменений)
    function stopPolling(taskId) {
        if (pollingIntervals[taskId]) {
            clearInterval(pollingIntervals[taskId]);
            delete pollingIntervals[taskId];
            console.log(`Stopped polling for task ${taskId}`);
        }
    }

    // Существующая функция: displayMetadata (без изменений)
    function displayMetadata(taskId, metadata) {
        modalTitle.textContent = `Метаданные видео ${taskId}`;
        modalMetadata.textContent = JSON.stringify(metadata, null, 2);
        metadataModal.style.display = 'block';
    }

    // Существующая функция: close modal (без изменений)
    closeButton.addEventListener('click', () => {
        metadataModal.style.display = 'none';
    });

    // Существующая функция: close modal on outside click (без изменений)
    window.addEventListener('click', (event) => {
        if (event.target === metadataModal) {
            metadataModal.style.display = 'none';
        }
    });

    // Существующая функция: uploadVideoFromResults (теперь с использованием FormData)
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
                // ИСПРАВЛЕНО: Явное указание backendUrl
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

                    // Добавляем новое видео в localStorage, если его там нет
                    const existingVideoIndex = uploadedVideos.findIndex(v => v.taskId === data.taskId);
                    if (existingVideoIndex === -1) {
                           uploadedVideos.push({
                                taskId: data.taskId,
                                originalFilename: file.name,
                                status: 'uploaded', // Изначальный статус после загрузки
                                cloudinary_url: data.cloudinary_url,
                                metadata: {} // Метаданные будут получены при опросе
                            });
                    } else {
                        // Обновляем существующую запись, если видео уже было в localStorage (например, при повторной загрузке)
                        uploadedVideos[existingVideoIndex] = {
                            ...uploadedVideos[existingVideoIndex],
                            status: 'uploaded',
                            cloudinary_url: data.cloudinary_url,
                            originalFilename: file.name // Обновляем имя файла на случай изменения
                        };
                    }
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                    await fetchAndDisplayVideos(); // Обновить список видео на странице
                    startPolling(data.taskId); // Начать опрос статуса для нового видео
                } else {
                    uploadStatusText.textContent = `Ошибка загрузки ${file.name}: ${data.error || 'Неизвестная ошибка'}`;
                    uploadStatusText.className = 'status-message error';
                    console.error('Upload error:', data);
                    // Не останавливаем процесс, чтобы другие файлы могли загрузиться
                }
            } catch (error) {
                uploadStatusText.textContent = `Сетевая ошибка при загрузке ${file.name}: ${error.message}`;
                uploadStatusText.className = 'status-message error';
                console.error('Network error during upload:', error);
            }
        }
        // После завершения всех загрузок, скрываем прогресс-бар и очищаем статус
        setTimeout(() => {
            document.querySelector('.progress-bar-container').style.display = 'none';
            uploadStatusText.textContent = 'Готов к загрузке нового видео.';
            uploadStatusText.className = 'status-message info';
        }, 3000); // Оставляем сообщение на 3 секунды
    });

    // Существующая функция: finishSessionBtn
    finishSessionBtn.addEventListener('click', () => {
        // Здесь мы могли бы перенаправлять на finish.html
        // Но если идет конкатенация, то перенаправление происходит оттуда
        // Если нет конкатенации, то просто переходим на finish.html
        window.location.replace('finish.html');
    });


    // НОВЫЙ: Обработчик для чекбокса "Объединить видео"
    connectVideosCheckbox.addEventListener('change', async () => {
        if (connectVideosCheckbox.checked) {
            // Активирована опция объединения
            const count = selectedVideoPublicIds.size;
            if (count < 2) {
                concatenationStatusDiv.textContent = 'Выберите как минимум 2 видео для объединения, чтобы начать.';
                concatenationStatusDiv.className = 'concatenation-status info';
                // connectVideosCheckbox.checked = false; // Можно сбросить, если нет выбора, но лучше позволить пользователю выбрать
                return;
            }

            // Сохраняем порядок выбранных видео
            const orderedPublicIds = Array.from(bubblesContainer.children)
                .filter(bubble => bubble.classList.contains('selected'))
                .map(bubble => bubble.dataset.publicId)
                .filter(id => selectedVideoPublicIds.has(id)); // Убедиться, что это действительно выбранные ID

            console.log('Attempting to concatenate videos with public_ids (ordered):', orderedPublicIds);
            concatenationStatusDiv.textContent = 'Начинаем объединение видео... Это может занять некоторое время.';
            concatenationStatusDiv.className = 'concatenation-status pending';

            try {
                // ИСПРАВЛЕНО: Явное указание backendUrl
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
                    console.log('Concatenation successful:', data);

                    // Добавляем объединенное видео в localStorage и обновляем UI
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
                    await fetchAndDisplayVideos(); // Перерисовать все видео, включая новое

                    // Перенаправляем пользователя на finish.html с URL объединенного видео
                    window.location.replace(`finish.html?videoUrl=${encodeURIComponent(data.new_video_url)}`);

                } else {
                    concatenationStatusDiv.textContent = `Ошибка объединения: ${data.error || 'Неизвестная ошибка'}`;
                    concatenationStatusDiv.className = 'concatenation-status error';
                    console.error('Concatenation error:', data);
                    connectVideosCheckbox.checked = false; // Сбрасываем чекбокс
                    updateConcatenationStatus(); // Обновляем статус
                }
            } catch (error) {
                concatenationStatusDiv.textContent = `Сетевая ошибка при объединении: ${error.message}`;
                concatenationStatusDiv.className = 'concatenation-status error';
                console.error('Network error during concatenation:', error);
                connectVideosCheckbox.checked = false; // Сбрасываем чекбокс
                updateConcatenationStatus(); // Обновляем статус
            }
        } else {
            // Деактивирована опция объединения
            updateConcatenationStatus(); // Очищаем выбор и обновляем статус
        }
    });

    // Инициализация при загрузке страницы
    fetchAndDisplayVideos();
    updateConcatenationStatus(); // Инициализируем статус при загрузке
});
