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
const generalStatusMessage = document.getElementById('generalStatusMessage'); // Общее сообщение о статусе
const fileValidationStatusList = document.getElementById('fileValidationStatusList'); // Список статусов по файлам
const finishUploadButton = document.getElementById('finishUploadButton'); // Кнопка "Финиш"

// --- Глобальные переменные для хранения состояния ---
// filesToProcess не нужен, т.к. работаем напрямую с event.target.files
let filesReadyForUpload = []; // Файлы, прошедшие валидацию и готовые к отправке

// --- Функция для проверки полей соцсетей ---
function checkSocialInputs() {
    const instagramValue = instagramInput.value.trim();
    const linkedinValue = linkedinInput.value.trim();
    const emailValue = emailInput.value.trim();

    // Instagram обязателен, и хотя бы одно поле должно быть заполнено
    const isSocialInputValid = instagramValue !== '' &&
                               (instagramValue !== '' || linkedinValue !== '' || emailValue !== '');

    selectFilesButton.disabled = !isSocialInputValid; // Включаем/отключаем кнопку выбора файлов
    if (!isSocialInputValid) {
        generalStatusMessage.textContent = 'Пожалуйста, заполните Instagram и хотя бы одно другое поле соцсети.';
        generalStatusMessage.className = 'status-message error';
    } else {
        generalStatusMessage.textContent = ''; // Очищаем сообщение, если поля заполнены
        generalStatusMessage.className = 'status-message';
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
    videoFileInput.click(); // Открываем скрытый input type="file"
});


// --- Функция для отображения статуса отдельного файла ---
function displayFileValidationStatus(file, statusText, isError = false) {
    // Создаем или находим существующий элемент для файла
    let fileStatusItem = document.getElementById(`validation-status-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}`);
    if (!fileStatusItem) {
        fileStatusItem = document.createElement('div');
        fileStatusItem.id = `validation-status-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
        fileStatusItem.className = 'file-validation-item';
        fileValidationStatusList.appendChild(fileStatusItem);
    }
    fileStatusItem.innerHTML = `<span><strong>${file.name}</strong>: </span><span class="status-text ${isError ? 'status-message error' : 'status-message success'}">${statusText}</span>`;
}


// --- Обработчик изменения файла (после выбора файлов) ---
videoFileInput.addEventListener('change', async function() {
    const selectedFiles = Array.from(this.files); // Получаем выбранные файлы как массив
    filesReadyForUpload = []; // Очищаем список готовых к загрузке файлов
    fileValidationStatusList.innerHTML = ''; // Очищаем предыдущий список статусов
    finishUploadButton.style.display = 'none'; // Скрываем кнопку "Финиш"
    finishUploadButton.disabled = true; // Делаем кнопку неактивной

    if (selectedFiles.length === 0) {
        generalStatusMessage.textContent = 'Видеофайлы не выбраны.';
        generalStatusMessage.className = 'status-message error';
        return;
    }

    generalStatusMessage.textContent = 'Проверка выбранных видеофайлов...';
    generalStatusMessage.className = 'status-message';

    let validatedCount = 0;
    const totalFiles = selectedFiles.length;

    for (const file of selectedFiles) {
        let isValid = true;
        let statusMessage = '';

        // 1. Проверка типа файла
        if (!file.type.startsWith('video/')) {
            isValid = false;
            statusMessage = 'Не является видеофайлом.';
            displayFileValidationStatus(file, statusMessage, true);
        }
        // 2. Проверка размера
        else if (file.size > maxFileSize) {
            isValid = false;
            statusMessage = `Слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ).`;
            displayFileValidationStatus(file, statusMessage, true);
        }
        // 3. Проверка продолжительности (асинхронно)
        else {
            displayFileValidationStatus(file, 'Проверка длительности...');
            try {
                const duration = await getVideoDuration(file);
                if (duration > maxDuration) {
                    isValid = false;
                    statusMessage = `Слишком длинное (макс. ${MAX_DURATION_MINUTES} мин).`;
                    displayFileValidationStatus(file, statusMessage, true);
                } else {
                    statusMessage = `ОК (длительность: ${duration.toFixed(0)} сек).`;
                    displayFileValidationStatus(file, statusMessage, false);
                    filesReadyForUpload.push(file); // Добавляем в список готовых к загрузке
                }
            } catch (error) {
                isValid = false;
                statusMessage = `Ошибка чтения длительности: ${error.message || 'файл поврежден'}.`;
                displayFileValidationStatus(file, statusMessage, true);
            }
        }
        validatedCount++;

        // После обработки всех файлов, если есть хоть один валидный, показываем кнопку "Финиш"
        if (validatedCount === totalFiles) {
            if (filesReadyForUpload.length > 0) {
                finishUploadButton.style.display = 'block'; // Показываем кнопку
                finishUploadButton.disabled = false; // Активируем кнопку
                generalStatusMessage.textContent = `Проверено ${totalFiles} файлов. ${filesReadyForUpload.length} готовы к загрузке.`;
                generalStatusMessage.className = 'status-message success';
            } else {
                generalStatusMessage.textContent = 'Все выбранные файлы не прошли проверку.';
                generalStatusMessage.className = 'status-message error';
                finishUploadButton.style.display = 'none'; // Скрываем кнопку, если нет валидных файлов
                finishUploadButton.disabled = true;
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
    generalStatusMessage.textContent = 'Начинается загрузка проверенных видео...';
    generalStatusMessage.className = 'status-message';

    const instagramUsername = instagramInput.value.trim();
    const linkedinValue = linkedinInput.value.trim();
    const emailValue = emailInput.value.trim();

    const pendingTaskIds = []; // Массив для хранения ID задач от бэкенда для results.html

    // Здесь вызываем функцию из analyze.js для каждого валидного файла
    // Используем window.uploadVideoAndTrackProgress, которая будет определена в analyze.js
    for (const file of filesReadyForUpload) {
        displayFileValidationStatus(file, 'Загружается на Cloudinary...'); // Обновляем статус для каждого файла
        try {
            // Предполагаем, что uploadVideoAndTrackProgress вернет TaskId при успешной загрузке
            const taskData = await window.uploadVideoAndTrackProgress(file, instagramUsername, linkedinValue, emailValue);
            if (taskData && taskData.taskId) {
                pendingTaskIds.push(taskData.taskId);
                displayFileValidationStatus(file, 'Успешно загружено!', false);
            } else {
                throw new Error('Не получен Task ID от сервера.');
            }
        } catch (error) {
            displayFileValidationStatus(file, `Ошибка загрузки: ${error.message}`, true);
            console.error(`Ошибка загрузки файла ${file.name}:`, error);
        }
    }

    finishUploadButton.disabled = false; // Включаем кнопку "Финиш" (на случай, если нужно повторить)

    if (pendingTaskIds.length > 0) {
        generalStatusMessage.textContent = 'Все валидные видео отправлены. Перенаправление на страницу результатов...';
        generalStatusMessage.className = 'status-message success';
        // Сохраняем taskIds в sessionStorage, чтобы results.html мог их прочитать
        sessionStorage.setItem('pendingTaskIds', JSON.stringify(pendingTaskIds));
        sessionStorage.setItem('hifeUsername', instagramUsername); // Сохраняем имя пользователя
        // Перенаправляем на страницу результатов
        window.location.href = 'results.html';
    } else {
        generalStatusMessage.textContent = 'Ни один файл не был успешно загружен на сервер.';
        generalStatusMessage.className = 'status-message error';
    }
});
