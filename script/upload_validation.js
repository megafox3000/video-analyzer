// В начале вашего скрипта/upload_validation.js
// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');
const existingLinkedin = localStorage.getItem('hifeLinkedin');

// If user data AND uploaded videos exist, redirect to results.html
// Corrected: Added try...catch for safer JSON parsing
if ((existingUsername || existingEmail || existingLinkedin) && existingUploadedVideos) {
    try {
        const parsedVideos = JSON.parse(existingUploadedVideos);
        if (parsedVideos.length > 0) {
            window.location.replace('results.html');
        }
    } catch (e) {
        console.error("Error parsing localStorage 'uploadedVideos':", e);
        // If data is corrupted, do not redirect and allow user to start fresh
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
    let filesToUpload = []; // Массив для хранения файлов, ожидающих загрузки (включая невалидные для отображения в превью)
    let currentFileIndex = 0; // Индекс текущего загружаемого файла (среди валидных)
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

    // Обновляет статусное сообщение внутри конкретного пузыря предпросмотра файла
    // Используется для установки конечного статуса после валидации или загрузки
    function updateFileBubbleStatus(file, message, type) {
        if (file._statusMessageBubbleElement) {
            file._statusMessageBubbleElement.textContent = message;
            file._statusMessageBubbleElement.className = `status-message-bubble status-${type}`;
        }
        if (file._bubbleImgElement) {
            if (type === 'error') {
                file._bubbleImgElement.src = 'assets/error_placeholder.png';
                file._bubbleImgElement.alt = 'Processing Error';
            } else if (type === 'success') {
                // Можно оставить текущее превью или показать значок успеха, если нужно
            }
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
            // Проверяем флаг валидности, установленный в процессе валидации
            // Для этой функции нам нужно только, чтобы хоть один файл был невалиден
            // чтобы отключить кнопку.
            allSelectedFilesAreValid = filesToUpload.every(file => file._isValidFlag);
        }

        if (selectFilesButton) {
            selectFilesButton.disabled = !(anyFieldFilled && (!filesSelected || allSelectedFilesAreValid));

            // Логика изменения текста кнопки
            if (anyFieldFilled && filesSelected && allSelectedFilesAreValid && currentFileIndex === 0) {
                selectFilesButton.textContent = 'Transfer your Video(s)';
            } else if (!filesSelected && anyFieldFilled) {
                selectFilesButton.textContent = 'Choose your Video(s)';
            } else if (!anyFieldFilled) {
                selectFilesButton.textContent = 'Choose your Video(s)';
            }
        }

        // Очистка статусных сообщений об ошибках, если кнопка не отключена
        // и сообщение не связано с длительностью или размером
        if (generalStatusMessage && selectFilesButton && !selectFilesButton.disabled &&
            generalStatusMessage.classList.contains('status-error') &&
            !generalStatusMessage.textContent.includes('too long') &&
            !generalStatusMessage.textContent.includes('too large') &&
            !generalStatusMessage.textContent.includes('failed validation')) {
            generalStatusMessage.textContent = '';
            generalStatusMessage.className = 'status-message'; // Сброс класса
        }
    }

    // --- Инициализация при загрузке DOM ---
    updateUploadedVideosList();
    checkFinishButtonStatus();
    resetProgressBar(); // Убедитесь, что прогресс-бар скрыт при загрузке страницы
    clearPreviews(); // Очищаем предпросмотр при загрузке страницы

    // Установка начального текста кнопки и состояния
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

            // --- Создание предпросмотров ---
            if (selectedFilesPreviewContainer) {
                selectedFilesPreviewContainer.innerHTML = ''; // Очищаем контейнер
            }
            if (selectedFilesPreviewSection) {
                selectedFilesPreviewSection.style.display = 'block'; // Показываем секцию предпросмотра
            }

            let filesToValidateMetadata = [];
            let anyFileFailedInitialCheck = false; // Флаг для определения, есть ли ошибки на ранней стадии

            filesToUpload.forEach(file => {
                // Создаем элемент предпросмотра по шаблону
                const previewBubble = document.createElement('div');
                previewBubble.className = 'preview-bubble media-bubble';
                previewBubble.style.cursor = 'default';

                const imgElement = document.createElement('img'); // Используем img для универсального превью
                imgElement.className = 'bubble-preview-img';
                
                const fileObjectURL = URL.createObjectURL(file); 
                imgElement.src = fileObjectURL; 
                imgElement.alt = 'File Preview';
                objectURLs.push(fileObjectURL); // Добавляем URL в массив для последующего отзыва

                // Логика для получения кадра видео или отображения изображения
                if (file.type.startsWith('video/')) {
                    const tempVideoElement = document.createElement('video');
                    tempVideoElement.preload = 'metadata';
                    tempVideoElement.src = fileObjectURL; // Используем тот же URL

                    tempVideoElement.onloadeddata = () => { // Используем onloadeddata, чтобы убедиться, что достаточно данных для кадра
                        try {
                            tempVideoElement.currentTime = 1; // Попытка получить кадр с 1-й секунды
                        } catch (e) {
                            console.warn(`Error setting currentTime for video thumbnail: ${file.name}`, e);
                            imgElement.src = 'assets/video_placeholder.png'; // Возвращаемся к плейсхолдеру
                            URL.revokeObjectURL(fileObjectURL); // Освобождаем память
                        }
                    };

                    tempVideoElement.onseeked = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            const context = canvas.getContext('2d');
                            // Устанавливаем размеры canvas на основе размеров видео, если они доступны
                            canvas.width = tempVideoElement.videoWidth || 128; // Default width
                            canvas.height = tempVideoElement.videoHeight || 72; // Default height
                            context.drawImage(tempVideoElement, 0, 0, canvas.width, canvas.height);
                            imgElement.src = canvas.toDataURL('image/jpeg'); // Используем кадр как источник
                        } catch (e) {
                            console.warn(`Error generating thumbnail for video: ${file.name}`, e);
                            imgElement.src = 'assets/video_placeholder.png'; // Возвращаемся к плейсхолдеру
                        } finally {
                            URL.revokeObjectURL(fileObjectURL); // Освобождаем память после получения кадра
                        }
                    };

                    tempVideoElement.onerror = () => {
                        console.warn(`Could not load video metadata or generate thumbnail for: ${file.name}`);
                        imgElement.src = 'assets/video_placeholder.png'; // Возвращаемся к плейсхолдеру
                        URL.revokeObjectURL(fileObjectURL); // Все равно отзываем URL
                    };
                    // Нет необходимости прикреплять tempVideoElement к DOM
                } else if (file.type.startsWith('image/')) {
                    // Для изображений imgElement.src уже установлен на fileObjectURL, что правильно.
                } else {
                    // Для других типов файлов или в случае ошибки/неподдерживаемого типа
                    imgElement.src = 'assets/video_placeholder.png'; // Возвращаемся к общему плейсхолдеру
                    URL.revokeObjectURL(fileObjectURL); // Отзываем URL, так как он не используется для превью
                }

                const textOverlay = document.createElement('div');
                textOverlay.className = 'bubble-text-overlay';

                const titleOverlay = document.createElement('h3');
                titleOverlay.className = 'bubble-title-overlay';
                titleOverlay.textContent = file.name;

                const statusMessageBubble = document.createElement('p');
                statusMessageBubble.className = 'status-message-bubble status-info'; // Начальный статус
                statusMessageBubble.textContent = 'Validating...'; // Всегда начинаем с "Validating..."

                const bubbleActions = document.createElement('div'); // Пустой контейнер для действий
                bubbleActions.className = 'bubble-actions';

                textOverlay.appendChild(titleOverlay);
                textOverlay.appendChild(statusMessageBubble);
                textOverlay.appendChild(bubbleActions);

                previewBubble.appendChild(imgElement);
                previewBubble.appendChild(textOverlay);

                if (selectedFilesPreviewContainer) {
                    selectedFilesPreviewContainer.appendChild(previewBubble);
                }

                // Привязываем DOM-элементы к объекту файла для удобства обновления конечного статуса
                file._previewBubbleElement = previewBubble;
                file._statusMessageBubbleElement = statusMessageBubble;
                file._bubbleImgElement = imgElement;
                file._isValidFlag = true; // Начальное состояние валидности

                // Проверка размера файла сразу
                if (file.size > MAX_VIDEO_SIZE_BYTES) {
                    file._isValidFlag = false; // Отмечаем файл как невалидный
                    anyFileFailedInitialCheck = true; // Устанавливаем флаг, что есть ошибки
                    updateFileBubbleStatus(file, `Too large. Max ${MAX_VIDEO_SIZE_MB} MB.`, 'error');
                } else {
                    filesToValidateMetadata.push(file); // Добавляем файл в очередь на проверку метаданных
                }
            });
            // --- Конец создания предпросмотров ---

            if (anyFileFailedInitialCheck) {
                displayGeneralStatus(`Some videos failed initial size validation. Please select other files.`, 'error');
                // filesToUpload = []; // Очищать filesToUpload здесь не нужно, т.к. мы показываем невалидные файлы
                if (videoInput) videoInput.value = ''; // Сброс, если невалидно
                validateInputs();
                return;
            }


            let validationsCompleted = 0;
            const totalFilesForValidation = filesToValidateMetadata.length;

            if (totalFilesForValidation === 0 && filesToUpload.length > 0) {
                    // Эта ветка означает, что все выбранные файлы не прошли проверку размера
                    // И это уже обработано выше с 'anyFileFailedInitialCheck'
                    validateInputs(); // Убедиться, что кнопка обновлена
                    return;
            } else if (filesToUpload.length === 0) { // Ничего не выбрано
                    validateInputs();
                    if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                    clearPreviews();
                    return;
            }

            displayGeneralStatus('Checking selected videos for duration...', 'info');

            filesToValidateMetadata.forEach((file) => {
                const tempVideoElement = document.createElement('video');
                tempVideoElement.preload = 'metadata';
                // Здесь создаем новый URL для проверки метаданных.
                // fileObjectURL уже либо отозван (для видео с кадром), либо его жизнь управляется objectURLs массивом.
                const metadataObjectURL = URL.createObjectURL(file); 
                tempVideoElement.src = metadataObjectURL;

                tempVideoElement.onloadedmetadata = () => {
                    const videoDuration = tempVideoElement.duration;
                    URL.revokeObjectURL(metadataObjectURL); // Освобождаем память сразу после получения метаданных

                    if (isNaN(videoDuration) || videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                        file._isValidFlag = false;
                        updateFileBubbleStatus(file, `Too long. Max ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`, 'error');
                    }

                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        const finalAllFilesValid = filesToUpload.every(f => f._isValidFlag);
                        
                        if (finalAllFilesValid) {
                            displayGeneralStatus(`All ${filesToUpload.length} videos are ready for upload. Click "Transfer your Video(s)".`, 'completed');
                            if (selectFilesButton) selectFilesButton.textContent = 'Transfer your Video(s)';
                            validateInputs();
                        } else {
                            displayGeneralStatus(`Some videos failed validation. Please select other files.`, 'error');
                            // Очищаем videoInput, если есть невалидные
                            if (videoInput) videoInput.value = '';
                            if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                            validateInputs();
                        }
                    }
                };
                tempVideoElement.onerror = () => {
                    URL.revokeObjectURL(metadataObjectURL); // Освобождаем память в случае ошибки
                    file._isValidFlag = false; // Отмечаем файл как невалидный
                    updateFileBubbleStatus(file, `Metadata error. File might be corrupted.`, 'error');
                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        displayGeneralStatus(`Some videos failed validation. Please select other files.`, 'error');
                        if (videoInput) videoInput.value = '';
                        if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                        validateInputs();
                    }
                };
            });
        });
    }

    // Функция для загрузки следующего файла в очереди
    function uploadNextFile() {
        // Фильтруем файлы, чтобы загружать только те, что прошли валидацию
        const validFilesToUpload = filesToUpload.filter(f => f._isValidFlag);

        if (currentFileIndex < validFilesToUpload.length) {
            const file = validFilesToUpload[currentFileIndex];
            const username = instagramInput ? instagramInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const linkedin = linkedinInput ? linkedinInput.value.trim() : '';

            uploadVideo(file, username, email, linkedin);
        } else {
            // Все валидные файлы загружены. Теперь перенаправляем на results.html
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
            // А также, если кнопка всё ещё говорит "Choose your Video(s)"
            if (filesToUpload.length === 0 || (videoInput && videoInput.files.length === 0) || selectFilesButton.textContent === 'Choose your Video(s)') {
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
        displayGeneralStatus(`Uploading video ${currentFileIndex + 1} of ${filesToUpload.filter(f => f._isValidFlag).length}: ${file.name}...`, 'info');

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
                // Обновляем только общее сообщение о статусе
                displayGeneralStatus(`Uploading video ${currentFileIndex + 1} of ${filesToUpload.filter(f => f._isValidFlag).length}: ${file.name} (${percent.toFixed(0)}%)`, 'info');
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

                // Обновляем статус в индивидуальном пузыре файла на "Uploaded successfully!" после завершения
                updateFileBubbleStatus(file, 'Uploaded successfully!', 'success');

                currentFileIndex++;
                uploadNextFile();

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                // Обновляем статус в индивидуальном пузыре файла на ошибку
                updateFileBubbleStatus(file, `Upload failed!`, 'error'); // Краткое сообщение в пузыре

                displayGeneralStatus(`Upload error for video ${currentFileIndex + 1} of ${filesToUpload.filter(f => f._isValidFlag).length} ("${file.name}"): ${error.error || 'Unknown error'}`, 'error');
                resetProgressBar();
                if (selectFilesButton) selectFilesButton.disabled = false;
                if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                // filesToUpload = []; // Не очищаем filesToUpload здесь, чтобы пузыри оставались
                currentFileIndex = 0; // Сбрасываем индекс для новой попытки
                if (videoInput) videoInput.value = ''; // Сброс, если есть ошибка
                // clearPreviews(); // Не очищаем предпросмотры, чтобы пользователь видел ошибки
                validateInputs();
            }
        };

        currentUploadXhr.onerror = function() {
            if (selectFilesButton) selectFilesButton.disabled = false;
            if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
            // Обновляем статус в индивидуальном пузыре файла на сетевую ошибку
            updateFileBubbleStatus(file, 'Network error!', 'error'); // Краткое сообщение в пузыре

            displayGeneralStatus(`Network error during upload for video ${currentFileIndex + 1} of ${filesToUpload.filter(f => f._isValidFlag).length} ("${file.name}").`, 'error');
            resetProgressBar();
            // filesToUpload = []; // Не очищаем filesToUpload здесь, чтобы пузыри оставались
            currentFileIndex = 0; // Сбрасываем индекс для новой попытки
            if (videoInput) videoInput.value = ''; // Сброс, если есть ошибка
            // clearPreviews(); // Не очищаем предпросмотры, чтобы пользователь видел ошибки
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
