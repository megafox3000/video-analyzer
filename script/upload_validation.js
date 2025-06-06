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
            } else {
                file._bubbleImgElement.src = 'assets/video_placeholder.png'; // Возвращаем к общему плейсхолдеру
                file._bubbleImgElement.alt = 'Video Preview';
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
            for (const file of Array.from(videoInput.files)) {
                // Проверяем флаг валидности, установленный в процессе валидации
                if (file._isValidFlag === false) {
                    allSelectedFilesAreValid = false;
                    break;
                }
            }
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
        if (selectFilesButton && !selectFilesButton.disabled && generalStatusMessage &&
            generalStatusMessage.style.color === 'var(--status-error-color)' &&
            !generalStatusMessage.textContent.includes('too long') && // Проверяем сообщения о длине
            !generalStatusMessage.textContent.includes('too large') &&
            !generalStatusMessage.textContent.includes('failed validation')) { // Проверяем общее сообщение о неудачной валидации
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
                // Создаем элемент предпросмотра по шаблону с results.html
                const previewBubble = document.createElement('div');
                previewBubble.className = 'preview-bubble media-bubble';
                previewBubble.style.cursor = 'default';

                const imgElement = document.createElement('img');
                imgElement.className = 'bubble-preview-img';
                imgElement.src = 'assets/video_placeholder.png'; // Общий плейсхолдер
                imgElement.alt = 'Video Preview';

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
                    // updateFileBubbleStatus(file, `Too large. Max ${MAX_VIDEO_SIZE_MB} MB.`, 'error'); // Не обновляем пузырь сразу
                    file._isValidFlag = false; // Отмечаем файл как невалидный
                    anyFileFailedInitialCheck = true; // Устанавливаем флаг, что есть ошибки
                } else {
                    filesToValidateMetadata.push(file); // Добавляем файл в очередь на проверку метаданных
                }
            });
            // --- Конец создания предпросмотров ---

            if (anyFileFailedInitialCheck) {
                displayGeneralStatus(`Some videos failed initial size validation. Please select other files.`, 'error');
                // Обновляем статусы в пузырях для тех, что не прошли проверку размера
                filesToUpload.forEach(file => {
                    if (file.size > MAX_VIDEO_SIZE_BYTES) {
                        updateFileBubbleStatus(file, `Too large. Max ${MAX_VIDEO_SIZE_MB} MB.`, 'error');
                    }
                });

                if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                filesToUpload = []; // Очищаем очередь, так как есть невалидные файлы
                if (videoInput) videoInput.value = ''; // Сброс, если невалидно
                validateInputs();
                return;
            }


            let validationsCompleted = 0;
            const totalFilesForValidation = filesToValidateMetadata.length;

            if (totalFilesForValidation === 0 && filesToUpload.length > 0) {
                 // Эта ветка означает, что все выбранные файлы не прошли проверку размера
                 // И это уже обработано выше с 'anyFileFailedInitialCheck'
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
                const objectURL = URL.createObjectURL(file);
                tempVideoElement.src = objectURL;

                tempVideoElement.onloadedmetadata = () => {
                    const videoDuration = tempVideoElement.duration;
                    URL.revokeObjectURL(objectURL); // Освобождаем память сразу после получения метаданных

                    if (isNaN(videoDuration) || videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                        file._isValidFlag = false;
                    }

                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        // После завершения всех проверок метаданных, обновляем пузыри
                        const finalAllFilesValid = filesToUpload.every(f => f._isValidFlag);
                        filesToUpload.forEach(f => {
                            if (f._isValidFlag) {
                                updateFileBubbleStatus(f, 'Ready to upload.', 'success');
                            } else {
                                // Если файл невалиден по длительности (или уже по размеру)
                                // и статус в пузыре еще не "error", то обновляем
                                if (!f._statusMessageBubbleElement.classList.contains('status-error')) {
                                    updateFileBubbleStatus(f, `Too long. Max ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`, 'error');
                                }
                            }
                        });


                        if (finalAllFilesValid) {
                            displayGeneralStatus(`All ${filesToUpload.length} videos are ready for upload. Click "Transfer your Video(s)".`, 'completed');
                            if (selectFilesButton) selectFilesButton.textContent = 'Transfer your Video(s)';
                            validateInputs();
                        } else {
                            displayGeneralStatus(`Some videos failed validation. Please select other files.`, 'error');
                            filesToUpload = filesToUpload.filter(f => f._isValidFlag); // Удаляем невалидные из очереди
                            if (videoInput) videoInput.value = ''; // Сброс, если есть невалидные
                            if (selectFilesButton) selectFilesButton.textContent = 'Choose your Video(s)';
                            validateInputs();
                        }
                    }
                };
                tempVideoElement.onerror = () => {
                    URL.revokeObjectURL(objectURL); // Освобождаем память в случае ошибки
                    file._isValidFlag = false; // Отмечаем файл как невалидный
                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        // После завершения всех проверок, обновляем пузыри
                        filesToUpload.forEach(f => {
                            if (!f._isValidFlag && !f._statusMessageBubbleElement.classList.contains('status-error')) {
                                updateFileBubbleStatus(f, `Metadata error. File might be corrupted.`, 'error');
                            }
                        });

                        displayGeneralStatus(`Some videos failed validation. Please select other files.`, 'error');
                        filesToUpload = filesToUpload.filter(f => f._isValidFlag); // Удаляем невалидные из очереди
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
            // Обновляем статус в индивидуальном пузыре файла на сетевую ошибку
            updateFileBubbleStatus(file, 'Network error!', 'error'); // Краткое сообщение в пузыре

            displayGeneralStatus(`Network error during upload for video ${currentFileIndex + 1} of ${filesToUpload.filter(f => f._isValidFlag).length} ("${file.name}").`, 'error');
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
