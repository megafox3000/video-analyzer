// script/upload_validation.js -

console.log("DEBUG: upload_validation.js loaded and executing.");

// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// Импортируем функцию загрузки из нового модуля
import { uploadFileToCloudinary } from './cloudinary_upload.js';
// Импортируем функции для QR-сканера
import { startScanner, stopScanner } from './qr_scanner.js'; // Убедитесь, что qr_scanner.js экспортирует эти функции

// Глобальные переменные для таймера неактивности
let inactivityTimeout;
const INACTIVITY_THRESHOLD = 90 * 1000; // 90 секунд в миллисекундах

/**
 * Сбрасывает таймер неактивности.
 * Вызывается при любой активности пользователя.
 */
function resetInactivityTimer() {
    clearTimeout(inactivityTimeout); // Очищаем существующий таймер
    inactivityTimeout = setTimeout(handleInactivity, INACTIVITY_THRESHOLD); // Устанавливаем новый
    console.log("[Inactivity Timer] Таймер неактивности сброшен.");
}

/**
 * Обрабатывает неактивность пользователя: закрывает сессию.
 * Вызывается, когда таймер неактивности истекает.
 */
function handleInactivity() {
    console.log("[Inactivity Timer] Пользователь неактивен в течение 90 секунд. Закрытие сессии.");

    setTimeout(() => {
        localStorage.clear(); 
        sessionStorage.clear();
        window.location.href = 'index.html'; 
    }, 100); 
}

// Добавляем слушатели событий к документу для отслеживания активности пользователя
document.addEventListener('mousemove', resetInactivityTimer); 
document.addEventListener('keypress', resetInactivityTimer); 
document.addEventListener('click', resetInactivityTimer);    
document.addEventListener('scroll', resetInactivityTimer);   

// Инициализируем таймер при загрузке скрипта
resetInactivityTimer();

const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');
const existingLinkedin = localStorage.getItem('hifeLinkedin');

// Если данные пользователя и загруженные видео существуют, перенаправляем на results.html
if ((existingUsername || existingEmail || existingLinkedin) && existingUploadedVideos) {
    try {
        const parsedVideos = JSON.parse(existingUploadedVideos);
        if (parsedVideos.length > 0) {
            console.log("DEBUG: Existing uploads found, redirecting to results.html on initial load.");
            setTimeout(() => {
                window.location.replace('results.html'); 
            }, 500); 
        }
    } catch (e) {
        console.error("Error parsing localStorage 'uploadedVideos':", e);
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
    const goToResultsButton = document.getElementById('goToResultsButton'); // Кнопка "Перейти к результатам"

    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const selectedFilesPreviewSection = document.querySelector('.selected-files-preview-section');
    const selectedFilesPreviewContainer = document.getElementById('selectedFilesPreviewContainer');

    // НОВЫЕ ЭЛЕМЕНТЫ ДЛЯ QR-СКАНЕРА И СПЕЦИАЛЬНОГО КОДА
    const showUploadFormBtn = document.getElementById('showUploadFormBtn');
    const showQrScannerBtn = document.getElementById('showQrScannerBtn');
    const uploadFormSection = document.getElementById('uploadFormSection');
    const qrCodeScannerSection = document.getElementById('qrCodeScannerSection');
    const qrStartScanButton = document.getElementById('startScanButton'); // Из qr_scanner.js
    const qrStopScanButton = document.getElementById('stopScanButton');   // Из qr_scanner.js
    const specialCodeInput = document.getElementById('specialCodeInput');
    const submitSpecialCodeBtn = document.getElementById('submitSpecialCodeBtn');
    const specialCodeStatus = document.getElementById('specialCodeStatus');


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
            file._bubbleImgElement.src = 'assets/error_placeholder.png';
            file._bubbleImgElement.alt = 'Processing Error';
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
            allSelectedFilesAreValid = filesToUpload.every(file => file._isValidFlag);
        }

        if (selectFilesButton) {
            selectFilesButton.disabled = !(anyFieldFilled && (!filesSelected || allSelectedFilesAreValid));

            if (anyFieldFilled && filesSelected && allSelectedFilesAreValid) {
                selectFilesButton.textContent = 'Transfer your Video(s)';
            } else {
                selectFilesButton.textContent = 'Choose your Video(s)';
            }
        }

        if (generalStatusMessage && selectFilesButton && !selectFilesButton.disabled &&
            generalStatusMessage.classList.contains('status-error') &&
            !generalStatusMessage.textContent.includes('too long') &&
            !generalStatusMessage.textContent.includes('too large') &&
            !generalStatusMessage.textContent.includes('failed validation')) {
            generalStatusMessage.textContent = '';
            generalStatusMessage.className = 'status-message';
        }
    }

    // --- Инициализация при загрузке DOM ---
    checkFinishButtonStatus();
    resetProgressBar(); 
    clearPreviews(); 

    validateInputs(); 

    // --- Логика переключения секций ---
    function showUploadSection() {
        uploadFormSection.classList.remove('hidden');
        qrCodeScannerSection.classList.add('hidden');
        stopScanner(); // Останавливаем QR-сканер, если он был активен
        displayGeneralStatus('', 'info'); // Очищаем общие сообщения
        if (specialCodeStatus) specialCodeStatus.textContent = ''; // Очищаем статус специального кода
        // Возможно, здесь также очистить поле specialCodeInput
        if (specialCodeInput) specialCodeInput.value = '';
    }

    function showQrScannerSection() {
        uploadFormSection.classList.add('hidden');
        qrCodeScannerSection.classList.remove('hidden');
        displayGeneralStatus('', 'info'); // Очищаем общие сообщения
    }

    // Изначально показываем секцию загрузки
    showUploadSection();


    // --- Обработчики событий ---

    // Обработчики переключения секций
    if (showUploadFormBtn) showUploadFormBtn.addEventListener('click', showUploadSection);
    if (showQrScannerBtn) showQrScannerBtn.addEventListener('click', showQrScannerSection);

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
        videoInput.addEventListener('change', (event) => {
            if (generalStatusMessage) generalStatusMessage.textContent = '';

            clearPreviews(); 

            filesToUpload = Array.from(event.target.files);
            currentFileIndex = 0; 

            console.log(`DEBUG: Selected ${filesToUpload.length} files.`); 
            if (filesToUpload.length === 0) {
                validateInputs();
                clearPreviews(); 
                return;
            }
            if (selectedFilesPreviewContainer) {
                selectedFilesPreviewContainer.innerHTML = ''; 
            }
            if (selectedFilesPreviewSection) {
                selectedFilesPreviewSection.style.display = 'block'; 
            }

            let filesToValidateMetadata = [];
            let anyFileFailedInitialCheck = false; 

            filesToUpload.forEach(file => {
                const previewBubble = document.createElement('div');
                previewBubble.className = 'preview-bubble media-bubble';
                previewBubble.style.cursor = 'default';

                const imgElement = document.createElement('img'); 
                imgElement.className = 'bubble-preview-img';

                const fileObjectURL = URL.createObjectURL(file);
                objectURLs.push(fileObjectURL); 

                if (file.type.startsWith('video/')) {
                    const tempVideoElement = document.createElement('video');
                    tempVideoElement.preload = 'metadata';
                    tempVideoElement.src = fileObjectURL; 

                    let thumbnailGenerated = false;

                    tempVideoElement.onloadeddata = () => { 
                        if (!thumbnailGenerated) {
                            try {
                                tempVideoElement.currentTime = 1; 
                            } catch (e) {
                                console.warn(`Error setting currentTime for video thumbnail: ${file.name}`, e);
                                imgElement.src = 'assets/video_placeholder.png'; 
                                URL.revokeObjectURL(fileObjectURL); 
                                thumbnailGenerated = true;
                            }
                        }
                    };

                    tempVideoElement.onseeked = () => {
                        if (!thumbnailGenerated) {
                            try {
                                const canvas = document.createElement('canvas');
                                const context = canvas.getContext('2d');
                                canvas.width = tempVideoElement.videoWidth || 128; 
                                canvas.height = tempVideoElement.videoHeight || 72; 
                                context.drawImage(tempVideoElement, 0, 0, canvas.width, canvas.height);
                                imgElement.src = canvas.toDataURL('image/jpeg'); 
                                thumbnailGenerated = true;
                            } catch (e) {
                                console.warn(`Error generating thumbnail for video: ${file.name}`, e);
                                imgElement.src = 'assets/video_placeholder.png'; 
                            } finally {
                                URL.revokeObjectURL(fileObjectURL); 
                            }
                        }
                    };

                    tempVideoElement.onerror = () => {
                        console.warn(`Could not load video metadata or generate thumbnail for: ${file.name}`);
                        if (!thumbnailGenerated) {
                               imgElement.src = 'assets/video_placeholder.png'; 
                               thumbnailGenerated = true;
                        }
                        URL.revokeObjectURL(fileObjectURL); 
                    };
                } else if (file.type.startsWith('image/')) {
                    imgElement.src = fileObjectURL; 
                } else {
                    imgElement.src = 'assets/video_placeholder.png'; 
                    URL.revokeObjectURL(fileObjectURL); 
                }

                const textOverlay = document.createElement('div');
                textOverlay.className = 'bubble-text-overlay';

                const titleOverlay = document.createElement('h3');
                titleOverlay.className = 'bubble-title-overlay';
                titleOverlay.textContent = file.name;

                const statusMessageBubble = document.createElement('p');
                statusMessageBubble.className = 'status-message-bubble status-info'; 
                statusMessageBubble.textContent = 'Validating...'; 

                const bubbleActions = document.createElement('div'); 
                bubbleActions.className = 'bubble-actions';

                textOverlay.appendChild(titleOverlay);
                textOverlay.appendChild(statusMessageBubble);
                textOverlay.appendChild(bubbleActions);

                previewBubble.appendChild(imgElement);
                previewBubble.appendChild(textOverlay);

                if (selectedFilesPreviewContainer) {
                    selectedFilesPreviewContainer.appendChild(previewBubble);
                }

                file._previewBubbleElement = previewBubble;
                file._statusMessageBubbleElement = statusMessageBubble;
                file._bubbleImgElement = imgElement;
                file._isValidFlag = true; 

                if (file.size > MAX_VIDEO_SIZE_BYTES) {
                    file._isValidFlag = false; 
                    anyFileFailedInitialCheck = true; 
                    updateFileBubbleUI(file, `Too large. Max ${MAX_VIDEO_SIZE_MB} MB.`, 'error');
                } else {
                    filesToValidateMetadata.push(file); 
                }
            });

            if (anyFileFailedInitialCheck) {
                displayGeneralStatus(`Some videos failed initial size validation. Please check indicated files.`, 'error');
                validateInputs(); 
                return;
            }
            let validationsCompleted = 0;
            const totalFilesForValidation = filesToValidateMetadata.length;

            if (totalFilesForValidation === 0 && filesToUpload.length > 0) {
                validateInputs(); 
                return;
            } else if (filesToUpload.length === 0) { 
                validateInputs();
                clearPreviews();
                return;
            }

            displayGeneralStatus('Checking selected videos for duration...', 'info');

            filesToValidateMetadata.forEach((file) => {
                const tempVideoElement = document.createElement('video');
                tempVideoElement.preload = 'metadata';
                const metadataObjectURL = URL.createObjectURL(file);
                tempVideoElement.src = metadataObjectURL;

                tempVideoElement.onloadedmetadata = () => {
                    const videoDuration = tempVideoElement.duration;
                    URL.revokeObjectURL(metadataObjectURL); 

                    if (isNaN(videoDuration) || videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                        file._isValidFlag = false;
                        updateFileBubbleUI(file, `Too long. Max ${MAX_VIDEO_DURATION_SECONDS / 60} minutes.`, 'error');
                    } else {
                        updateFileBubbleUI(file, 'Ready for upload.', 'info');
                    }

                    validationsCompleted++;
                    if (validationsCompleted === totalFilesForValidation) {
                        const finalAllFilesValid = filesToUpload.every(f => f._isValidFlag); 

                        if (finalAllFilesValid) {
                            displayGeneralStatus(`All ${filesToUpload.length} videos are ready for upload. Click "Transfer your Video(s)".`, 'completed');
                            validateInputs();
                        } else {
                            const invalidCount = filesToUpload.filter(f => !f._isValidFlag).length;
                            displayGeneralStatus(`${invalidCount} video(s) failed validation. Please check indicated files.`, 'error');
                            validateInputs();
                        }
                    }
                };
                tempVideoElement.onerror = () => {
                    URL.revokeObjectURL(metadataObjectURL); 
                    file._isValidFlag = false; 
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
        const validFilesToUpload = filesToUpload.filter(f => f._isValidFlag);
        console.log(`DEBUG: uploadNextFile called. currentFileIndex: ${currentFileIndex}, validFilesToUpload.length: ${validFilesToUpload.length}`);

        if (currentFileIndex < validFilesToUpload.length) {
            const file = validFilesToUpload[currentFileIndex];
            const username = instagramInput ? instagramInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const linkedin = linkedinInput ? linkedinInput.value.trim() : '';

            const uiCallbacks = {
                updateFileBubbleUI: (f, msg, type) => updateFileBubbleUI(f, msg, type),
                displayGeneralStatus: (msg, type) => displayGeneralStatus(msg, type),
                resetProgressBar: () => resetProgressBar(),
                selectFilesButton: selectFilesButton, 
                progressBar: progressBar,
                progressText: progressText,
                progressBarContainer: progressBarContainer
            };

            const onUploadSuccess = (response, uploadedFile) => {
                console.log(`DEBUG: onUploadSuccess for file: ${uploadedFile.name}, taskId: ${response.taskId}`);
                const taskId = response.taskId;
                const newVideoEntry = {
                    id: taskId,
                    originalFilename: response.originalFilename || uploadedFile.name,
                    status: 'uploaded', 
                    timestamp: new Date().toISOString(),
                    cloudinary_url: response.cloudinary_url,
                    metadata: response.metadata || {}
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                console.log(`DEBUG: LocalStorage updated. Total uploadedVideos: ${uploadedVideos.length}`);

                updateFileBubbleUI(uploadedFile, 'Uploaded successfully!', 'success');

                currentFileIndex++;
                console.log(`DEBUG: currentFileIndex incremented to: ${currentFileIndex}`);
                uploadNextFile(); 
            };

            const onUploadError = (error, erroredFile) => {
                console.error(`DEBUG: onUploadError for file: ${erroredFile.name}. Error: ${error.error || 'Unknown error'}`);
                updateFileBubbleUI(erroredFile, `Upload failed!`, 'error'); 

                displayGeneralStatus(`Upload error for video "${erroredFile.name}": ${error.error || 'Unknown error'}. Please try again.`, 'error');
                currentFileIndex = 0; 
                validateInputs(); 
            };

            uploadFileToCloudinary(file, username, email, linkedin, uiCallbacks, onUploadSuccess, onUploadError);

        } else {
            console.log("DEBUG: All valid files have been processed. Attempting redirect."); 
            displayGeneralStatus('All videos successfully uploaded! Redirecting to results page...', 'completed');
            if (selectFilesButton) selectFilesButton.disabled = false;
            if (videoInput) videoInput.value = '';
            resetProgressBar();
            
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

            if (filesToUpload.length === 0 || (videoInput && videoInput.files.length === 0) || selectFilesButton.textContent === 'Choose your Video(s)') {
                displayGeneralStatus('Select video file(s)...', 'info');
                if (videoInput) videoInput.click();
                return;
            }

            const validFilesExist = filesToUpload.some(f => f._isValidFlag);
            if (!validFilesExist) {
                displayGeneralStatus('No valid videos selected for upload. Please choose valid files.', 'error');
                return;
            }

            if (selectFilesButton) selectFilesButton.disabled = true; 
            uploadNextFile();
        });
    }

    // Обработчик кнопки "Finish Upload"
    if (finishUploadButton) {
        finishUploadButton.addEventListener('click', () => {
            if (localStorage.getItem('uploadedVideos') && JSON.parse(localStorage.getItem('uploadedVideos')).length > 0) {
                console.log("DEBUG: Finish Upload button clicked, redirecting to results.html.");
                setTimeout(() => {
                    window.location.replace('results.html');
                }, 500);
            } else {
                displayGeneralStatus("No videos uploaded to show results.", 'pending');
            }
        });
    }

    // --- Обработчики для логики QR-сканера и специального кода ---
    if (qrStartScanButton) {
        qrStartScanButton.addEventListener('click', startScanner);
    }
    if (qrStopScanButton) {
        qrStopScanButton.addEventListener('click', stopScanner);
    }

    if (submitSpecialCodeBtn) {
        submitSpecialCodeBtn.addEventListener('click', () => {
            const code = specialCodeInput.value.trim();
            if (code) {
                // Здесь вы можете добавить логику для обработки специального кода.
                // Например, отправить его на бэкенд для проверки или использовать локально.
                // В этом примере мы просто перенаправляем пользователя на results.html
                // и сохраняем код как "username" для тестовых целей.
                console.log(`Special code submitted: ${code}`);
                specialCodeStatus.textContent = `Код "${code}" получен. Перенаправление...`;
                specialCodeStatus.className = 'status-message status-info';

                // Сохраняем код как Instagram ID для простоты, или вы можете адаптировать это
                localStorage.setItem('hifeUsername', code); 
                localStorage.removeItem('hifeEmail'); // Очищаем другие поля, если этот метод является основным
                localStorage.removeItem('hifeLinkedin');

                // Перенаправляем на страницу результатов
                setTimeout(() => {
                    window.location.replace('results.html');
                }, 1000); 

            } else {
                specialCodeStatus.textContent = 'Пожалуйста, введите код.';
                specialCodeStatus.className = 'status-message status-error';
            }
        });
    }

    // Обработчик для кнопки "Перейти к результатам" (в вашем предыдущем index.html)
    // Эта кнопка теперь должна быть в upload.html, если она нужна
    const goToResultsButtonElement = document.getElementById('goToResultsButton');
    if (goToResultsButtonElement) {
        goToResultsButtonElement.addEventListener('click', () => {
            // Если есть данные в localStorage, переходим на страницу результатов
            const currentVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
            const userSet = localStorage.getItem('hifeUsername') || localStorage.getItem('hifeEmail') || localStorage.getItem('hifeLinkedin');

            if (currentVideos.length > 0 || userSet) {
                window.location.replace('results.html');
            } else {
                alert('Нет загруженных видео или данных пользователя для отображения.'); // Использовать кастомное модальное окно в Canvas
            }
        });
    }


}); // Закрывающий тег для DOMContentLoaded
