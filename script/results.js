   if (!DOM_ELEMENTS.processSelectedVideosButton || !DOM_ELEMENTS.concatenationStatusDiv) return;

    // Чекбокс "Connect videos" теперь будет доступен, если есть 2+ завершенных видео.
    // Его состояние (checked/unchecked) контролируется пользователем, не сбрасывается автоматически.
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        if (numCompletedVideos < 2) {
            DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
            if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '0.5';
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'not-allowed';
            }
            // Состояние checked НЕ СБРАСЫВАЕМ автоматически
            console.log("DEBUG: Connect checkbox disabled (less than 2 completed videos).");
        } else {
            DOM_ELEMENTS.connectVideosCheckbox.disabled = false;
            if (DOM_ELEMENTS.connectVideosCheckbox.parentElement) {
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '1';
                DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'pointer';
            }
            console.log("DEBUG: Connect checkbox enabled (2+ completed videos).");
        }
    }


    if (numCompletedVideos === 0) {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'none';
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Нет готовых видео для обработки или объединения. Загрузите видео.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
        console.log("DEBUG: No completed videos. Button hidden.");
    } else {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'inline-block';
        if (shouldConnect) { // Если чекбокс "Объединить" включен
            if (numCompletedVideos < 2) {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Объединить видео';
                DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Для объединения необходимо 2 или более завершенных видео.';
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
                console.log("DEBUG: Connect option checked, but less than 2 completed. Button disabled.");
            } else {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = `Объединить все ${numCompletedVideos} видео`;
                DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к объединению всех ${numCompletedVideos} завершенных видео.`;
                DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status success';
                console.log("DEBUG: Ready to concatenate all completed videos. Button enabled.");
            }
        } else { // Если чекбокс "Объединить" выключен (т.е. индивидуальная обработка)
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            DOM_ELEMENTS.processSelectedVideosButton.textContent = `Обработать все ${numCompletedVideos} видео`;
            DOM_ELEMENTS.concatenationStatusDiv.textContent = `Готово к индивидуальной обработке всех ${numCompletedVideos} видео.`;
            DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status info';
            console.log("DEBUG: Ready for individual processing of all completed videos. Button enabled.");
        }
    }


    // Если есть активные задачи обработки/объединения, отключить кнопки
    const anyVideoProcessing = uploadedVideos.some(v => v.status === 'processing' || v.status === 'shotstack_pending' || v.status === 'concatenated_pending');
    if (anyVideoProcessing) {
        if (DOM_ELEMENTS.processSelectedVideosButton) DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
        if (DOM_ELEMENTS.connectVideosCheckbox) DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
        DOM_ELEMENTS.concatenationStatusDiv.textContent = 'Видео обрабатываются. Пожалуйста, подождите.';
        DOM_ELEMENTS.concatenationStatusDiv.className = 'concatenation-status pending';
        console.log("DEBUG: Active video processing detected. Buttons disabled.");
    }
}

/**
 * Fetches user videos from the backend using the provided identifier.
 * @param {string} identifierValue The value of the identifier (e.g., Instagram username).
 * @param {string} identifierType The type of identifier (e.g., 'instagram_username').
 */
async function fetchUserVideos(identifierValue, identifierType) {
    // DEBUG: Логируем вызов функции и переданные аргументы
    console.log(`DEBUG: [fetchUserVideos] Вызвана с identifierValue: "${identifierValue}", identifierType: "${identifierType}"`);

    displayGeneralStatus('Загрузка ваших видео...', 'info');
    let url = `${RENDER_BACKEND_URL}/user-videos?`;

    // Построение URL запроса на основе типа идентификатора
    if (identifierType === 'instagram_username' && identifierValue) {
        url += `instagram_username=${encodeURIComponent(identifierValue)}`;
    } else if (identifierType === 'email' && identifierValue) {
        url += `email=${encodeURIComponent(identifierValue)}`;
    } else if (identifierType === 'linkedin_profile' && identifierValue) {
        url += `linkedin_profile=${encodeURIComponent(identifierValue)}`;
    } else {
        displayGeneralStatus('Ошибка: Неверный тип идентификатора или пустое значение.', 'error');
        console.error('ERROR: [fetchUserVideos] Неверный тип идентификатора или пустое значение.');
        return;
    }

    try {
        // DEBUG: Логируем URL запроса
        console.log(`DEBUG: [fetchUserVideos] Отправка запроса на: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            // DEBUG: Логируем ошибки HTTP
            console.error(`DEBUG: [fetchUserVideos] Ошибка HTTP! Статус: ${response.status}, Данные ошибки:`, errorData);
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // DEBUG: Логируем полученные данные
        console.log("DEBUG: [fetchUserVideos] Получены данные о видео:", data);

        // Проверяем, является ли data массивом
        if (!Array.isArray(data)) {
            console.error("ERROR: [fetchUserVideos] Полученные данные не являются массивом:", data);
            displayGeneralStatus('Ошибка: Некорректный формат данных от сервера. Ожидался массив.', 'error');
            return;
        }

        // Очищаем текущие пузырьки и список
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = ''; // Очищаем DOM
        }
        // taskBubbles = {}; // Очищаем кэш DOM-элементов - ЭТО МОЖЕТ БЫТЬ ПРОБЛЕМОЙ, если не все пузырьки пересоздаются
        uploadedVideos = []; // Очищаем глобальный массив uploadedVideos
        localStorage.removeItem('uploadedVideos'); // Очищаем localStorage
        selectedVideosForConcatenation = []; // Очищаем выбор при новой загрузке

        if (data.length > 0) {
            // DEBUG: Логируем, если видео найдено
            console.log("DEBUG: [fetchUserVideos] Найдено видео, очищаем и добавляем в uploadedVideos.");
            data.forEach(video => {
                // DEBUG: Логируем каждое обрабатываемое видео
                console.log("DEBUG: [fetchUserVideos] Обработка видео:", video);
                // Добавляем видео в локальный массив uploadedVideos
                uploadedVideos.push({
                    id: video.taskId,
                    original_filename: video.originalFilename,
                    status: video.status,
                    timestamp: video.timestamp,
                    cloudinary_url: video.cloudinary_url,
                    shotstackRenderId: video.shotstackRenderId,
                    shotstackUrl: video.shotstackUrl,
                    message: video.message,
                    metadata: video.metadata || {},
                    posterUrl: video.posterUrl
                });
                // Создаем или обновляем пузырек в DOM
                createOrUpdateBubble(video.taskId, { // Используем taskId в качестве ID для пузырька
                    id: video.taskId, // Убедитесь, что внутренний ID также является taskId
                    original_filename: video.originalFilename,
                    status: video.status,
                    timestamp: video.timestamp,
                    cloudinary_url: video.cloudinary_url,
                    shotstackRenderId: video.shotstackRenderId,
                    shotstackUrl: video.shotstackUrl,
                    message: video.message,
                    metadata: video.metadata || {}, // Убедитесь, что метаданные существуют
                    posterUrl: video.posterUrl // Передаем posterUrl, если доступен
                });
            });
            // Сохраняем обновленный список в localStorage
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
            // DEBUG: Логируем состояние uploadedVideos после добавления
            console.log("DEBUG: [fetchUserVideos] uploadedVideos после добавления:", uploadedVideos);
            displayGeneralStatus(`Найдено ${data.length} видео для этого пользователя.`, 'success');
        } else {
            // DEBUG: Логируем, если видео не найдено
            console.log("DEBUG: [fetchUserVideos] Видео для пользователя не найдено (data.length === 0).");
            displayGeneralStatus('Задач не найдено для этого пользователя.', 'info');
            if (DOM_ELEMENTS.bubblesContainer) {
                DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
            }
        }
        updateConcatenationUI(); // Обновляем UI объединения, чтобы оно отражало новое количество видео

    } catch (error) {
        // DEBUG: Логируем общую ошибку при получении видео
        console.error('DEBUG: [fetchUserVideos] Ошибка при получении видео:', error);
        displayGeneralStatus(`Ошибка при загрузке видео: ${sanitizeHTML(error.message)}. Пожалуйста, попробуйте позже.`, 'error'); // Sanitized message
        uploadedVideos = []; // Очищаем при ошибке
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message error">Не удалось загрузить видео. Пожалуйста, проверьте подключение и попробуйте снова.</p>';
        }
        updateConcatenationUI();
    }
}


// --- Инициализация при загрузке DOM ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DEBUG: DOMContentLoaded event fired.");

    // Инициализируем таймер неактивности
    resetInactivityTimer();

    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');
    const linkedin = localStorage.getItem('hifeLinkedin');

    let headerText = 'Ваши Видео';
    let identifierToFetch = null;
    let identifierTypeToFetch = null;

    if (username) {
        headerText = `Ваши Видео для @${sanitizeHTML(username)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: @${sanitizeHTML(username)}`;
        identifierToFetch = username;
        identifierTypeToFetch = 'instagram_username';
    } else if (email) {
        headerText = `Ваши Видео для ${sanitizeHTML(email)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: ${sanitizeHTML(email)}`;
        identifierToFetch = email;
        identifierTypeToFetch = 'email';
    } else if (linkedin) {
        headerText = `Ваши Видео для ${sanitizeHTML(linkedin)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: ${sanitizeHTML(linkedin)}`;
        identifierToFetch = linkedin;
        identifierTypeToFetch = 'linkedin_profile';
    } else {
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = 'Для: Гость';
        displayGeneralStatus('Данные пользователя не найдены. Загрузите видео со страницы загрузки.', 'info');
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
    }
    if (DOM_ELEMENTS.resultsHeader) DOM_ELEMENTS.resultsHeader.textContent = headerText;

    // Управление кнопкой "Upload New Video(s)"
    if (identifierToFetch) { // Если есть какой-либо идентификатор пользователя
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.textContent = 'Загрузить новое видео';
        updateUploadStatusDisplay('Готов к новой загрузке.', 'info');
        if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
        resetProgressBar();
    } else {
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = true;
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.textContent = 'Загрузить (сначала войдите)';
        updateUploadStatusDisplay('Невозможно повторно загрузить: данные пользователя не найдены. Пожалуйста, загрузите видео со страницы загрузки.', 'error');
        if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
        resetProgressBar();
    }

    // --- NEW: Fetch user videos from backend when results page loads ---
    if (identifierToFetch && identifierTypeToFetch) {
        await fetchUserVideos(identifierToFetch, identifierTypeToFetch);
    } else {
         // If no user data, ensure uploadedVideos is empty and message is displayed
        uploadedVideos = [];
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
        displayGeneralStatus('Данные пользователя не найдены. Загрузите видео со страницы загрузки.', 'info');
    }
    // The `uploadedVideos` array should now be populated (or empty if no videos found/error).
    // The createOrUpdateBubble calls within fetchUserVideos already handle rendering.
    // However, if fetchUserVideos was skipped (e.g., no user data), we still need to initialize polling.
    checkTaskStatuses(); // Start polling regardless, as existing videos might be in localStorage.


    // Обработчик клика по кнопке "Upload New Video(s)"
    if (DOM_ELEMENTS.uploadNewBtn) {
        DOM_ELEMENTS.uploadNewBtn.addEventListener('click', () => {
            if (DOM_ELEMENTS.uploadNewBtn.disabled) return;
            if (DOM_ELEMENTS.videoFileInput) DOM_ELEMENTS.videoFileInput.click();
        });
    }

    // Обработчик выбора файла через скрытый input
    if (DOM_ELEMENTS.videoFileInput) {
        DOM_ELEMENTS.videoFileInput.addEventListener('change', (event) => {
            const selectedFile = event.target.files[0];
            if (selectedFile) {
                uploadVideoFromResults(selectedFile);
                DOM_ELEMENTS.videoFileInput.value = '';
            } else {
                updateUploadStatusDisplay('Выбор файла отменен.', 'info');
                resetProgressBar();
            }
        });
    }

    // Обработчик закрытия модального окна по кнопке
    if (DOM_ELEMENTS.closeButton) {
        DOM_ELEMENTS.closeButton.addEventListener('click', () => {
            if (DOM_ELEMENTS.metadataModal) DOM_ELEMENTS.metadataModal.style.display = 'none';
        });
    }

    // Обработчик закрытия модального окна по клику вне его
    window.addEventListener('click', (event) => {
        if (DOM_ELEMENTS.metadataModal && event.target === DOM_ELEMENTS.metadataModal) {
            DOM_ELEMENTS.metadataModal.style.display = 'none';
        }
    });

    // Обработчик кнопки "Завершить сессию"
    if (DOM_ELEMENTS.finishSessionBtn) {
        // Устанавливаем display на основе текущего состояния `uploadedVideos`
        // Note: this relies on uploadedVideos being accurate after initial fetch.
        if (uploadedVideos.length > 0 || localStorage.getItem('hifeUsername') || localStorage.getItem('hifeEmail') || localStorage.getItem('hifeLinkedin')) {
            DOM_ELEMENTS.finishSessionBtn.style.display = 'inline-block';
        } else {
            DOM_ELEMENTS.finishSessionBtn.style.display = 'none';
        }

        DOM_ELEMENTS.finishSessionBtn.addEventListener('click', () => {
            localStorage.removeItem('hifeUsername');
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('hifeLinkedin');
            localStorage.removeItem('uploadedVideos');
            console.log("Сессия завершена. Локальное хранилище очищено.");
            window.location.replace('index.html');
        });
    }

    // --- Обработчики для логики объединения видео ---

    // Обработчик изменения чекбокса "Объединить видео"
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        DOM_ELEMENTS.connectVideosCheckbox.addEventListener('change', updateConcatenationUI);
        console.log("DEBUG: Connect videos checkbox event listener attached.");
    } else {
        console.log("DEBUG: Connect videos checkbox element NOT found! Please ensure your HTML has an element with id 'connectVideosCheckbox'.");
    }

    // Обработчик кнопки "Обработать/Объединить выбранные видео"
    if (DOM_ELEMENTS.processSelectedVideosButton) {
        DOM_ELEMENTS.processSelectedVideosButton.addEventListener('click', async () => {
            console.log("DEBUG: --- Process Selected Videos Button Click Handler STARTED ---");
            // ДОБАВЛЕНО: Проверка disabled состояния кнопки
            if (DOM_ELEMENTS.processSelectedVideosButton.disabled) {
                console.log("DEBUG: Button is disabled. Skipping click handler execution.");
                return; // Выходим, если кнопка отключена
            }

            // ПЕРЕЧИТЫВАЕМ uploadedVideos ИЗ localStorage ПЕРЕД ИСПОЛЬЗОВАНИЕМ!
            uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
            console.log("DEBUG: uploadedVideos reloaded from localStorage at handler start:", uploadedVideos);


            const username = localStorage.getItem('hifeUsername');
            const email = localStorage.getItem('hifeEmail');
            const linkedin = localStorage.getItem('hifeLinkedin');
            // Получаем фактическое состояние чекбокса "Объединить видео"
            const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;

            console.log("DEBUG: Is 'Connect videos' checkbox checked (actual checkbox state)?:", shouldConnect);

            // Отфильтровываем ВСЕ видео, которые имеют статус 'completed' и не являются объединенными видео
            const videosToProcess = uploadedVideos.filter(video =>
                video.status === 'completed' && !String(video.id).startsWith('concatenated_video_')
            );

            const taskIdsToProcess = videosToProcess.map(video => video.id); // Используем video.id (строковый Cloudinary ID)

            console.log("DEBUG: Videos to process (filtered by 'completed' status for ALL):", videosToProcess);
            console.log("DEBUG: Task IDs to process (for ALL completed):", taskIdsToProcess);


            if (taskIdsToProcess.length === 0) {
                displayGeneralStatus('Нет завершенных видео для обработки или объединения. Загрузите видео.', 'error');
                console.log("DEBUG: No completed videos found for processing. Returning.");
                return;
            }

            if (shouldConnect && taskIdsToProcess.length < 2) {
                displayGeneralStatus('Для объединения необходимо 2 или более завершенных видео.', 'error');
                console.log("DEBUG: Connect option enabled, but less than 2 completed videos found. Returning.");
                return;
            }

            // Проверяем, есть ли уже обрабатываемые/объединяемые видео
            const anyVideoProcessing = uploadedVideos.some(v => v.status === 'processing' || v.status === 'shotstack_pending' || v.status === 'concatenated_pending');
            if (anyVideoProcessing) {
                displayGeneralStatus('Дождитесь завершения текущих процессов обработки/объединения.', 'pending');
                console.log("DEBUG: Another video is currently processing. Returning.");
                return;
            }

            try {
                console.log("DEBUG: Calling processVideosFromSelection...");
                const result = await processVideosFromSelection(
                    taskIdsToProcess, // Передаем все готовые видео
                    shouldConnect, // Передаем фактическое состояние чекбокса
                    username,
                    email,
                    linkedin,
                    displayGeneralStatus, // Функция для обновления статуса внутри process_videos.js
                    displayGeneralStatus, // Функция для обновления общего статуса
                    RENDER_BACKEND_URL // Передаем URL бэкенда
                );
                console.log("DEBUG: processVideosFromSelection returned:", result);

                if (result) { // Проверяем, что result не null (не было внутренней ошибки)
                    // Если это объединение, бэкенд должен вернуть новый taskId для объединенного видео
                    if (shouldConnect && result.concatenated_task_id) {
                        const newConcatenatedVideo = {
                            id: result.concatenated_task_id, // Используем строковый ID объединенного видео
                            original_filename: 'Объединенное Видео',
                            status: 'concatenated_pending',
                            timestamp: new Date().toISOString(),
                            cloudinary_url: null,
                            shotstackRenderId: result.shotstackRenderId || null,
                            shotstackUrl: result.shotstackUrl || null
                        };
                        uploadedVideos.push(newConcatenatedVideo);
                        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                        createOrUpdateBubble(newConcatenatedVideo.id, newConcatenatedVideo); // ИСПОЛЬЗУЕМ id (строковый) ДЛЯ BUBBLE ID
                        console.log("DEBUG: New concatenated video added:", newConcatenatedVideo);
                    } else {
                        // Для индивидуальной обработки просто обновляем статусы существующих видео
                        // (хотя эта ветка теперь менее актуальна из-за новой логики "объединять все")
                        if (result.initiated_tasks && Array.isArray(result.initiated_tasks)) {
                            result.initiated_tasks.forEach(initiatedTask => {
                                const index = uploadedVideos.findIndex(v => v.id === initiatedTask.taskId); // ИСПОЛЬЗУЕМ v.id (строковый)
                                if (index !== -1) {
                                    uploadedVideos[index].status = initiatedTask.status || 'shotstack_pending';
                                    uploadedVideos[index].shotstackRenderId = initiatedTask.shotstackRenderId || null;
                                    uploadedVideos[index].message = initiatedTask.message || '';
                                    createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]); // ИСПОЛЬЗУЕМ id (строковый)
                                }
                            });
                            console.log("DEBUG: Updated statuses for individual tasks:", result.initiated_tasks);
                        } else if (result.shotstackRenderId && taskIdsToProcess.length === 1) { // Если один видео, и бэкенд возвращает RenderId
                            const index = uploadedVideos.findIndex(v => v.id === taskIdsToProcess[0]); // ИСПОЛЬЗУЕМ v.id (строковый)
                            if (index !== -1) {
                                uploadedVideos[index].status = 'shotstack_pending';
                                uploadedVideos[index].shotstackRenderId = result.shotstackRenderId;
                                uploadedVideos[index].message = result.message || '';
                                createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]); // ИСПОЛЬЗУЕМ id (строковый)
                                console.log("DEBUG: Updated status for single task with Shotstack Render ID.");
                            }
                        }
                        else {
                            // Если бэкенд не вернул initiated_tasks для множества, просто обновляем выбранные на 'shotstack_pending'
                            uploadedVideos = uploadedVideos.map(video => {
                                if (taskIdsToProcess.includes(video.id)) { // ИСПОЛЬЗУЕМ video.id (строковый)
                                    console.log(`DEBUG: Forcing status 'shotstack_pending' for task ${video.id}`);
                                    return { ...video, status: 'shotstack_pending' };
                                }
                                return video;
                            });
                        }
                        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                    }
                    checkTaskStatuses();
                } else {
                    // Если processVideosFromSelection вернул null, значит была внутренняя ошибка,
                    // сообщение о которой уже выведено
                    console.error("DEBUG: processVideosFromSelection returned null, indicating an internal error.");
                }
            } catch (error) {
                console.error('Ошибка в обработчике processSelectedVideosButton:', error);
                displayGeneralStatus(`Произошла неожиданная ошибка: ${sanitizeHTML(error.message || 'Неизвестная ошибка')}`, 'error'); // Sanitized message
            } finally {
                console.log("DEBUG: --- Process Selected Videos Button Click Handler FINISHED ---");
                updateConcatenationUI();
            }
        });
        console.log("DEBUG: Process Selected Videos Button event listener attached.");
    } else {
        console.log("DEBUG: Process Selected Videos Button element NOT found! Please ensure your HTML has an element with id 'processSelectedVideosButton'.");
    }

    // Начальное обновление UI объединения при загрузке страницы
    updateConcatenationUI();
    // checkTaskStatuses() is already called after fetchUserVideos or if no user data.
});
