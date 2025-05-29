// upload_validation.js

// --- Настройки для валидации ---
const MAX_FILE_SIZE_MB = 100; // Максимальный размер файла в мегабайтах
const MAX_DURATION_MINUTES = 5; // Максимальная продолжительность видео в минутах

const maxFileSize = MAX_FILE_SIZE_MB * 1024 * 1024; // Переводим МБ в байты
const maxDuration = MAX_DURATION_MINUTES * 60; // Переводим минуты в секунды

// --- Получаем ссылки на элементы DOM ---
const instagramInput = document.getElementById('instagramInput');
const linkedinInput = document.getElementById('linkedinInput');
const emailInput = document.getElementById('emailInput');

const videoFileInput = document.getElementById('videoFileInput'); // Скрытый input для выбора файлов
const selectFilesButton = document.getElementById('selectFilesButton'); // Кнопка "Upload Video(s)"
const generalStatusMessage = document.getElementById('generalStatusMessage'); // Общее сообщение о статусе (ИСПРАВЛЕНО ИМЯ ID)
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

    // Instagram обязателен
    const isInstagramValid = instagramValue !== '';
    // И хотя бы одно из трех полей должно быть заполнено
    const isAnySocialFilled = instagramValue !== '' || linkedinValue !== '' || emailValue !== '';


    // Кнопка выбора файлов активна, если Instagram заполнен и хотя бы одно из трех полей заполнено
    const isFormValid = isInstagramValid && isAnySocialFilled;

    selectFilesButton.disabled = !isFormValid;
    selectFilesButton.classList.toggle('disabled', !isFormValid); // Добавляем/убираем класс 'disabled' для стилей

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
        videoFileInput.click(); // Открываем скрытый input type="file"
    }
});


// --- Функция для отображения статуса отдельного файла ---
function displayFileStatus(file, statusText, isError = false, progress = -1) {
    let fileId = `file-status-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`; // Более надежное имя ID
    let fileStatusItem = document.getElementById(fileId);

    if (!fileStatusItem) {
        fileStatusItem = document.createElement('div');
        fileStatusItem.id = fileId;
        fileStatusItem.className = 'video-info-item'; // Используем новый класс для стилей

        // Создаем элементы для прогресса и текста
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
        // Обновляем текст статуса
        fileStatusItem.querySelector('.upload-status-text').textContent = statusText;
    }

    const spoilerBtn = fileStatusItem.querySelector('.spoiler-btn');
    const spoilerTextSpan = fileStatusItem.querySelector('.spoiler-text');
    const progressBar = fileStatusItem.querySelector('.progress-bar');
    const progressText = fileStatusItem.querySelector('.progress-text');

    if (isError) {
        spoilerBtn.style.setProperty('--upload-progress', '0%'); // Сбросить прогресс
        spoilerBtn.classList.remove('loaded-spoiler-btn'); // Убрать "золотой" вид
        spoilerTextSpan.style.color = 'var(--text-color-light)'; // Вернуть светлый текст
        fileStatusItem.classList.add('error-state'); // Возможно, для красной рамки
        progressBar.style.width = '0%';
        progressText.textContent = 'Ошибка';
    } else {
        fileStatusItem.classList.remove('error-state');
    }

    if (progress !== -1) {
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${progress}%`;
        if (progress === 100) {
            spoilerBtn.classList.add('loaded-spoiler-btn'); // Добавляем класс для золотого вида
            spoilerTextSpan.style.color = 'var(--text-color-dark)'; // Меняем цвет текста на темный
        } else {
             spoilerBtn.classList.remove('loaded-spoiler-btn');
             spoilerTextSpan.style.color = 'var(--text-color-light)';
        }
        spoilerBtn.style.setProperty('--upload-progress', `${progress}%`);
    }

    // Если нужна кнопка "Финиш" после валидации, она должна быть видна/активна
    if (filesReadyForUpload.length > 0 && generalStatusMessage.textContent.includes('готовы к загрузке')) {
        finishUploadButton.style.display = 'block';
        finishUploadButton.disabled = false;
    } else if (fileValidationStatusList.children.length === filesToProcess.length && filesReadyForUpload.length === 0) {
        // Если все файлы обработаны, но ни один не готов к загрузке
        finishUploadButton.style.display = 'none';
        finishUploadButton.disabled = true;
    }
}


// --- Обработчик изменения файла (после выбора файлов) ---
videoFileInput.addEventListener('change', async function() {
    filesToProcess = Array.from(this.files); // Получаем выбранные файлы как массив
    filesReadyForUpload = []; // Очищаем список готовых к загрузке файлов
    fileValidationStatusList.innerHTML = ''; // Очищаем предыдущий список статусов
    finishUploadButton.style.display = 'none'; // Скрываем кнопку "Финиш"
    finishUploadButton.disabled = true; // Делаем кнопку неактивной, пока не будет валидных файлов

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

        // 1. Проверка типа файла (повторно, если вдруг)
        if (!file.type.startsWith('video/')) {
            isValid = false;
            statusMessage = 'Не является видеофайлом.';
            displayFileStatus(file, statusMessage, true);
        }
        // 2. Проверка размера
        else if (file.size > maxFileSize) {
            isValid = false;
            statusMessage = `Слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ).`;
            displayFileStatus(file, statusMessage, true);
        }
        // 3. Проверка продолжительности (асинхронно)
        else {
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
                    filesReadyForUpload.push(file); // Добавляем в список готовых к загрузке
                }
            } catch (error) {
                isValid = false;
                statusMessage = `Ошибка чтения длительности: ${error.message || 'файл поврежден'}.`;
                displayFileStatus(file, statusMessage, true);
            }
        }
        allFilesProcessed++;

        // После обработки всех файлов, если есть хоть один валидный, показываем кнопку "Финиш"
        if (allFilesProcessed === totalFiles) {
            if (filesReadyForUpload.length > 0) {
                finishUploadButton.style.display = 'block'; // Показываем кнопку
                finishUploadButton.disabled = false; // Активируем кнопку
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


// --- Обработчик клика по кнопке "Финиш" ---
finishUploadButton.addEventListener('click', async function() {
    if (filesReadyForUpload.length === 0) {
        alert('Нет файлов, прошедших проверку, для загрузки!');
        return;
    }

    finishUploadButton.disabled = true; // Отключаем кнопку "Финиш" на время загрузки
    if (generalStatusMessage) {
        generalStatusMessage.textContent = 'Начинается загрузка проверенных видео...';
        generalStatusMessage.className = 'status-message';
    }

    const username = instagramInput.value.trim();
    // sessionStorage.setItem('hifeUsername', username); // Сохраняем имя пользователя в sessionStorage

    let allUploadsSuccessful = true;
    const taskIds = []; // Собираем task IDs для передачи на results.html

    for (const file of filesReadyForUpload) {
        // Обновляем статус для каждого файла в списке
        displayFileStatus(file, 'Загружается на сервер...', false, 0); // Начальный прогресс 0%

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('username', username);

            const response = await fetch('https://video-meta-api.onrender.com/analyze', {
                method: 'POST',
                body: formData,
                // Добавляем обработчик прогресса, если бэкенд поддерживает
                // Этот код для прогресса на фронте, но сервер должен его отправлять
                // onUploadProgress: (event) => {
                //     if (event.lengthComputable) {
                //         const percentCompleted = Math.round((event.loaded * 100) / event.total);
                //         displayFileStatus(file, `Загрузка: ${percentCompleted}%`, false, percentCompleted);
                //     }
                // },
            });

            const data = await response.json();

            if (response.ok) {
                displayFileStatus(file, 'Успешно загружено и отправлено на анализ!', false, 100); // 100% после успешной загрузки
                taskIds.push(data.taskId); // Сохраняем task ID для перехода на страницу результатов
            } else {
                displayFileStatus(file, `Ошибка загрузки/анализа: ${data.error || 'Неизвестная ошибка'}`, true);
                allUploadsSuccessful = false;
            }

        } catch (error) {
            displayFileStatus(file, `Ошибка сети/сервера: ${error.message}`, true);
            allUploadsSuccessful = false;
        }
    }

    // Сохраняем имя пользователя и ID задач в sessionStorage
    sessionStorage.setItem('hifeUsername', username);
    sessionStorage.setItem('pendingTaskIds', JSON.stringify(taskIds));

    // Важно: автоматический переход независимо от успешности всех загрузок,
    // но только если есть хоть какие-то задачи для отслеживания.
    if (taskIds.length > 0) {
        if (generalStatusMessage) {
            generalStatusMessage.textContent = 'Задачи отправлены на анализ. Перенаправление на страницу результатов...';
            generalStatusMessage.className = 'status-message success';
        }
        window.location.href = 'results.html'; // Автоматический переход
    } else {
        finishUploadButton.disabled = false; // Включаем кнопку обратно, если не переходим
        if (generalStatusMessage) {
            generalStatusMessage.textContent = 'Нет задач для отслеживания. Пожалуйста, попробуйте еще раз.';
            generalStatusMessage.className = 'status-message error';
        }
    }
});
