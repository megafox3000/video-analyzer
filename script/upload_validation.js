document.addEventListener('DOMContentLoaded', () => {
    // --- Константы ---
    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render
    const MAX_VIDEO_SIZE_MB = 100; // Максимальный размер видео в мегабайтах
    const MAX_VIDEO_DURATION_SECONDS = 60; // Максимальная длительность видео в секундах (10 минут)
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024; // Конвертация в байты

    // --- Элементы DOM ---
    const instagramUsernameInput = document.getElementById('instagramUsername');
    const userEmailInput = document.getElementById('userEmail');
    const selectFilesButton = document.getElementById('selectFilesButton');
    const uploadButton = document.getElementById('uploadButton');
    const resultsButton = document.getElementById('resultsButton');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    const videoInfoContainer = document.getElementById('videoInfoContainer');

    let selectedFile = null; // Переменная для хранения выбранного файла

    // --- Инициализация состояния UI ---
    uploadButton.disabled = true; // Кнопка "Upload" изначально неактивна
    resultsButton.style.display = 'none'; // Кнопка "View Results" изначально скрыта
    progressBarContainer.style.display = 'none'; // Прогресс-бар скрыт

    // Загружаем данные из localStorage при загрузке страницы
    instagramUsernameInput.value = localStorage.getItem('hifeUsername') || '';
    userEmailInput.value = localStorage.getItem('hifeEmail') || '';

    // Если есть данные пользователя, активируем кнопку "View Results"
    if (instagramUsernameInput.value || userEmailInput.value) {
        resultsButton.style.display = 'inline-block';
    }

    // --- Обработчик выбора файла ---
    selectFilesButton.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'video/*'; // Принимаем только видеофайлы
        fileInput.onchange = (event) => {
            selectedFile = event.target.files[0];
            if (selectedFile) {
                validateFile(selectedFile);
            } else {
                displayStatus('Please select a video file.', 'info');
                uploadButton.disabled = true;
                hideProgressBar();
                clearVideoInfo();
            }
        };
        fileInput.click();
    });

    // --- Валидация файла ---
    async function validateFile(file) {
        clearValidationErrors();
        clearVideoInfo(); // Очищаем старую информацию о видео
        
        const errors = [];
        const warnings = [];

        // 1. Проверка типа файла
        if (!file.type.startsWith('video/')) {
            errors.push('Invalid file type. Please select a video file.');
        }

        // 2. Проверка размера файла
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
            errors.push(`File size exceeds the limit of ${MAX_VIDEO_SIZE_MB}MB.`);
        }

        // 3. Проверка длительности видео (асинхронно)
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
            window.URL.revokeObjectURL(video.src); // Освобождаем URL
            if (video.duration === Infinity || isNaN(video.duration)) {
                // Если длительность бесконечна или NaN, это может быть проблемой с кодеком или поврежденным файлом.
                // В этом случае предупреждаем пользователя.
                warnings.push('Could not determine video duration. The file might be corrupted or in an unsupported format. Attempting upload anyway.');
            } else if (video.duration > MAX_VIDEO_DURATION_SECONDS) {
                errors.push(`Video duration exceeds the limit of ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`);
            }

            // После всех проверок
            processValidationResults(file, errors, warnings);
        };
        video.onerror = function() {
            // Ошибка при загрузке метаданных
            errors.push('Failed to load video metadata. The file might be corrupted or in an unsupported format.');
            processValidationResults(file, errors, warnings);
        };
        video.src = URL.createObjectURL(file); // Создаем временный URL для видео

        // Отображаем начальную информацию о видео
        displayVideoInfo('Filename', file.name);
        displayVideoInfo('Size', `${(file.size / (1024 * 1024)).toFixed(2)} MB`);
        displayVideoInfo('Type', file.type);
    }

    function processValidationResults(file, errors, warnings) {
        if (errors.length > 0) {
            errors.forEach(err => displayStatus(err, 'error'));
            uploadButton.disabled = true;
            hideProgressBar();
            selectedFile = null; // Сбрасываем файл, если есть ошибки
        } else {
            warnings.forEach(warn => displayStatus(warn, 'info'));
            displayStatus(`File selected: ${file.name}. Ready to upload.`, 'info');
            uploadButton.disabled = false; // Активируем кнопку "Upload"
            showProgressBar(); // Показываем прогресс-бар в готовности
        }
    }

    function displayVideoInfo(label, value) {
        videoInfoContainer.style.display = 'flex'; // Показываем контейнер информации
        const infoItem = document.createElement('div');
        infoItem.className = 'video-info-item';
        infoItem.innerHTML = `<strong>${label}:</strong> <span>${value}</span>`;
        videoInfoContainer.appendChild(infoItem);
    }

    function clearVideoInfo() {
        videoInfoContainer.innerHTML = '';
        videoInfoContainer.style.display = 'none';
    }

    function clearValidationErrors() {
        instagramUsernameInput.style.borderColor = ''; // Сброс красной рамки
        userEmailInput.style.borderColor = '';
    }

    // --- Обработчик отправки формы (загрузка видео) ---
    uploadButton.addEventListener('click', async (event) => {
        event.preventDefault(); // Предотвращаем стандартную отправку формы

        if (!selectedFile) {
            displayStatus('Please select a video file first.', 'error');
            return;
        }

        const instagramUsername = instagramUsernameInput.value.trim();
        const userEmail = userEmailInput.value.trim();

        if (!instagramUsername && !userEmail) {
            displayStatus('Please enter either an Instagram username or an email.', 'error');
            instagramUsernameInput.style.borderColor = 'red';
            userEmailInput.style.borderColor = 'red';
            return;
        }

        // Сохраняем username и email в localStorage
        localStorage.setItem('hifeUsername', instagramUsername);
        localStorage.setItem('hifeEmail', userEmail);

        const formData = new FormData();
        formData.append('video', selectedFile);
        if (instagramUsername) {
            formData.append('instagram_username', instagramUsername);
        }
        if (userEmail) {
            formData.append('email', userEmail);
        }

        // Обновляем UI для начала загрузки
        displayStatus('Starting upload...', 'info');
        showProgressBar();
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        uploadButton.disabled = true; // Деактивируем кнопку во время загрузки
        selectFilesButton.disabled = true; // Деактивируем кнопку выбора файла
        instagramUsernameInput.disabled = true;
        userEmailInput.disabled = true;
        resultsButton.style.display = 'none'; // Скрываем кнопку результатов пока идет загрузка

        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    progressBar.style.width = `${percent.toFixed(0)}%`;
                    progressText.textContent = `${percent.toFixed(0)}%`;
                    displayStatus(`Uploading: ${percent.toFixed(0)}%`, 'info');
                }
            });

            xhr.onload = function() {
                resetUploadUI(); // Сбрасываем состояние UI
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId;
                    displayStatus(`Upload successful! Task ID: ${taskId}. Redirecting to results...`, 'completed');
                    
                    // Сохраняем данные о загруженном видео в localStorage
                    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    uploadedVideos.push({
                        id: taskId,
                        original_filename: selectedFile.name,
                        status: 'pending',
                        timestamp: new Date().toISOString()
                    });
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                    // Перенаправление на страницу результатов
                    setTimeout(() => {
                        window.location.href = 'results.html';
                    }, 2000); // Задержка для отображения сообщения об успехе
                } else {
                    const error = JSON.parse(xhr.responseText);
                    displayStatus(`Upload failed: ${error.error || 'Unknown error'}`, 'error');
                }
            };

            xhr.onerror = function() {
                resetUploadUI();
                displayStatus('Network error during upload.', 'error');
            };

            xhr.send(formData);

        } catch (error) {
            resetUploadUI();
            console.error('Error sending upload request:', error);
            displayStatus(`An error occurred: ${error.message}`, 'error');
        }
    });

    // --- Вспомогательные функции UI ---
    function displayStatus(message, type = 'info') {
        uploadStatusText.textContent = message;
        // Используем CSS переменные для цветов
        switch (type) {
            case 'info':
                uploadStatusText.style.color = 'var(--status-info-color)';
                break;
            case 'pending':
                uploadStatusText.style.color = 'var(--status-pending-color)';
                break;
            case 'completed':
                uploadStatusText.style.color = 'var(--status-completed-color)';
                break;
            case 'error':
                uploadStatusText.style.color = 'var(--status-error-color)';
                break;
            default:
                uploadStatusText.style.color = 'var(--text-color-light)';
        }
    }

    function showProgressBar() {
        progressBarContainer.style.display = 'flex';
    }

    function hideProgressBar() {
        progressBarContainer.style.display = 'none';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
    }

    function resetUploadUI() {
        uploadButton.disabled = true; // Снова отключаем кнопку Upload
        selectFilesButton.disabled = false; // Активируем кнопку Select
        instagramUsernameInput.disabled = false;
        userEmailInput.disabled = false;
        hideProgressBar();
        selectedFile = null; // Сбрасываем выбранный файл
        // Если есть пользовательские данные, активируем кнопку "View Results"
        if (localStorage.getItem('hifeUsername') || localStorage.getItem('hifeEmail')) {
            resultsButton.style.display = 'inline-block';
        }
    }
});
