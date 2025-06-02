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
    const MAX_VIDEO_DURATION_SECONDS = 600;
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

    if (currentUploadXhr) {
        currentUploadXhr.abort();
        console.log('Предыдущая загрузка отменена.');
    }

    selectFilesButton.disabled = true;

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

    // Обработчик события 'change' для videoInput - теперь обрабатывает несколько файлов
    videoInput.addEventListener('change', () => {
        generalStatusMessage.textContent = '';
        filesToUpload = Array.from(videoInput.files); // Преобразуем FileList в массив
        currentFileIndex = 0; // Сбрасываем индекс

        if (filesToUpload.length === 0) {
            validateInputs();
            return;
        }

        let allFilesValid = true;
        let filesToValidateMetadata = []; // Файлы, для которых нужна асинхронная проверка метаданных

        // Предварительная синхронная валидация размера
        for (const file of filesToUpload) {
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                generalStatusMessage.textContent = `Видео "${file.name}" слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                videoInput.value = ''; // Сброс всех выбранных файлов
                allFilesValid = false;
                break;
            }
            filesToValidateMetadata.push(file);
        }

        if (!allFilesValid) {
            validateInputs();
            return;
        }

        // Асинхронная валидация длительности для каждого файла
        let validationsCompleted = 0;
        const totalFilesForValidation = filesToValidateMetadata.length;

        if (totalFilesForValidation === 0) { // Если файлов нет или все отфильтрованы по размеру
             validateInputs();
             return;
        }

        filesToValidateMetadata.forEach((file, index) => {
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
                    videoInput.value = ''; // Сброс всех выбранных файлов
                    allFilesValid = false; // Отмечаем, что не все файлы валидны
                }

                validationsCompleted++;
                if (validationsCompleted === totalFilesForValidation) {
                    // Все асинхронные валидации завершены
                    if (allFilesValid) {
                        // Если все файлы валидны, запускаем загрузку первого
                        const username = instagramInput.value.trim();
                        const email = emailInput.value.trim();
                        const linkedin = linkedinInput.value.trim();

                        if (username || email || linkedin) {
                            // Начинаем загрузку первого файла из filesToUpload
                            if (filesToUpload.length > 0) {
                                uploadNextFile();
                            }
                        } else {
                            generalStatusMessage.textContent = 'Пожалуйста, заполните Instagram ID, Email или LinkedIn, чтобы начать загрузку.';
                            generalStatusMessage.style.color = 'var(--status-error-color)';
                            selectFilesButton.disabled = true;
                        }
                    } else {
                        // Если хотя бы один файл невалиден, сбрасываем все
                        filesToUpload = []; // Очищаем список для загрузки
                        validateInputs(); // Обновляем состояние кнопки
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
                    validateInputs();
                }
            };
        });
    });

    // Функция для загрузки следующего файла в очереди
    function uploadNextFile() {
        if (currentFileIndex < filesToUpload.length) {
            const file = filesToUpload[currentFileIndex];
            const username = instagramInput.value.trim();
            const email = emailInput.value.trim();
            const linkedin = linkedinInput.value.trim();

            uploadVideo(file, username, email, linkedin);
        } else {
            // Все файлы загружены
            generalStatusMessage.textContent = 'Все видео загружены!';
            generalStatusMessage.style.color = 'var(--status-completed-color)';
            selectFilesButton.disabled = false; // Снова активируем кнопку
            videoInput.value = ''; // Очищаем поле выбора файлов
            resetProgressBar();
            // После загрузки всех файлов, можно перейти на results.html
            // window.location.replace('results.html'); // Если нужен автоматический переход после ВСЕХ загрузок
        }
    }


    // Обработчик нажатия на кнопку "Upload Video(s)"
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

        // Если файлов нет в очереди, открываем диалог выбора файлов
        if (filesToUpload.length === 0 || videoInput.files.length === 0) {
            generalStatusMessage.textContent = 'Выберите видеофайл(ы)...';
            generalStatusMessage.style.color = 'var(--status-info-color)';
            videoInput.click();
            return;
        }

        // Если файлы уже выбраны и валидны (логика из change-события),
        // и пользователь нажал кнопку, запускаем загрузку (если она еще не началась)
        if (currentFileIndex < filesToUpload.length) {
            uploadNextFile(); // Запускаем или продолжаем загрузку
        }
    });

    function uploadVideo(file, username, email, linkedin) {
        selectFilesButton.disabled = true;
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
            // selectFilesButton.disabled = false; // Не включаем кнопку, пока все файлы не загружены
            // videoInput.value = ''; // Не очищаем сразу, чтобы можно было отслеживать прогресс

            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                const newVideoEntry = {
                    id: taskId,
                    original_filename: file.name,
                    status: 'pending',
                    timestamp: new Date().toISOString()
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                // --- НОВОЕ: Переходим на results.html сразу после загрузки каждого файла ---
                window.location.replace('results.html');
                // --- КОНЕЦ НОВОГО БЛОКА ---

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                generalStatusMessage.textContent = `Ошибка загрузки видео ${currentFileIndex + 1} из ${filesToUpload.length} ("${file.name}"): ${error.error || 'Неизвестная ошибка'}`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                resetProgressBar();
                selectFilesButton.disabled = false; // Включаем кнопку после ошибки
                validateInputs();
            }
            // currentFileIndex++; // Перемещаем сюда, чтобы инкрементировать после обработки текущего файла
            // uploadNextFile(); // Запускаем загрузку следующего файла
        };

        currentUploadXhr.onerror = function() {
            selectFilesButton.disabled = false;
            generalStatusMessage.textContent = `Ошибка сети во время загрузки видео ${currentFileIndex + 1} из ${filesToUpload.length} ("${file.name}").`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
            resetProgressBar();
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
        let allSelectedFilesAreValid = true; // Предполагаем, что все выбранные файлы валидны

        if (filesSelected) {
            // Проверяем все выбранные файлы на размер (длительность проверяется асинхронно)
            for (const file of Array.from(videoInput.files)) {
                if (file.size > MAX_VIDEO_SIZE_BYTES) {
                    allSelectedFilesAreValid = false;
                    break;
                }
            }
        }

        // Кнопка активна, если:
        // 1. Заполнено хотя бы одно из полей
        // И
        // 2. Либо файлы еще не выбраны (тогда клик по кнопке откроет диалог выбора),
        //    ЛИБО выбраны файлы, и все они прошли синхронную валидацию по размеру.
        //    (Асинхронная валидация длительности запускает загрузку или показывает ошибку)
        selectFilesButton.disabled = !(anyFieldFilled && (!filesSelected || allSelectedFilesAreValid));

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

    validateInputs();
});
