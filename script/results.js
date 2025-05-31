document.addEventListener('DOMContentLoaded', async () => {
    const resultsContainer = document.getElementById('resultsContainer');
    const uploadMoreVideosButton = document.getElementById('uploadMoreVideosButton');
    const finishSessionButton = document.getElementById('finishSessionButton');

    // ЭЛЕМЕНТЫ DOM ДЛЯ ЗАГРУЗКИ (ИДЕНТИЧНЫЕ ТЕМ, ЧТО НА UPLOAD.HTML)
    const videoFileInput = document.getElementById('videoFileInput'); // Используем тот же ID
    const videoPreview = document.getElementById('videoPreview');
    const uploadStatusContainer = document.getElementById('uploadStatusContainer');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const fileValidationStatusList = document.getElementById('fileValidationStatusList');

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';
    const POLLING_INTERVAL = 5000;

    // Константы для максимального размера и длительности (копируем из upload_validation.js)
    const MAX_FILE_SIZE_MB = 100;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    const MAX_VIDEO_DURATION_SECONDS = 60;

    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || ''; // Получаем данные пользователя
    let hifeEmail = localStorage.getItem('hifeEmail') || '';


    // --- ОБРАБОТЧИКИ КНОПОК НА RESULTS.HTML ---

    // Кнопка "Загрузить ещё" теперь открывает скрытый инпут
    uploadMoreVideosButton.addEventListener('click', () => {
        videoFileInput.click(); // Открываем диалог выбора файлов
        // Очищаем предыдущие сообщения и предпросмотр при новой попытке загрузки
        fileValidationStatusList.innerHTML = '';
        generalStatusMessage.textContent = '';
        uploadStatusContainer.style.display = 'none';
        videoPreview.style.display = 'none';
        videoPreview.src = '';
        resetProgressBar(); // Сбрасываем прогресс бар
    });

    finishSessionButton.addEventListener('click', () => {
        // Очищаем весь localStorage, связанный с этой сессией
        localStorage.removeItem('uploadedVideos');
        localStorage.removeItem('hifeUsername');
        localStorage.removeItem('hifeEmail');
        // Перенаправляем на новую страницу завершения
        window.location.replace('finish.html');
    });

    // --- ЛОГИКА ЗАГРУЗКИ НОВЫХ ФАЙЛОВ (ИДЕНТИЧНАЯ ТОЙ, ЧТО НА UPLOAD.HTML) ---

    videoFileInput.addEventListener('change', async () => {
        const files = videoFileInput.files;
        fileValidationStatusList.innerHTML = ''; // Очищаем список статусов
        videoPreview.style.display = 'none'; // Скрываем предпросмотр
        videoPreview.src = '';
        resetProgressBar(); // Сбрасываем прогресс бар

        if (files.length === 0) {
            generalStatusMessage.textContent = 'Выбор файла отменен.';
            generalStatusMessage.style.color = 'var(--status-info-color)';
            uploadStatusContainer.style.display = 'none'; // Скрыть контейнер
            return;
        }

        let validFilesCount = 0;
        let invalidFilesCount = 0;
        let filesToProcess = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let isValid = true;
            let validationMessage = '';

            if (file.size > MAX_FILE_SIZE_BYTES) {
                validationMessage = `Ошибка: файл "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} МБ) превышает ${MAX_FILE_SIZE_MB} МБ.`;
                isValid = false;
            }

            if (isValid) {
                try {
                    const duration = await getVideoDuration(file);
                    if (duration > MAX_VIDEO_DURATION_SECONDS) {
                        validationMessage = `Ошибка: длительность видео "${file.name}" (${Math.floor(duration / 60)} мин ${Math.floor(duration % 60)} сек) превышает ${MAX_VIDEO_DURATION_SECONDS / 60} минуту.`;
                        isValid = false;
                    }
                } catch (error) {
                    validationMessage = `Ошибка: Не удалось получить длительность видео "${file.name}". ${error.message || 'Возможно, файл поврежден или имеет неподдерживаемый формат.'}`;
                    isValid = false;
                }
            }

            const li = document.createElement('li');
            li.textContent = `${file.name}: `;
            if (isValid) {
                li.innerHTML += `<span class="status-success">Готов к загрузке</span>`;
                validFilesCount++;
                filesToProcess.push(file);
            } else {
                li.innerHTML += `<span class="status-error">${validationMessage}</span>`;
                invalidFilesCount++;
            }
            fileValidationStatusList.appendChild(li);
        }

        // Обновляем общее сообщение о статусе
        if (validFilesCount > 0 && invalidFilesCount === 0) {
            generalStatusMessage.textContent = `${validFilesCount} файл(ов) готов(ы) к загрузке. Начинаю загрузку...`;
            generalStatusMessage.style.color = 'var(--status-info-color)';
        } else if (validFilesCount > 0 && invalidFilesCount > 0) {
            generalStatusMessage.textContent = `${validFilesCount} файл(ов) готов(ы) к загрузке. ${invalidFilesCount} файл(ов) отклонен(ы). Начинаю загрузку валидных...`;
            generalStatusMessage.style.color = 'var(--status-warning-color)';
        } else if (invalidFilesCount > 0) {
            generalStatusMessage.textContent = `Все выбранные файлы были отклонены: ${invalidFilesCount} с ошибками.`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
        } else {
            generalStatusMessage.textContent = 'Нет файлов для загрузки.';
            generalStatusMessage.style.color = 'var(--status-info-color)';
        }

        // Если выбран только один валидный файл, показываем предпросмотр
        if (filesToProcess.length === 1) {
            const url = URL.createObjectURL(filesToProcess[0]);
            videoPreview.src = url;
            videoPreview.style.display = 'block';
            videoPreview.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
            };
        } else {
            videoPreview.style.display = 'none';
            videoPreview.src = '';
        }

        videoFileInput.value = ''; // Очищаем поле ввода файла

        if (filesToProcess.length > 0) {
            uploadStatusContainer.style.display = 'block';
            progressBar.parentElement.style.display = 'flex'; // Показать прогресс-бар
            generalStatusMessage.textContent = `Начинается загрузка ${filesToProcess.length} файла(ов)...`;
            generalStatusMessage.style.color = 'var(--status-info-color)';

            for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                generalStatusMessage.textContent = `Загрузка файла ${i + 1}/${filesToProcess.length}: ${file.name}...`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
                resetProgressBar(); // Сбрасываем прогресс для каждого нового файла

                await uploadVideoPromise(file, hifeUsername, hifeEmail); // Используем эту же функцию
            }

            generalStatusMessage.textContent = `Все новые загрузки завершены. ${validFilesCount} успешно, ${invalidFilesCount} с ошибками валидации.`;
            generalStatusMessage.style.color = 'var(--status-completed-color)';
            resetProgressBar();
            setTimeout(() => {
                uploadStatusContainer.style.display = 'none';
                generalStatusMessage.textContent = '';
                pollVideoStatuses(); // Запустить опрос статусов после новых загрузок
            }, 5000); // Сообщение исчезнет через 5 секунд

        } else {
            uploadStatusContainer.style.display = 'none'; // Скрыть контейнер, если нет файлов для загрузки
        }
    });

    // --- ФУНКЦИИ: getVideoDuration и uploadVideoPromise (идентичные) ---

    function getVideoDuration(file) {
        return new Promise((resolve, reject) => {
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';

            tempVideo.onloadedmetadata = () => {
                window.URL.revokeObjectURL(tempVideo.src);
                resolve(tempVideo.duration);
            };

            tempVideo.onerror = (e) => {
                window.URL.revokeObjectURL(tempVideo.src);
                let errorMessage = `Не удалось получить длительность видео "${file.name}".`;
                if (tempVideo.error) {
                    errorMessage += ` Код ошибки: ${tempVideo.error.code}. Сообщение: ${tempVideo.error.message}.`;
                } else {
                    errorMessage += ` Возможно, файл поврежден или имеет неподдерживаемый формат.`;
                }
                reject(new Error(errorMessage));
            };

            tempVideo.src = window.URL.createObjectURL(file);
        });
    }

    function uploadVideoPromise(file, username, email) {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('video', file);
            if (username) {
                formData.append('instagram_username', username);
            }
            if (email) {
                formData.append('email', email);
            }

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    progressBar.style.width = `${percent.toFixed(0)}%`;
                    progressText.textContent = `${percent.toFixed(0)}%`;
                }
            });

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId;

                    // Обновляем массив uploadedVideos и localStorage
                    const newVideoEntry = {
                        id: taskId,
                        original_filename: file.name,
                        status: 'pending',
                        timestamp: new Date().toISOString()
                    };
                    uploadedVideos.push(newVideoEntry);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                    displayVideoBubbles(uploadedVideos); // Обновляем отображение, чтобы новый пузырек появился
                    resolve(true);
                } else {
                    const error = JSON.parse(xhr.responseText);
                    console.error(`Ошибка загрузки "${file.name}":`, error);
                    resolve(false);
                }
            };

            xhr.onerror = function() {
                console.error(`Сетевая ошибка при загрузке видео "${file.name}".`);
                resolve(false);
            };

            xhr.send(formData);
        });
    }

    function resetProgressBar() {
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        if (progressBar && progressBar.parentElement) progressBar.parentElement.style.display = 'none'; // Скрыть после сброса
    }


    // --- СУЩЕСТВУЮЩАЯ ЛОГИКА ОТОБРАЖЕНИЯ РЕЗУЛЬТАТОВ И ОПРОСА ---

    function displayVideoBubbles(videos) {
        resultsContainer.innerHTML = '';
        if (videos.length === 0) {
            resultsContainer.innerHTML = '<p class="status-info">Пока нет видео для отображения. Нажмите "Загрузить ещё", чтобы добавить новые файлы.</p>';
            return;
        }

        videos.forEach(video => {
            const bubble = document.createElement('div');
            bubble.className = 'video-bubble';

            let statusText = '';
            let statusClass = '';
            let previewHtml = '';

            switch (video.status) {
                case 'pending':
                    statusText = 'В очереди';
                    statusClass = 'status-pending';
                    previewHtml = `<div class="loading-spinner"></div>`;
                    break;
                case 'processing':
                    statusText = 'Обработка метаданных...';
                    statusClass = 'status-processing';
                    previewHtml = `<div class="loading-spinner"></div>`;
                    break;
                case 'completed':
                    statusText = 'Завершено';
                    statusClass = 'status-completed';
                    if (video.preview_url) {
                        previewHtml = `<img src="${video.preview_url}" alt="Превью видео" class="video-preview">`;
                    } else if (video.video_url) {
                         previewHtml = `<video src="${video.video_url}" controls muted loop class="video-preview-fallback"></video>`;
                    } else {
                        previewHtml = `<div class="no-preview">Нет превью</div>`;
                    }
                    break;
                case 'failed':
                    statusText = 'Ошибка обработки';
                    statusClass = 'status-error';
                    previewHtml = `<div class="error-icon">!</div>`;
                    break;
                default:
                    statusText = 'Неизвестный статус';
                    statusClass = 'status-info';
                    previewHtml = `<div class="no-preview">?</div>`;
            }

            bubble.innerHTML = `
                <div class="video-preview-container">
                    ${previewHtml}
                </div>
                <div class="video-info">
                    <h3>${video.original_filename || 'Неизвестный файл'}</h3>
                    <p>ID Задачи: ${video.id}</p>
                    <p class="status ${statusClass}">Статус: ${statusText}</p>
                    ${video.duration ? `<p>Длительность: ${Math.floor(video.duration / 60)}м ${Math.floor(video.duration % 60)}с</p>` : ''}
                    ${video.width && video.height ? `<p>Разрешение: ${video.width}x${video.height}</p>` : ''}
                    ${video.error_message ? `<p class="error-detail">Ошибка: ${video.error_message}</p>` : ''}
                </div>
            `;
            resultsContainer.appendChild(bubble);
        });
    }

    async function pollVideoStatuses() {
        if (uploadedVideos.length === 0) {
            displayVideoBubbles([]);
            return;
        }

        const taskIds = uploadedVideos.map(video => video.id);
        if (taskIds.length === 0) {
            displayVideoBubbles([]);
            return;
        }

        try {
            const response = await fetch(`${RENDER_BACKEND_URL}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ task_ids: taskIds })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const results = await response.json();
            const updatedVideos = uploadedVideos.map(localVideo => {
                const serverStatus = results.find(s => s.task_id === localVideo.id);
                if (serverStatus) {
                    return {
                        ...localVideo,
                        status: serverStatus.status,
                        duration: serverStatus.duration || localVideo.duration,
                        width: serverStatus.width || localVideo.width,
                        height: serverStatus.height || localVideo.height,
                        preview_url: serverStatus.preview_url || localVideo.preview_url,
                        video_url: serverStatus.video_url || localVideo.video_url,
                        error_message: serverStatus.error_message || localVideo.error_message
                    };
                }
                return localVideo;
            });

            uploadedVideos = updatedVideos;
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

            displayVideoBubbles(uploadedVideos);

        } catch (error) {
            console.error('Ошибка при опросе статусов:', error);
            resultsContainer.innerHTML = `<p class="status-error">Ошибка загрузки статусов: ${error.message}. Попробуйте обновить страницу.</p>`;
        }
    }

    // Запускаем опрос при загрузке страницы и затем каждые POLLING_INTERVAL
    pollVideoStatuses();
    setInterval(pollVideoStatuses, POLLING_INTERVAL);

    // Начальные состояния элементов загрузки
    uploadStatusContainer.style.display = 'none';
    progressBar.parentElement.style.display = 'none';
    videoPreview.style.display = 'none';
    fileValidationStatusList.innerHTML = '<p>Выберите видео для анализа.</p>'; // Изначальное сообщение
});
