// В начале вашего скрипта/upload_validation.js
console.log("DEBUG: upload_validation.js loaded and executing.");
// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// Импортируем функцию загрузки из нового модуля
import { uploadFileToCloudinary } from './cloudinary_upload.js';

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
            // АВТОМАТИЧЕСКОЕ ПЕРЕНАПРАВЛЕНИЕ, если есть сохраненные загрузки
            console.log("DEBUG: Existing uploads found, redirecting to results.html on initial load.");
            // Добавляем небольшую задержку для видимости лога перед редиректом
            setTimeout(() => {
                window.location.replace('results.html'); 
            }, 500); 
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

    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // Контейнеры для предварительного просмотра файлов
    const selectedFilesPreviewSection = document.querySelector('.selected-files-preview-section');
    const selectedFilesPreviewContainer = document.getElementById('selectedFilesPreviewContainer');

    // ЭЛЕМЕНТЫ ДЛЯ ОБРАБОТКИ ВИДЕО УДАЛЕНЫ С ЭТОЙ СТРАНИЦЫ
    // const processSelectedVideosButton = document.getElementById('processSelectedVideosButton');
    // const connectVideosCheckbox = document.getElementById('connectVideosCheckbox');
    // const processStatusMessage = document.getElementById('processStatusMessage');

    // Константы валидации
    const MAX_VIDEO_SIZE_MB = 100;
    const MAX_VIDEO_DURATION_SECONDS = 600; // 10 минут
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

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

            console.log(`DEBUG: Selected ${filesToUpload.length} files.`); // Отладочное сообщение
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
        console.log(`DEBUG: uploadNextFile called. currentFileIndex: ${currentFileIndex}, validFilesToUpload.length: ${validFilesToUpload.length}`); // Отладочное сообщение

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
                console.log(`DEBUG: onUploadSuccess for file: ${uploadedFile.name}, taskId: ${response.taskId}`); // Отладочное сообщение
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
                console.log(`DEBUG: LocalStorage updated. Total uploadedVideos: ${uploadedVideos.length}`); // Отладочное сообщение


                // Обновляем статус в индивидуальном пузыре файла на "Uploaded successfully!" после завершения
                updateFileBubbleUI(uploadedFile, 'Uploaded successfully!', 'success');

                currentFileIndex++;
                console.log(`DEBUG: currentFileIndex incremented to: ${currentFileIndex}`); // Отладочное сообщение
                uploadNextFile(); // Запускаем загрузку следующего файла
            };

            const onUploadError = (error, erroredFile) => {
                console.error(`DEBUG: onUploadError for file: ${erroredFile.name}. Error: ${error.error || 'Unknown error'}`); // Отладочное сообщение
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
            console.log("DEBUG: All valid files have been processed. Attempting redirect."); // Отладочное сообщение
            displayGeneralStatus('All videos successfully uploaded! Redirecting to results page...', 'completed');
            if (selectFilesButton) selectFilesButton.disabled = false;
            if (videoInput) videoInput.value = '';
            resetProgressBar();
            
            // АВТОМАТИЧЕСКОЕ ПЕРЕНАПРАВЛЕНИЕ после успешной загрузки всех файлов
            // Добавляем небольшую задержку для видимости лога перед редиректом
            setTimeout(() => {
                window.location.replace('results.html');
            }, 500);
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

    // Обработчик кнопки "Finish Upload" (может быть скрыта, но оставляем на случай, если ее покажут)
    if (finishUploadButton) {
        finishUploadButton.addEventListener('click', () => {
            if (localStorage.getItem('uploadedVideos') && JSON.parse(localStorage.getItem('uploadedVideos')).length > 0) {
                console.log("DEBUG: Finish Upload button clicked, redirecting to results.html."); // Отладочное сообщение
                // Добавляем небольшую задержку для видимости лога перед редиректом
                setTimeout(() => {
                    window.location.replace('results.html');
                }, 500);
            } else {
                displayGeneralStatus("No videos uploaded to show results.", 'pending');
            }
        });
    }

}); // Закрывающий тег для DOMContentLoaded
