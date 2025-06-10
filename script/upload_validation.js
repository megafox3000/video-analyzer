// В начале вашего скрипта/upload_validation.js
console.log("DEBUG: upload_validation.js loaded and executing.");
// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// Импортируем функцию загрузки из нового модуля
import { uploadFileToCloudinary } from './cloudinary_upload.js'; // <-- НОВОЕ

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
            // !!! ВРЕМЕННО ОТКЛЮЧЕНО для тестирования новой функциональности !!!
            // window.location.replace('results.html');
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

    // НОВЫЕ ИЗМЕНЕНИЯ ДЛЯ ОБРАБОТКИ ВИДЕО
    const processSelectedVideosButton = document.getElementById('processSelectedVideosButton');
    console.log("DEBUG: processSelectedVideosButton element:", processSelectedVideosButton);
    const connectVideosCheckbox = document.getElementById('connectVideosCheckbox');
    const processStatusMessage = document.getElementById('processStatusMessage');
    // END НОВЫЕ ИЗМЕНЕНИЯ ДЛЯ ОБРАБОТКИ ВИДЕО

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
                // НОВЫЕ ИЗМЕНЕНИЯ ДЛЯ ОБРАБОТКИ ВИДЕО
                if (processSelectedVideosButton) processSelectedVideosButton.style.display = 'none'; // Скрываем кнопку, если нет видео
            } else {
                // НОВЫЕ ИЗМЕНЕНИЯ ДЛЯ ОБРАБОТКИ ВИДЕО
                if (processSelectedVideosButton) processSelectedVideosButton.style.display = 'block'; // Показываем кнопку

                uploadedVideos.forEach(video => {
                    const li = document.createElement('li');
                    
                    // Теперь это просто отображение информации, без чекбоксов для выбора отдельных видео
                    const label = document.createElement('label');
                    label.textContent = `${video.originalFilename} (ID: ${video.id ? video.id.substring(0, 8) : 'N/A'}...) - Status: ${video.status}`;

                    li.appendChild(label);
                    uploadedVideosList.appendChild(li);
                });
            }
            updateProcessRelatedUI(); // ВЫЗЫВАЕМ НОВУЮ ФУНКЦИЮ ДЛЯ ОБНОВЛЕНИЯ UI
        }
    }

    // НОВАЯ ФУНКЦИЯ: ОБНОВЛЕНИЕ СОСТОЯНИЯ ЧЕКБОКСА ОБЪЕДИНЕНИЯ И КНОПКИ ОБРАБОТКИ
    function updateProcessRelatedUI() {
        if (!connectVideosCheckbox || !processSelectedVideosButton) return;

        // Отключаем чекбокс объединения, если загружено менее 2 видео
        if (uploadedVideos.length < 2) {
            connectVideosCheckbox.checked = false; // Сбрасываем, если неактуально
            connectVideosCheckbox.disabled = true;
            if (connectVideosCheckbox.parentElement) {
                connectVideosCheckbox.parentElement.style.opacity = '0.5'; // Визуально отключаем
                connectVideosCheckbox.parentElement.style.cursor = 'not-allowed';
            }
        } else {
            connectVideosCheckbox.disabled = false;
            if (connectVideosCheckbox.parentElement) {
                connectVideosCheckbox.parentElement.style.opacity = '1';
                connectVideosCheckbox.parentElement.style.cursor = 'pointer';
            }
        }

        // Кнопка обработки активна, если есть хотя бы одно загруженное видео
        if (uploadedVideos.length > 0) {
            processSelectedVideosButton.style.display = 'block';
        } else {
            processSelectedVideosButton.style.display = 'none';
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

    // Функция для отображения статуса обработки
    function displayProcessStatus(message, type) {
        if (processStatusMessage) {
            processStatusMessage.textContent = message;
            processStatusMessage.className = `status-message status-${type}`;
        }
    }

    /**
     * Обновляет статусное сообщение и изображение внутри конкретного пузыря предпросмотра файла.
     * @param {File} file Объект файла, к которому привязаны элементы DOM (_statusMessageBubbleElement, _bubbleImgElement).
     * @param {string} message Сообщение для отображения.
     * @param {'info' | 'success' | 'error' | 'pending'} type Тип статуса, определяющий класс CSS.
     * @param {string} [imageSrc] Необязательный путь к изображению, если нужно изменить превью (например, на иконку ошибки).
     */
    function updateFileBubbleUI(file, message, type, imageSrc = null) {
        if (file._statusMessageBubbleElement) {
            file._statusMessageBubbleElement.textContent = message;
            file._statusMessageBubbleElement.className = `status-message-bubble status-${type}`;
        }
        if (imageSrc && file._bubbleImgElement) {
            file._bubbleImgElement.src = imageSrc;
            file._bubbleImgElement.alt = `Status: ${type}`;
        } else if (type === 'error' && file._bubbleImgElement && !imageSrc) {
            // Если ошибка и нет специфичного изображения, используем плейсхолдер ошибки
            file._bubbleImgElement.src = 'assets/error_placeholder.png';
            file._bubbleImgElement.alt = 'Processing Error';
        }
        // Если success или info, и нет imageSrc, оставляем текущее превью
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
            allSelectedFilesAreValid = filesToUpload.every(file => file._isValidFlag);
        }

        if (selectFilesButton) {
            // Кнопка отключена, если нет заполненных полей ИЛИ (файлы выбраны, но есть невалидные)
            selectFilesButton.disabled = !(anyFieldFilled && (!filesSelected || allSelectedFilesAreValid));

            // Логика изменения текста кнопки
            if (anyFieldFilled && filesSelected && allSelectedFilesAreValid) {
                selectFilesButton.textContent = 'Transfer your Video(s)';
            } else {
                selectFilesButton.textContent = 'Choose your Video(s)';
            }
        }

        // Очистка общих статусных сообщений, если кнопка не отключена и сообщение не связано с длительностью/размером
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
                objectURLs.push(fileObjectURL); // Добавляем URL в массив для последующего отзыва

                // Логика для получения кадра видео или отображения изображения
                if (file.type.startsWith('video/')) {
                    const tempVideoElement = document.createElement('video');
                    tempVideoElement.preload = 'metadata';
                    tempVideoElement.src = fileObjectURL; // Используем тот же URL

                    let thumbnailGenerated = false;

                    tempVideoElement.onloadeddata = () => { // Используем onloadeddata, чтобы убедиться, что достаточно данных для кадра
                        if (!thumbnailGenerated) {
                            try {
                                tempVideoElement.currentTime = 1; // Попытка получить кадр с 1-й секунды
                            } catch (e) {
                                console.warn(`Error setting currentTime for video thumbnail: ${file.name}`, e);
                                imgElement.src = 'assets/video_placeholder.png'; // Возвращаемся к плейсхолдеру
                                URL.revokeObjectURL(fileObjectURL); // Освобождаем память
                                thumbnailGenerated = true;
                            }
                        }
                    };

                    tempVideoElement.onseeked = () => {
                        if (!thumbnailGenerated) {
                            try {
                                const canvas = document.createElement('canvas');
                                const context = canvas.getContext('2d');
                                // Устанавливаем размеры canvas на основе размеров видео, если они доступны
                                canvas.width = tempVideoElement.videoWidth || 128; // Default width
                                canvas.height = tempVideoElement.videoHeight || 72; // Default height
                                context.drawImage(tempVideoElement, 0, 0, canvas.width, canvas.height);
                                imgElement.src = canvas.toDataURL('image/jpeg'); // Используем кадр как источник
                                thumbnailGenerated = true;
                            } catch (e) {
                                console.warn(`Error generating thumbnail for video: ${file.name}`, e);
                                imgElement.src = 'assets/video_placeholder.png'; // Возвращаемся к плейсхолдеру
                            } finally {
                                URL.revokeObjectURL(fileObjectURL); // Освобождаем память после получения кадра
                            }
                        }
                    };

                    tempVideoElement.onerror = () => {
                        console.warn(`Could not load video metadata or generate thumbnail for: ${file.name}`);
                        if (!thumbnailGenerated) {
                               imgElement.src = 'assets/video_placeholder.png'; // Возвращаемся к плейсхолдеру
                               thumbnailGenerated = true;
                        }
                        URL.revokeObjectURL(fileObjectURL); // Все равно отзываем URL
                    };
                } else if (file.type.startsWith('image/')) {
                    imgElement.src = fileObjectURL; // Для изображений, src уже установлен на fileObjectURL
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
                    updateFileBubbleUI(file, `Too large. Max ${MAX_VIDEO_SIZE_MB} MB.`, 'error');
                } else {
                    filesToValidateMetadata.push(file); // Добавляем файл в очередь на проверку метаданных
                }
            });
            // --- Конец создания предпросмотров ---

            if (anyFileFailedInitialCheck) {
                displayGeneralStatus(`Some videos failed initial size validation. Please check indicated files.`, 'error');
                validateInputs(); // Обновляем состояние кнопки
                return;
            }
            let validationsCompleted = 0;
            const totalFilesForValidation = filesToValidateMetadata.length;

            if (totalFilesForValidation === 0 && filesToUpload.length > 0) {
                // Если сюда попали, значит все выбранные файлы не прошли проверку размера.
                // Это уже обработано выше с 'anyFileFailedInitialCheck'.
                validateInputs(); // Убедиться, что кнопка обновлена
                return;
            } else if (filesToUpload.length === 0) { // Ничего не выбрано
                validateInputs();
                clearPreviews();
                return;
            }

            displayGeneralStatus('Checking selected videos for duration...', 'info');

            filesToValidateMetadata.forEach((file) => {
                const tempVideoElement = document.createElement('video');
                tempVideoElement.preload = 'metadata';
                // Здесь создаем новый URL для проверки метаданных.
                const metadataObjectURL = URL.createObjectURL(file);
                tempVideoElement.src = metadataObjectURL;

                tempVideoElement.onloadedmetadata = () => {
                    const videoDuration = tempVideoElement.duration;
                    URL.revokeObjectURL(metadataObjectURL); // Освобождаем память сразу после получения метаданных

                    if (isNaN(videoDuration) || videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                        file._isValidFlag = false;
                        updateFileBubbleUI(file, `Too long. Max ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`, 'error');
                    } else {
                        updateFileBubbleUI(file, 'Ready for upload.', 'info');
                    }

                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        const finalAllFilesValid = filesToUpload.every(f => f._isValidFlag); // Проверяем все файлы в общем массиве

                        if (finalAllFilesValid) {
                            displayGeneralStatus(`All ${filesToUpload.length} videos are ready for upload. Click "Transfer your Video(s)".`, 'completed');
                            validateInputs();
                        } else {
                            // Если есть хотя бы один невалидный файл, сообщаем об этом
                            const invalidCount = filesToUpload.filter(f => !f._isValidFlag).length;
                            displayGeneralStatus(`${invalidCount} video(s) failed validation. Please check indicated files.`, 'error');
                            validateInputs();
                        }
                    }
                };
                tempVideoElement.onerror = () => {
                    URL.revokeObjectURL(metadataObjectURL); // Освобождаем память в случае ошибки
                    file._isValidFlag = false; // Отмечаем файл как невалидный
                    updateFileBubbleUI(file, `Metadata error. File might be corrupted.`, 'error');
                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        displayGeneralStatus(`Some videos failed validation. Please select other files.`, 'error');
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

            // Объект с функциями обратного вызова и DOM-элементами для uploadFileToCloudinary
            const uiCallbacks = {
                updateFileBubbleUI: (f, msg, type) => updateFileBubbleUI(f, msg, type),
                displayGeneralStatus: (msg, type) => displayGeneralStatus(msg, type),
                resetProgressBar: () => resetProgressBar(),
                selectFilesButton: selectFilesButton, // Передаем ссылку на DOM-элемент
                progressBar: progressBar,
                progressText: progressText,
                progressBarContainer: progressBarContainer
            };

            // Функции, вызываемые при успехе или ошибке загрузки
            const onUploadSuccess = (response, uploadedFile) => {
                const taskId = response.taskId;
                const newVideoEntry = {
                    id: taskId,
                    originalFilename: response.originalFilename || uploadedFile.name,
                    status: 'uploaded', // Начальный статус после загрузки
                    timestamp: new Date().toISOString(),
                    cloudinary_url: response.cloudinary_url,
                    metadata: response.metadata || {}
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                // Обновляем статус в индивидуальном пузыре файла на "Uploaded successfully!" после завершения
                updateFileBubbleUI(uploadedFile, 'Uploaded successfully!', 'success');

                currentFileIndex++;
                uploadNextFile(); // Запускаем загрузку следующего файла
            };

            const onUploadError = (error, erroredFile) => {
                // Обновляем статус в индивидуальном пузыре файла на ошибку
                updateFileBubbleUI(erroredFile, `Upload failed!`, 'error'); // Краткое сообщение в пузыре

                displayGeneralStatus(`Upload error for video "${erroredFile.name}": ${error.error || 'Unknown error'}. Please try again.`, 'error');
                // Не очищаем filesToUpload здесь, чтобы пузыри оставались
                currentFileIndex = 0; // Сбрасываем индекс для новой попытки
                validateInputs(); // Обновляем состояние кнопки "Transfer"
            };

            // Вызываем перенесенную функцию загрузки
            uploadFileToCloudinary(file, username, email, linkedin, uiCallbacks, onUploadSuccess, onUploadError);

        } else {
            // Все валидные файлы загружены. Обновляем список и сообщения.
            displayGeneralStatus('All videos successfully uploaded! You can now process them.', 'completed');
            if (selectFilesButton) selectFilesButton.disabled = false;
            if (videoInput) videoInput.value = '';
            resetProgressBar();
            
            updateUploadedVideosList(); // Обновляем список, чтобы показать загруженные видео
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
            const validFilesExist = filesToUpload.some(f => f._isValidFlag);
            if (!validFilesExist) {
                displayGeneralStatus('No valid videos selected for upload. Please choose valid files.', 'error');
                return;
            }

            if (selectFilesButton) selectFilesButton.disabled = true; // Отключаем кнопку во время загрузки
            uploadNextFile();
        });
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

    // НОВЫЕ ИЗМЕНЕНИЯ ДЛЯ ОБРАБОТКИ ВИДЕО
    // Обработчик клика по кнопке "Process Selected Videos"
    if (processSelectedVideosButton) {
        processSelectedVideosButton.addEventListener('click', async () => {
            console.log("DEBUG: Кнопка 'Process Selected Videos' была нажата!");
            
            const allUploadedTaskIds = uploadedVideos.map(video => video.id).filter(id => id); 

            console.log("DEBUG: Проверяем содержимое массива uploadedVideos непосредственно перед вызовом processVideosFromSelection:");
            console.log(uploadedVideos); // Выводим полный массив
            console.log("DEBUG: Количество элементов в uploadedVideos:", uploadedVideos.length);
            console.log("DEBUG: ID первого элемента в uploadedVideos (если есть):", uploadedVideos.length > 0 ? uploadedVideos[0].id : 'N/A');
            console.log("DEBUG: Task IDs, полученные из uploadedVideos на данный момент:", allUploadedTaskIds);
            // --- КОНЕЦ НОВЫХ ОТЛАДОЧНЫХ СООБЩЕНИЙ ---
                
            if (allUploadedTaskIds.length === 0) {
                displayProcessStatus('No videos available to process. Please upload some first.', 'error');
                return;
            }

            // Получаем актуальные пользовательские данные
            const username = instagramInput ? instagramInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const linkedin = linkedinInput ? linkedinInput.value.trim() : '';
            
            // Проверяем заполнение пользовательских данных, если они необходимы
            if (!username && !email && !linkedin) {
                displayProcessStatus('Please enter Instagram ID, Email, or LinkedIn to process videos.', 'error');
                return;
            }

            // Проверяем состояние чекбокса объединения
            const shouldConnectVideos = connectVideosCheckbox ? connectVideosCheckbox.checked : false;

            if (shouldConnectVideos && allUploadedTaskIds.length < 2) {
                displayProcessStatus('Please select 2 or more videos to connect them.', 'error');
                return;
            }

            displayProcessStatus('Sending videos for processing...', 'info');
            processSelectedVideosButton.disabled = true; // Отключаем кнопку на время обработки
            if (connectVideosCheckbox) connectVideosCheckbox.disabled = true; // Отключаем чекбокс

            // Вызываем функцию processVideosFromSelection из process_videos.js
            // Предполагаем, что processVideosFromSelection доступна в глобальной области видимости
            if (typeof processVideosFromSelection === 'function') {
                try {
                    await processVideosFromSelection(
                        allUploadedTaskIds,
                        shouldConnectVideos, // ТЕПЕРЬ ПЕРЕДАЕМ АКТУАЛЬНОЕ ЗНАЧЕНИЕ ИЗ ЧЕКБОКСА
                        username,
                        email,
                        linkedin,
                        displayProcessStatus, // Передаем функцию для обновления статуса в секции обработки
                        displayGeneralStatus // Передаем функцию для общего статуса
                    );
                    // После успешной обработки, перенаправляем на results.html
                    displayProcessStatus('Videos sent for processing successfully! Redirecting to results...', 'success');
                    // Дадим немного времени пользователю прочитать сообщение
                    setTimeout(() => {
                        window.location.replace('results.html');
                    }, 2000);   
                } catch (error) {
                    console.error("Error initiating video processing:", error);
                    displayProcessStatus(`Error processing videos: ${error.message || 'Unknown error'}`, 'error');
                } finally {
                    processSelectedVideosButton.disabled = false; // Включаем кнопку обратно
                    if (connectVideosCheckbox) connectVideosCheckbox.disabled = false; // Включаем чекбокс обратно
                    updateProcessRelatedUI(); // Обновляем UI после завершения попытки
                }
            } else {
                console.error("processVideosFromSelection function is not defined. Ensure process_videos.js is loaded correctly.");
                displayProcessStatus('Internal error: Processing logic not loaded.', 'error');
                processSelectedVideosButton.disabled = false;
            }
        });
    }
}); // Закрывающий тег для DOMContentLoaded
