// script/upload_validation.js

// --- Настройки для валидации ---
const MAX_FILE_SIZE_MB = 100; // Максимальный размер файла в мегабайтах
const MAX_DURATION_MINUTES = 5; // Максимальная продолжительность видео в минутах

const maxFileSize = MAX_FILE_SIZE_MB * 1024 * 1024; // Переводим МБ в байты
const maxDuration = MAX_DURATION_MINUTES * 60; // Переводим минуты в секунды
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // URL бэкенда

// --- Получаем ссылки на элементы DOM ---
const instagramInput = document.getElementById('instagramInput');
const linkedinInput = document.getElementById('linkedinInput');
const emailInput = document.getElementById('emailInput');

const videoFileInput = document.getElementById('videoFileInput'); // Скрытый input для выбора файлов
const selectFilesButton = document.getElementById('selectFilesButton'); // Кнопка "Upload Video(s)"
const generalStatusMessage = document.getElementById('generalStatusMessage'); // Общее сообщение о статусе
const fileValidationStatusList = document.getElementById('fileValidationStatusList'); // Список статусов по файлам
const finishUploadButton = document.getElementById('finishUploadButton'); // Кнопка "Финиш"

// --- ДОБАВЛЕНЫ ОТЛАДОЧНЫЕ КОНСОЛИ ---
console.log('DOM elements initialized in upload_validation.js:');
console.log('instagramInput:', instagramInput);
console.log('linkedinInput:', linkedinInput);
console.log('emailInput:', emailInput);
console.log('videoFileInput:', videoFileInput);
console.log('selectFilesButton:', selectFilesButton);
console.log('generalStatusMessage:', generalStatusMessage);
console.log('fileValidationStatusList:', fileValidationStatusList);
console.log('finishUploadButton:', finishUploadButton);


// --- Глобальные переменные для хранения состояния ---
let filesToProcess = []; // Сырые файлы, выбранные пользователем
let filesReadyForUpload = []; // Файлы, прошедшие валидацию и готовые к отправке

// --- Функция для проверки полей соцсетей ---
function checkSocialInputs() {
    const instagramValue = instagramInput.value.trim();
    const linkedinValue = linkedinInput.value.trim();
    const emailValue = emailInput.value.trim();

    const isInstagramValid = instagramValue !== '';
    const isAnySocialFilled = instagramValue !== '' || linkedinValue !== '' || emailValue !== '';

    const isFormValid = isInstagramValid && isAnySocialFilled;

    selectFilesButton.disabled = !isFormValid;
    selectFilesButton.classList.toggle('disabled', !isFormValid);

    if (!isFormValid) {
        if (generalStatusMessage) {
            generalStatusMessage.textContent = 'Пожалуйста, заполните Instagram и хотя бы одно другое поле соцсети.';
            generalStatusMessage.className = 'status-message error';
        }
    } else {
        if (generalStatusMessage) {
            generalStatusMessage.textContent = '';
            generalStatusMessage.className = 'status-message';
        }
    }
}

// --- Обработчики ввода для полей соцсетей ---
instagramInput.addEventListener('input', checkSocialInputs);
linkedinInput.addEventListener('input', checkSocialInputs);
emailInput.addEventListener('input', checkSocialInputs);

// Изначальная проверка при загрузке страницы
document.addEventListener('DOMContentLoaded', checkSocialInputs);


// --- Обработчик клика по кнопке "Upload Video(s)" (открытие диалога выбора файлов) ---
selectFilesButton.addEventListener('click', function() {
    if (!selectFilesButton.disabled) {
        videoFileInput.click();
    }
});


// --- Функция для отображения статуса отдельного файла (будет также обновлять прогресс) ---
function displayFileStatus(file, statusText, isError = false, progress = -1) {
    let fileId = `file-status-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`;
    let fileStatusItem = document.getElementById(fileId);

    if (!fileStatusItem) {
        fileStatusItem = document.createElement('div');
        fileStatusItem.id = fileId;
        fileStatusItem.className = 'video-info-item';

        fileStatusItem.innerHTML = `
            <div class="spoiler-btn" data-upload-progress="0">
                <img class="spoiler-icon" src="assets/upload-icon.png" alt="Загрузка">
                <span class="spoiler-text"><strong>${file.name}</strong>: <span class="upload-status-text">${statusText}</span></span>
            </div>
            <div class="spoiler-content">
                <div class="progress-bar-container">
                    <div class="progress-bar"></div>
                    <span class="progress-text">0%</span>
                </div>
            </div>
        `;
        fileValidationStatusList.appendChild(fileStatusItem);
    } else {
        fileStatusItem.querySelector('.upload-status-text').textContent = statusText;
    }

    const spoilerBtn = fileStatusItem.querySelector('.spoiler-btn');
    const spoilerTextSpan = fileStatusItem.querySelector('.spoiler-text');
    const progressBar = fileStatusItem.querySelector('.progress-bar');
    const progressText = fileStatusItem.querySelector('.progress-text');
    const spoilerContent = fileStatusItem.querySelector('.spoiler-content');


    if (isError) {
        spoilerBtn.style.setProperty('--upload-progress', '0%');
        spoilerBtn.classList.remove('loaded-spoiler-btn');
        spoilerTextSpan.style.color = 'var(--text-color-light)';
        fileStatusItem.classList.add('error-state');
        progressBar.style.width = '0%';
        progressText.textContent = 'Ошибка';
        if (spoilerContent) spoilerContent.classList.add('visible');
    } else {
        fileStatusItem.classList.remove('error-state');
    }

    if (progress !== -1) {
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${progress}%`;
        if (progress === 100) {
            spoilerBtn.classList.add('loaded-spoiler-btn');
            spoilerTextSpan.style.color = 'var(--text-color-dark)';
            if (spoilerContent) spoilerContent.classList.remove('visible');
        } else {
             spoilerBtn.classList.remove('loaded-spoiler-btn');
             spoilerTextSpan.style.color = 'var(--text-color-light)';
             if (spoilerContent) spoilerContent.classList.add('visible');
        }
        spoilerBtn.style.setProperty('--upload-progress', `${progress}%`);
    }

    if (spoilerBtn && !spoilerBtn.dataset.hasClickListener) {
        spoilerBtn.addEventListener('click', () => {
            if (spoilerContent) {
                spoilerContent.classList.toggle('visible');
            }
        });
        spoilerBtn.dataset.hasClickListener = 'true';
    }

    if (filesReadyForUpload.length > 0 && generalStatusMessage.textContent.includes('готовы к загрузке')) {
        finishUploadButton.style.display = 'block';
        finishUploadButton.disabled = false;
    } else if (fileValidationStatusList.children.length === filesToProcess.length && filesReadyForUpload.length === 0) {
        finishUploadButton.style.display = 'none';
        finishUploadButton.disabled = true;
    }
}


// --- Обработчик изменения файла (после выбора файлов) ---
videoFileInput.addEventListener('change', async function() {
    filesToProcess = Array.from(this.files);
    filesReadyForUpload = [];
    fileValidationStatusList.innerHTML = '';
    finishUploadButton.style.display = 'none';
    finishUploadButton.disabled = true;

    if (filesToProcess.length === 0) {
        if (generalStatusMessage) {
            generalStatusMessage.textContent = 'Видеофайлы не выбраны.';
            generalStatusMessage.className = 'status-message error';
        }
        return;
    }

    if (generalStatusMessage) {
        generalStatusMessage.textContent = 'Проверка выбранных видеофайлов...';
        generalStatusMessage.className = 'status-message';
    }

    let allFilesProcessed = 0;
    const totalFiles = filesToProcess.length;

    for (const file of filesToProcess) {
        let isValid = true;
        let statusMessage = '';

        if (!file.type.startsWith('video/')) {
            isValid = false;
            statusMessage = 'Не является видеофайлом.';
            displayFileStatus(file, statusMessage, true);
        } else if (file.size > maxFileSize) {
            isValid = false;
            statusMessage = `Слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ).`;
            displayFileStatus(file, statusMessage, true);
        } else {
            displayFileStatus(file, 'Проверка длительности...');
            try {
                const duration = await getVideoDuration(file);
                if (duration > maxDuration) {
                    isValid = false;
                    statusMessage = `Слишком длинное (макс. ${MAX_DURATION_MINUTES} мин).`;
                    displayFileStatus(file, statusMessage, true);
                } else {
                    statusMessage = `ОК (длительность: ${duration.toFixed(0)} сек).`;
                    displayFileStatus(file, statusMessage, false);
                    filesReadyForUpload.push(file);
                }
            } catch (error) {
                isValid = false;
                statusMessage = `Ошибка чтения длительности: ${error.message || 'файл поврежден'}.`;
                displayFileStatus(file, statusMessage, true);
            }
        }
        allFilesProcessed++;

        if (allFilesProcessed === totalFiles) {
            if (filesReadyForUpload.length > 0) {
                finishUploadButton.style.display = 'block';
                finishUploadButton.disabled = false;
                if (generalStatusMessage) {
                    generalStatusMessage.textContent = `Проверено ${totalFiles} файлов. ${filesReadyForUpload.length} готовы к загрузке.`;
                    generalStatusMessage.className = 'status-message success';
                }
            } else {
                if (generalStatusMessage) {
                    generalStatusMessage.textContent = 'Все выбранные файлы не прошли проверку.';
                    generalStatusMessage.className = 'status-message error';
                }
            }
        }
    }
});

// --- Вспомогательная функция для асинхронного получения длительности видео ---
function getVideoDuration(file) {
    return new Promise((resolve, reject) => {
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';

        videoElement.onloadedmetadata = function() {
            window.URL.revokeObjectURL(videoElement.src);
            resolve(videoElement.duration);
        };

        videoElement.onerror = function() {
            window.URL.revokeObjectURL(videoElement.src);
            reject(new Error('Не удалось получить длительность видео.'));
        };

        videoElement.src = URL.createObjectURL(file);
    });
}


// --- Функция для загрузки видео и отслеживания прогресса (перенесена из analyze.js) ---
async function uploadVideoAndTrackProgress(file, userInfo) {
    displayFileStatus(file, 'Начинается загрузка на сервер...', false, 0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', userInfo.username);
    if (userInfo.linkedin) formData.append('linkedin', userInfo.linkedin);
    if (userInfo.email) formData.append('email', userInfo.email);

    return new Promise((resolve, reject) => {
        try {
            const xhr = new XMLHttpRequest();

            xhr.open('POST', `${RENDER_BACKEND_URL}/analyze`); // Используем константу URL

            xhr.upload.addEventListener('progress', function(event) {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    displayFileStatus(file, `Загрузка: ${percentComplete}%`, false, percentComplete);
                }
            });

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const data = JSON.parse(xhr.responseText);
                    displayFileStatus(file, 'Успешно загружено и отправлено на анализ!', false, 100);
                    resolve(data);
                } else {
                    const errorData = JSON.parse(xhr.responseText);
                    displayFileStatus(file, `Ошибка сервера: ${errorData.error || xhr.statusText}`, true);
                    reject(new Error(`Ошибка сервера: ${errorData.error || xhr.statusText}`));
                }
            };

            xhr.onerror = function() {
                displayFileStatus(file, 'Ошибка сети при загрузке файла.', true);
                reject(new Error('Ошибка сети при загрузке файла.'));
            };

            xhr.send(formData);

        } catch (error) {
            displayFileStatus(file, `Ошибка при подготовке загрузки: ${error.message}`, true);
            reject(new Error(`Ошибка при подготовке загрузки: ${error.message}`));
        }
    });
}


// --- Обработчик клика по кнопке "Финиш" ---
finishUploadButton.addEventListener('click', async function() {
    if (filesReadyForUpload.length === 0) {
        alert('Нет файлов, прошедших проверку, для загрузки!');
        return;
    }

    finishUploadButton.disabled = true;
    if (generalStatusMessage) {
        generalStatusMessage.textContent = 'Начинается загрузка проверенных видео...';
        generalStatusMessage.className = 'status-message';
    }

    const username = instagramInput.value.trim();
    const linkedin = linkedinInput.value.trim();
    const email = emailInput.value.trim();

    let allUploadsSuccessful = true;
    const taskIds = [];

    const userInfo = {
        username: username,
        linkedin: linkedin,
        email: email
    };

    for (const file of filesReadyForUpload) {
        try {
            const data = await uploadVideoAndTrackProgress(file, userInfo); // Вызываем локальную функцию
            if (data && data.taskId) {
                taskIds.push(data.taskId);
            } else {
                displayFileStatus(file, `Ошибка: не получен ID задачи`, true);
                allUploadsSuccessful = false;
            }
        } catch (error) {
            allUploadsSuccessful = false;
        }
    }

    sessionStorage.setItem('hifeUsername', username);
    sessionStorage.setItem('pendingTaskIds', JSON.stringify(taskIds));

    if (taskIds.length > 0) {
        if (generalStatusMessage) {
            generalStatusMessage.textContent = 'Задачи отправлены на анализ. Перенаправление на страницу результатов...';
            generalStatusMessage.className = 'status-message success';
        }
        window.location.href = 'results.html';
    } else {
        finishUploadButton.disabled = false;
        if (generalStatusMessage) {
            generalStatusMessage.textContent = 'Нет задач для отслеживания. Пожалуйста, попробуйте еще раз.';
            generalStatusMessage.className = 'status-message error';
        }
    }
});
