// In the beginning of your script/upload_validation.js file,
// BEFORE document.addEventListener('DOMContentLoaded', ...)

const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');
const existingLinkedin = localStorage.getItem('hifeLinkedin');

// If user data AND uploaded videos exist, redirect to results.html
if ((existingUsername || existingEmail || existingLinkedin) && existingUploadedVideos && JSON.parse(existingUploadedVideos).length > 0) {
    window.location.replace('results.html');
}

document.addEventListener('DOMContentLoaded', () => {
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

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';
    const MAX_VIDEO_SIZE_MB = 100;
    const MAX_VIDEO_DURATION_SECONDS = 60;
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

    let currentUploadXhr = null;
    let filesToUpload = []; // Массив для хранения файлов, ожидающих загрузки
    let currentFileIndex = 0; // Индекс текущего загружаемого файла

    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let hifeEmail = localStorage.getItem('hifeEmail') || '';
    let hifeLinkedin = localStorage.getItem('hifeLinkedin') || '';

    instagramInput.value = hifeUsername;
    emailInput.value = hifeEmail;
    linkedinInput.value = hifeLinkedin;

    updateUploadedVideosList();
    checkFinishButtonStatus();
    resetProgressBar(); // Убедимся, что прогресс-бар скрыт при загрузке страницы

    // --- НОВОЕ: Устанавливаем начальный текст кнопки ---
    selectFilesButton.textContent = 'Choose your Video(s)';
    selectFilesButton.disabled = true; // Начальное состояние: кнопка неактивна, пока не заполнены поля

    instagramInput.addEventListener('input', () => {
        const value = instagramInput.value.trim();
        localStorage.setItem('hifeUsername', value);
        hifeUsername = value;
        generalStatusMessage.textContent = '';
        validateInputs();
    });

    emailInput.addEventListener('input', () => {
        const value = emailInput.value.trim();
        localStorage.setItem('hifeEmail', value);
        hifeEmail = value;
        generalStatusMessage.textContent = '';
        validateInputs();
    });

    linkedinInput.addEventListener('input', () => {
        const value = linkedinInput.value.trim();
        localStorage.setItem('hifeLinkedin', value);
        hifeLinkedin = value;
        generalStatusMessage.textContent = '';
        validateInputs();
    });

    videoInput.addEventListener('change', () => {
        generalStatusMessage.textContent = '';
        filesToUpload = Array.from(videoInput.files);
        currentFileIndex = 0; // Сбрасываем индекс для новой очереди загрузки

        if (filesToUpload.length === 0) {
            validateInputs();
            // --- НОВОЕ: Если файлы отменены, возвращаем кнопку к начальному виду ---
            selectFilesButton.textContent = 'Choose your Video(s)';
            return;
        }

        let allFilesValid = true;
        let filesToValidateMetadata = [];

        for (const file of filesToUpload) {
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                generalStatusMessage.textContent = `Видео "${file.name}" слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                videoInput.value = '';
                allFilesValid = false;
                break;
            }
            filesToValidateMetadata.push(file);
        }

        if (!allFilesValid) {
            validateInputs();
            // --- НОВОЕ: Если есть невалидные файлы, возвращаем кнопку к начальному виду ---
            selectFilesButton.textContent = 'Choose your Video(s)';
            filesToUpload = []; // Очищаем очередь, так как есть невалидные
            return;
        }

        let validationsCompleted = 0;
        const totalFilesForValidation = filesToValidateMetadata.length;

        if (totalFilesForValidation === 0) {
             validateInputs();
             // --- НОВОЕ: Если нет файлов для валидации, возвращаем кнопку к начальному виду ---
             selectFilesButton.textContent = 'Choose your Video(s)';
             return;
        }

        generalStatusMessage.textContent = 'Проверка выбранных видео...';
        generalStatusMessage.style.color = 'var(--status-info-color)';


        filesToValidateMetadata.forEach((file) => {
            const tempVideoElement = document.createElement('video');
            tempVideoElement.preload = 'metadata';
            tempVideoElement.src = URL.createObjectURL(file);

            tempVideoElement.onloadedmetadata = () => {
                const videoDuration = tempVideoElement.duration;
                setTimeout(() => {
                    URL.revokeObjectURL(tempVideoElement.src);
                }, 100);

                if (isNaN(videoDuration) || videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                    generalStatusMessage.textContent = `Видео "${file.name}" слишком длинное. Максимум ${MAX_VIDEO_DURATION_SECONDS / 60} минут.`;
                    generalStatusMessage.style.color = 'var(--status-error-color)';
                    videoInput.value = '';
                    allFilesValid = false;
                }

                validationsCompleted++;
                if (validationsCompleted === totalFilesForValidation) {
                    if (allFilesValid) {
                        generalStatusMessage.textContent = `Все ${filesToUpload.length} видео готовы к загрузке. Нажмите "Transfer your Video(s)".`;
                        generalStatusMessage.style.color = 'var(--status-completed-color)';
                        // --- НОВОЕ: Меняем текст кнопки после успешной валидации ---
                        selectFilesButton.textContent = 'Transfer your Video(s)';
                        validateInputs();
                    } else {
                        generalStatusMessage.textContent = `Некоторые видео не прошли валидацию. Пожалуйста, выберите другие файлы.`;
                        generalStatusMessage.style.color = 'var(--status-error-color)';
                        filesToUpload = [];
                        videoInput.value = ''; // Сброс, если были невалидные
                        // --- НОВОЕ: Если валидация не прошла, возвращаем кнопку к начальному виду ---
                        selectFilesButton.textContent = 'Choose your Video(s)';
                        validateInputs();
                    }
                }
            };
            tempVideoElement.onerror = () => {
                setTimeout(() => {
                    URL.revokeObjectURL(tempVideoElement.src);
                }, 100);

                generalStatusMessage.textContent = `Не удалось загрузить метаданные видео "${file.name}". Возможно, файл поврежден или не является видео.`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                videoInput.value = '';
                allFilesValid = false;
                validationsCompleted++;
                if (validationsCompleted === totalFilesForValidation) {
                    filesToUpload = [];
                    // --- НОВОЕ: Если ошибка метаданных, возвращаем кнопку к начальному виду ---
                    selectFilesButton.textContent = 'Choose your Video(s)';
                    validateInputs();
                }
            };
        });
    });

    function uploadNextFile() {
        if (currentFileIndex < filesToUpload.length) {
            const file = filesToUpload[currentFileIndex];
            const username = instagramInput.value.trim();
            const email = emailInput.value.trim();
            const linkedin = linkedinInput.value.trim();

            uploadVideo(file, username, email, linkedin);
        } else {
            generalStatusMessage.textContent = 'Все видео успешно загружены!';
            generalStatusMessage.style.color = 'var(--status-completed-color)';
            selectFilesButton.disabled = false;
            // --- НОВОЕ: Возвращаем кнопку к начальному тексту после всех загрузок ---
            selectFilesButton.textContent = 'Choose your Video(s)';
            videoInput.value = '';
            resetProgressBar();
            window.location.replace('results.html');
        }
    }

    selectFilesButton.addEventListener('click', async () => {
        const username = instagramInput.value.trim();
        const email = emailInput.value.trim();
        const linkedin = linkedinInput.value.trim();

        if (!username && !email && !linkedin) {
            generalStatusMessage.textContent = 'Пожалуйста, введите Instagram ID, Email или LinkedIn.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            validateInputs();
            return;
        }

        // Если файлов нет в очереди (или если input пустой), открываем диалог выбора файлов
        if (filesToUpload.length === 0 || videoInput.files.length === 0) {
            generalStatusMessage.textContent = 'Выберите видеофайл(ы)...';
            generalStatusMessage.style.color = 'var(--status-info-color)';
            videoInput.click();
            return;
        }

        // Если файлы уже выбраны и прошли предварительную валидацию (и кнопка уже говорит "Transfer your Video(s)"),
        // то запускаем загрузку
        selectFilesButton.disabled = true; // Отключаем кнопку, пока идет загрузка
        uploadNextFile();
    });

    function uploadVideo(file, username, email, linkedin) {
        generalStatusMessage.textContent = `Загрузка видео ${currentFileIndex + 1} из ${filesToUpload.length}: ${file.name}...`;
        generalStatusMessage.style.color = 'var(--status-info-color)';

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
                generalStatusMessage.textContent = `Загрузка видео ${currentFileIndex + 1} из ${filesToUpload.length}: ${file.name} (${percent.toFixed(0)}%)`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
            }
        });

        currentUploadXhr.onload = function() {
            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                const newVideoEntry = {
                    id: taskId,
                    original_filename: file.name,
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    cloudinary_url: response.cloudinary_url // Сохраняем URL из Cloudinary
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                currentFileIndex++;
                uploadNextFile();

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                generalStatusMessage.textContent = `Ошибка загрузки видео ${currentFileIndex + 1} из ${filesToUpload.length} ("${file.name}"): ${error.error || 'Неизвестная ошибка'}`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                resetProgressBar();
                selectFilesButton.disabled = false;
                // --- НОВОЕ: Возвращаем кнопку к начальному виду при ошибке загрузки ---
                selectFilesButton.textContent = 'Choose your Video(s)';
                filesToUpload = []; // Очищаем очередь при ошибке, чтобы пользователь начал заново
                currentFileIndex = 0;
                videoInput.value = '';
                validateInputs();
            }
        };

        currentUploadXhr.onerror = function() {
            selectFilesButton.disabled = false;
            // --- НОВОЕ: Возвращаем кнопку к начальному виду при ошибке сети ---
            selectFilesButton.textContent = 'Choose your Video(s)';
            generalStatusMessage.textContent = `Ошибка сети во время загрузки видео ${currentFileIndex + 1} из ${filesToUpload.length} ("${file.name}").`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
            resetProgressBar();
            filesToUpload = []; // Очищаем очередь при ошибке
            currentFileIndex = 0;
            videoInput.value = '';
            validateInputs();
        };

        currentUploadXhr.send(formData);
    }

    finishUploadButton.addEventListener('click', () => {
        if (localStorage.getItem('uploadedVideos') && JSON.parse(localStorage.getItem('uploadedVideos')).length > 0) {
            window.location.replace('results.html');
        } else {
            generalStatusMessage.textContent = "Видео не загружено для отображения результатов.";
            generalStatusMessage.style.color = 'var(--status-pending-color)';
        }
    });

    function validateInputs() {
        const anyFieldFilled = instagramInput.value.trim() !== '' ||
                               emailInput.value.trim() !== '' ||
                               linkedinInput.value.trim() !== '';

        const filesSelected = videoInput.files.length > 0;
        let allSelectedFilesAreValid = true;

        if (filesSelected) {
            for (const file of Array.from(videoInput.files)) {
                if (file.size > MAX_VIDEO_SIZE_BYTES) {
                    allSelectedFilesAreValid = false;
                    break;
                }
            }
        }

        // Кнопка активна, если:
        // 1. Заполнено хотя бы одно из полей
        // И (2. Либо файлы еще не выбраны (тогда клик по кнопке откроет диалог выбора)
        //    ЛИБО выбраны файлы, и все они прошли синхронную валидацию по размеру,
        //    и процесс загрузки еще не начался/завершился.)
        selectFilesButton.disabled = !(anyFieldFilled && (!filesSelected || allSelectedFilesAreValid));

        // Если есть выбранные и валидные файлы, и нет активной загрузки,
        // то текст кнопки должен быть "Transfer your Video(s)"
        // Если же файлов нет или они невалидны, то "Choose your Video(s)"
        if (anyFieldFilled && filesSelected && allSelectedFilesAreValid && currentFileIndex === 0) {
            selectFilesButton.textContent = 'Transfer your Video(s)';
        } else if (!filesSelected && anyFieldFilled) { // Если поля заполнены, но файлы не выбраны
            selectFilesButton.textContent = 'Choose your Video(s)';
        } else if (!anyFieldFilled) { // Если поля не заполнены, кнопка неактивна и текст по умолчанию
             selectFilesButton.textContent = 'Choose your Video(s)';
        }


        if (!selectFilesButton.disabled && generalStatusMessage.style.color === 'var(--status-error-color)' &&
            !generalStatusMessage.textContent.includes('слишком')) {
            generalStatusMessage.textContent = '';
        }
    }


    function updateUploadedVideosList() {
        uploadedVideosList.innerHTML = '';
        if (uploadedVideos.length === 0) {
            uploadedVideosList.innerHTML = '<p>Пока нет загруженных видео.</p>';
        } else {
            uploadedVideos.forEach(video => {
                const li = document.createElement('li');
                li.textContent = `${video.original_filename} (ID: ${video.id}) - Статус: ${video.status}`;
                uploadedVideosList.appendChild(li);
            });
        }
    }

    function checkFinishButtonStatus() {
        if (uploadedVideos.length === 0) {
            finishUploadButton.style.display = 'none';
        } else {
            finishUploadButton.style.display = 'block';
        }
    }

    function resetProgressBar() {
        if (progressBarContainer) progressBarContainer.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
    }

    validateInputs(); // Вызываем при загрузке страницы для установки начального состояния
});
