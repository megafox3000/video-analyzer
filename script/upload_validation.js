document.addEventListener('DOMContentLoaded', () => {
    // --- Константы ---
    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render
    const MAX_VIDEO_SIZE_MB = 100; // Максимальный размер видео в мегабайтах
    const MAX_VIDEO_DURATION_SECONDS = 60; // Максимальная длительность видео в секундах (10 минут)
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024; // Конвертация в байты

    // --- Элементы DOM ---
    const instagramUsernameInput = document.getElementById('instagramUsername');
    const linkedinProfileInput = document.getElementById('linkedinProfile'); // Добавлено поле LinkedIn
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
    linkedinProfileInput.value = localStorage.getItem('hifeLinkedin') || ''; // Загружаем LinkedIn
    userEmailInput.value = localStorage.getItem('hifeEmail') || '';

    // Если есть данные пользователя, активируем кнопку "View Results"
    if (instagramUsernameInput.value || linkedinProfileInput.value || userEmailInput.value) { // Обновлено условие
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
                warnings.push('Could not determine video duration. The file might be corrupted or in an unsupported format. Attempting upload anyway.');
            } else if (video.duration > MAX_VIDEO_DURATION_SECONDS) {
                errors.push(`Video duration exceeds the limit of ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`);
            }

            processValidationResults(file, errors, warnings);
        };
        video.onerror = function() {
            errors.push('Failed to load video metadata. The file might be corrupted or in an unsupported format.');
            processValidationResults(file, errors, warnings);
        };
        video.src = URL.createObjectURL(file);

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
            selectedFile = null;
        } else {
            warnings.forEach(warn => displayStatus(warn, 'info'));
            displayStatus(`File selected: ${file.name}. Ready to upload.`, 'info');
            uploadButton.disabled = false;
            showProgressBar();
        }
    }

    function displayVideoInfo(label, value) {
        videoInfoContainer.style.display = 'flex';
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
        instagramUsernameInput.style.borderColor = '';
        linkedinProfileInput.style.borderColor = ''; // Сброс красной рамки для LinkedIn
        userEmailInput.style.borderColor = '';
    }

    // --- Обработчик отправки формы (загрузка видео) ---
    uploadButton.addEventListener('click', async (event) => {
        event.preventDefault();

        if (!selectedFile) {
            displayStatus('Please select a video file first.', 'error');
            return;
        }

        const instagramUsername = instagramUsernameInput.value.trim();
        const linkedinProfile = linkedinProfileInput.value.trim(); // Получаем значение LinkedIn
        const userEmail = userEmailInput.value.trim();

        if (!instagramUsername && !linkedinProfile && !userEmail) { // Обновлено условие
            displayStatus('Please enter at least one of: Instagram username, LinkedIn profile, or Email.', 'error');
            instagramUsernameInput.style.borderColor = 'red';
            linkedinProfileInput.style.borderColor = 'red'; // Выделяем LinkedIn
            userEmailInput.style.borderColor = 'red';
            return;
        }

        // Сохраняем username, LinkedIn и email в localStorage
        localStorage.setItem('hifeUsername', instagramUsername);
        localStorage.setItem('hifeLinkedin', linkedinProfile); // Сохраняем LinkedIn
        localStorage.setItem('hifeEmail', userEmail);

        const formData = new FormData();
        formData.append('video', selectedFile);
        if (instagramUsername) {
            formData.append('instagram_username', instagramUsername);
        }
        if (linkedinProfile) {
            formData.append('linkedin_profile', linkedinProfile); // Отправляем LinkedIn на бэкенд
        }
        if (userEmail) {
            formData.append('email', userEmail);
        }

        // Обновляем UI для начала загрузки
        displayStatus('Starting upload...', 'info');
        showProgressBar();
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        uploadButton.disabled = true;
        selectFilesButton.disabled = true;
        instagramUsernameInput.disabled = true;
        linkedinProfileInput.disabled = true; // Деактивируем LinkedIn
        userEmailInput.disabled = true;
        resultsButton.style.display = 'none';

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
                resetUploadUI();
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId;
                    displayStatus(`Upload successful! Task ID: ${taskId}. Redirecting to results...`, 'completed');
                    
                    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    uploadedVideos.push({
                        id: taskId,
                        original_filename: selectedFile.name,
                        status: 'pending',
                        timestamp: new Date().toISOString()
                    });
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                    setTimeout(() => {
                        window.location.href = 'results.html';
                    }, 2000);
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
        uploadButton.disabled = true;
        selectFilesButton.disabled = false;
        instagramUsernameInput.disabled = false;
        linkedinProfileInput.disabled = false; // Активируем LinkedIn
        userEmailInput.disabled = false;
        hideProgressBar();
        selectedFile = null;
        if (localStorage.getItem('hifeUsername') || localStorage.getItem('hifeLinkedin') || localStorage.getItem('hifeEmail')) { // Обновлено условие
            resultsButton.style.display = 'inline-block';
        }
    }
});
