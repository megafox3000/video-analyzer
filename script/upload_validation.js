// В начале вашего скрипта/upload_validation.js
// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// ВНИМАНИЕ: Логика редиректа теперь проверяет только наличие данных в localStorage
// без попытки манипулировать DOM до его полной загрузки.
const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');
const existingLinkedin = localStorage.getItem('hifeLinkedin');

// Если данные пользователя И загруженные видео существуют, перенаправляем на results.html
if ((existingUsername || existingEmail || existingLinkedin) && existingUploadedVideos) {
    try {
        const parsedVideos = JSON.parse(existingUploadedVideos);
        if (parsedVideos.length > 0) {
            // Перенаправляем, если есть загруженные видео
            window.location.replace('results.html');
        }
    } catch (e) {
        console.error("Error parsing localStorage 'uploadedVideos':", e);
        // Если данные повреждены, не перенаправляем и позволяем пользователю начать заново
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Получение DOM-элементов
    const instagramInput = document.getElementById('instagramInput');
    const emailInput = document.getElementById('emailInput');
    const linkedinInput = document.getElementById('linkedinInput');
    const videoInput = document.getElementById('videoFileInput');
    const selectFilesButton = document.getElementById('selectFilesButton');
    const finishUploadButton = document.getElementById('finishUploadButton');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const uploadedVideosList = document.getElementById('uploadedVideosList');

    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // Контейнеры для предварительного просмотра файлов
    const selectedFilesPreviewSection = document.querySelector('.selected-files-preview-section');
    const selectedFilesPreviewContainer = document.getElementById('selectedFilesPreviewContainer');

    // Константы валидации
    const MAX_VIDEO_SIZE_MB = 100;
    const MAX_VIDEO_DURATION_SECONDS = 600; // 10 минут
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

    let currentUploadXhr = null; // Для отслеживания текущего запроса XMLHttpRequest
    let filesToUpload = []; // Массив для хранения файлов, ожидающих загрузки
    let currentFileIndex = 0; // Индекс текущего загружаемого файла
    let objectURLs = []; // Массив для хранения Object URLs для последующего освобождения памяти

    // Загрузка сохраненных данных из localStorage
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let hifeEmail = localStorage.getItem('hifeEmail') || '';
    let hifeLinkedin = localStorage.getItem('hifeLinkedin') || '';

    // Инициализация полей ввода сохраненными данными
    if (instagramInput) instagramInput.value = hifeUsername;
    if (emailInput) emailInput.value = hifeEmail;
    if (linkedinInput) linkedinInput.value = hifeLinkedin;

    // --- Вспомогательные функции ---

    // Функция для очистки всех предыдущих предпросмотров и Object URLs
    function clearPreviews() {
        if (selectedFilesPreviewContainer) {
            selectedFilesPreviewContainer.innerHTML = '';
        }
        objectURLs.forEach(url => URL.revokeObjectURL(url)); // Отзываем URL для освобождения памяти
        objectURLs = []; // Сбрасываем массив
        if (selectedFilesPreviewSection) {
            selectedFilesPreviewSection.style.display = 'none'; // Скрываем секцию предпросмотра
        }
    }

    // Сброс состояния прогресс-бара
    function resetProgressBar() {
        if (progressBarContainer) progressBarContainer.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
    }

    // Обновление списка загруженных видео на странице
    function updateUploadedVideosList() {
        if (uploadedVideosList) {
            uploadedVideosList.innerHTML = '';
            if (uploadedVideos.length === 0) {
                uploadedVideosList.innerHTML = '<p>No videos uploaded yet.</p>';
            } else {
                uploadedVideos.forEach(video => {
                    const li = document.createElement('li');
                    li.textContent = `${video.originalFilename} (ID: ${video.taskId}) - Status: ${video.status}`;
                    uploadedVideosList.appendChild(li);
                });
            }
        }
    }

    // Проверка статуса кнопки "Finish Upload"
    function checkFinishButtonStatus() {
        if (finishUploadButton) {
            if (uploadedVideos.length === 0) {
                finishUploadButton.style.display = 'none';
            } else {
                finishUploadButton.style.display = 'block';
            }
        }
    }

    // Отображение общего статусного сообщения
    function displayGeneralStatus(message, type) {
        if (generalStatusMessage) {
            generalStatusMessage.textContent = message;
            generalStatusMessage.className = `status-message status-${type}`;
        }
    }

    // Валидация полей ввода и управление кнопкой выбора файлов
    function validateInputs() {
        const anyFieldFilled = (instagramInput && instagramInput.value.trim() !== '') ||
                               (emailInput && emailInput.value.trim() !== '') ||
                               (linkedinInput && linkedinInput.value.trim() !== '');

        const filesSelected = videoInput && videoInput.files.length > 0;
        let allSelectedFilesAreValid = true;

        if (filesSelected) {
            for (const file of Array.from(videoInput.files)) {
                if (file.size > MAX_VIDEO_SIZE_BYTES) {
                    allSelectedFilesAreValid = false;
                    break;
                }
            }
        }

        if (selectFilesButton) {
            selectFilesButton.disabled = !(anyFieldFilled && (!filesSelected || allSelectedFilesAreValid));

            if (anyFieldFilled && filesSelected && allSelectedFilesAreValid && currentFileIndex === 0) {
                selectFilesButton.textContent = 'Transfer your Video(s)';
            } else if (!filesSelected && anyFieldFilled) {
                selectFilesButton.textContent = 'Choose your Video(s)';
            } else if (!anyFieldFilled) {
                selectFilesButton.textContent = 'Choose your Video(s)';
            }
        }

        // Очистка статусных сообщений об ошибках, если кнопка не отключена
        if (selectFilesButton && !selectFilesButton.disabled && generalStatusMessage &&
            generalStatusMessage.style.color === 'var(--status-error-color)' &&
            !generalStatusMessage.textContent.includes('too long') && // Проверяем сообщения о длине
            !generalStatusMessage.textContent.includes('too large')) { // Проверяем сообщения о размере
            generalStatusMessage.textContent = '';
        }
    }

    // --- Инициализация при загрузке DOM ---
    updateUploadedVideosList();
    checkFinishButtonStatus();
    resetProgressBar(); // Убедитесь, что прогресс-бар скрыт при загрузке страницы
    clearPreviews(); // Очищаем предпросмотр при загрузке страницы

    // Установка начального текста кнопки
    if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
    validateInputs(); // Вызов при загрузке страницы для установки начального состояния кнопки

    // --- Обработчики событий ---

    // Обработчики ввода для полей пользователя
    if (instagramInput) {
        instagramInput.addEventListener('input', () => {
            const value = instagramInput.value.trim();
            localStorage.setItem('hifeUsername', value);
            hifeUsername = value;
            if (generalStatusMessage) generalStatusMessage.textContent = '';
            validateInputs();
        });
    }

    if (emailInput) {
        emailInput.addEventListener('input', () => {
            const value = emailInput.value.trim();
            localStorage.setItem('hifeEmail', value);
            hifeEmail = value;
            if (generalStatusMessage) generalStatusMessage.textContent = '';
            validateInputs();
        });
    }

    if (linkedinInput) {
        linkedinInput.addEventListener('input', () => {
            const value = linkedinInput.value.trim();
            localStorage.setItem('hifeLinkedin', value);
            hifeLinkedin = value;
            if (generalStatusMessage) generalStatusMessage.textContent = '';
            validateInputs();
        });
    }

    // Обработчик выбора файлов
    if (videoInput) {
        videoInput.addEventListener('change', () => {
            if (generalStatusMessage) generalStatusMessage.textContent = '';

            clearPreviews(); // Очистка предыдущих предпросмотров

            filesToUpload = Array.from(videoInput.files);
            currentFileIndex = 0; // Сброс индекса для новой очереди загрузки

            if (filesToUpload.length === 0) {
                validateInputs();
                if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                clearPreviews(); // Скрываем секцию предпросмотра, если файлы отменены
                return;
            }

            let allFilesValid = true;
            let filesToValidateMetadata = [];

            // --- Создание предпросмотров ---
            if (selectedFilesPreviewContainer) {
                selectedFilesPreviewContainer.innerHTML = ''; // Очищаем контейнер
            }
            if (selectedFilesPreviewSection) {
                selectedFilesPreviewSection.style.display = 'block'; // Показываем секцию предпросмотра
            }

            filesToUpload.forEach(file => {
                const previewBubble = document.createElement('div');
                previewBubble.className = 'preview-bubble media-bubble';

                const videoElement = document.createElement('video');
                const objectURL = URL.createObjectURL(file);
                objectURLs.push(objectURL); // Сохраняем URL для последующего отзыва

                videoElement.src = objectURL;
                videoElement.autoplay = true;
                videoElement.loop = true;
                videoElement.muted = true;
                videoElement.playsinline = true;
                videoElement.preload = 'metadata';

                const fileNameOverlay = document.createElement('div');
                fileNameOverlay.className = 'file-name-overlay';
                fileNameOverlay.textContent = file.name;

                previewBubble.appendChild(videoElement);
                previewBubble.appendChild(fileNameOverlay);
                if (selectedFilesPreviewContainer) {
                    selectedFilesPreviewContainer.appendChild(previewBubble);
                }
            });
            // --- Конец создания предпросмотров ---

            for (const file of filesToUpload) {
                if (file.size > MAX_VIDEO_SIZE_BYTES) {
                    displayGeneralStatus(`Video "${file.name}" is too large. Max ${MAX_VIDEO_SIZE_MB} MB.`, 'error');
                    if (videoInput) videoInput.value = ''; // Сброс всех выбранных файлов, если хотя бы один невалиден
                    allFilesValid = false;
                    break;
                }
                filesToValidateMetadata.push(file);
            }

            if (!allFilesValid) {
                validateInputs();
                if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                filesToUpload = []; // Очищаем очередь, так как есть невалидные файлы
                clearPreviews(); // Очищаем предпросмотры, если валидация файлов не удалась
                return;
            }

            let validationsCompleted = 0;
            const totalFilesForValidation = filesToValidateMetadata.length;

            if (totalFilesForValidation === 0) {
                validateInputs();
                if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                clearPreviews();
                return;
            }

            displayGeneralStatus('Checking selected videos...', 'info');

            filesToValidateMetadata.forEach((file) => {
                const tempVideoElement = document.createElement('video');
                tempVideoElement.preload = 'metadata';
                tempVideoElement.src = URL.createObjectURL(file);

                tempVideoElement.onloadedmetadata = () => {
                    const videoDuration = tempVideoElement.duration;
                    URL.revokeObjectURL(tempVideoElement.src); // Освобождаем память сразу после получения метаданных

                    if (isNaN(videoDuration) || videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                        displayGeneralStatus(`Video "${file.name}" is too long. Max ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`, 'error');
                        if (videoInput) videoInput.value = '';
                        allFilesValid = false;
                    }

                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        if (allFilesValid) {
                            displayGeneralStatus(`All ${filesToUpload.length} videos are ready for upload. Click "Transfer your Video(s)".`, 'completed');
                            if (selectFilesButton) selectFilesButton.textContent = 'Transfer your Video(s)';
                            validateInputs();
                        } else {
                            displayGeneralStatus(`Some videos failed validation. Please select other files.`, 'error');
                            filesToUpload = [];
                            if (videoInput) videoInput.value = ''; // Сброс, если невалидно
                            if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                            clearPreviews(); // Очищаем предпросмотры, если валидация не удалась
                            validateInputs();
                        }
                    }
                };
                tempVideoElement.onerror = () => {
                    URL.revokeObjectURL(tempVideoElement.src); // Освобождаем память в случае ошибки
                    displayGeneralStatus(`Failed to load video metadata "${file.name}". The file might be corrupted or not a video.`, 'error');
                    if (videoInput) videoInput.value = '';
                    allFilesValid = false;
                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        filesToUpload = [];
                        if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                        clearPreviews(); // Очищаем предпросмотры в случае ошибки метаданных
                        validateInputs();
                    }
                };
            });
        });
    }

    // Функция для загрузки следующего файла в очереди
    function uploadNextFile() {
        if (currentFileIndex < filesToUpload.length) {
            const file = filesToUpload[currentFileIndex];
            const username = instagramInput ? instagramInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const linkedin = linkedinInput ? linkedinInput.value.trim() : '';

            uploadVideo(file, username, email, linkedin);
        } else {
            // Все файлы загружены. Теперь перенаправляем на results.html
            displayGeneralStatus('All videos successfully uploaded!', 'completed');
            if (selectFilesButton) selectFilesButton.disabled = false;
            if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
            if (videoInput) videoInput.value = '';
            resetProgressBar();
            clearPreviews(); // Очищаем предпросмотры перед перенаправлением
            window.location.replace('results.html');
        }
    }

    // Обработчик клика по кнопке выбора/передачи файлов
    if (selectFilesButton) {
        selectFilesButton.addEventListener('click', async () => {
            const username = instagramInput ? instagramInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const linkedin = linkedinInput ? linkedinInput.value.trim() : '';

            if (!username && !email && !linkedin) {
                displayGeneralStatus('Please enter Instagram ID, Email, or LinkedIn.', 'error');
                validateInputs();
                return;
            }

            // Если файлов в очереди нет (или инпут пуст), открываем диалог выбора файлов
            if (filesToUpload.length === 0 || (videoInput && videoInput.files.length === 0)) {
                displayGeneralStatus('Select video file(s)...', 'info');
                if (videoInput) videoInput.click();
                return;
            }

            // Если файлы уже выбраны и провалидированы (и кнопка уже говорит "Transfer your Video(s)"),
            // тогда начинаем загрузку
            if (selectFilesButton) selectFilesButton.disabled = true; // Отключаем кнопку во время загрузки
            uploadNextFile();
        });
    }


    // Функция загрузки видео на бэкенд
    function uploadVideo(file, username, email, linkedin) {
        displayGeneralStatus(`Uploading video ${currentFileIndex + 1} of ${filesToUpload.length}: ${file.name}...`, 'info');

        if (progressBarContainer) progressBarContainer.style.display = 'flex';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';

        const formData = new FormData();
        formData.append('video', file);
        if (username) {
            formData.append('instagram_username', username);
        }
        if (email) {
            formData.append('email', email);
        }
        if (linkedin) {
            formData.append('linkedin_profile', linkedin);
        }

        currentUploadXhr = new XMLHttpRequest();
        currentUploadXhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

        currentUploadXhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                if (progressBar) progressBar.style.width = `${percent.toFixed(0)}%`;
                if (progressText) progressText.textContent = `${percent.toFixed(0)}%`;
                displayGeneralStatus(`Uploading video ${currentFileIndex + 1} of ${filesToUpload.length}: ${file.name} (${percent.toFixed(0)}%)`, 'info');
            }
        });

        currentUploadXhr.onload = function() {
            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                const newVideoEntry = {
                    taskId: taskId,
                    originalFilename: response.originalFilename || file.name,
                    status: 'uploaded', // Начальный статус после загрузки
                    timestamp: new Date().toISOString(),
                    cloudinary_url: response.cloudinary_url,
                    metadata: response.metadata || {}
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                currentFileIndex++;
                uploadNextFile();

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                displayGeneralStatus(`Upload error for video ${currentFileIndex + 1} of ${filesToUpload.length} ("${file.name}"): ${error.error || 'Unknown error'}`, 'error');
                resetProgressBar();
                if (selectFilesButton) selectFilesButton.disabled = false;
                if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                filesToUpload = []; // Очищаем очередь при ошибке, чтобы пользователь мог начать заново
                currentFileIndex = 0;
                if (videoInput) videoInput.value = '';
                clearPreviews(); // Очищаем предпросмотры при ошибке загрузки
                validateInputs();
            }
        };

        currentUploadXhr.onerror = function() {
            if (selectFilesButton) selectFilesButton.disabled = false;
            if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
            displayGeneralStatus(`Network error during upload for video ${currentFileIndex + 1} of ${filesToUpload.length} ("${file.name}").`, 'error');
            resetProgressBar();
            filesToUpload = []; // Очищаем очередь при ошибке
            currentFileIndex = 0;
            if (videoInput) videoInput.value = '';
            clearPreviews(); // Очищаем предпросмотры при сетевой ошибке
            validateInputs();
        };

        currentUploadXhr.send(formData);
    }

    // Обработчик кнопки "Finish Upload"
    if (finishUploadButton) {
        finishUploadButton.addEventListener('click', () => {
            if (localStorage.getItem('uploadedVideos') && JSON.parse(localStorage.getItem('uploadedVideos')).length > 0) {
                window.location.replace('results.html');
            } else {
                displayGeneralStatus("No videos uploaded to show results.", 'pending');
            }
        });
    }
});
