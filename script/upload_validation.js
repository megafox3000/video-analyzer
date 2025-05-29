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
console.log('generalStatusMessage:', generalStatusMessage); // ОЧЕНЬ ВАЖНО: убедитесь, что здесь не null
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

    // Instagram обязателен, и хотя бы одно поле должно быть заполнено
    const isSocialInputValid = instagramValue !== '' &&
                               (instagramValue !== '' || linkedinValue !== '' || emailValue !== '');

    selectFilesButton.disabled = !isSocialInputValid; // Включаем/отключаем кнопку выбора файлов
    if (!isSocialInputValid) {
        if (generalStatusMessage) { // Защита от null, хотя после исправления должно быть OK
            generalStatusMessage.textContent = 'Пожалуйста, заполните Instagram и хотя бы одно другое поле соцсети.';
            generalStatusMessage.className = 'status-message error';
        }
    } else {
        if (generalStatusMessage) { // Защита от null
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
    videoFileInput.click(); // Открываем скрытый input type="file"
});


// --- Функция для отображения статуса отдельного файла ---
function displayFileStatus(file, statusText, isError = false) {
    let fileStatusItem = document.getElementById(`file-status-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}`);
    if (!fileStatusItem) {
        fileStatusItem = document.createElement('div');
        fileStatusItem.id = `file-status-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
        fileStatusItem.className = 'file-status-item';
        fileValidationStatusList.appendChild(fileStatusItem);
    }
    fileStatusItem.innerHTML = `<strong>${file.name}</strong>: <span class="${isError ? 'status-message error' : 'status-message success'}">${statusText}</span>`;
}


// --- Обработчик изменения файла (после выбора файлов) ---
videoFileInput.addEventListener('change', async function() {
    filesToProcess = Array.from(this.files); // Получаем выбранные файлы как массив
    filesReadyForUpload = []; // Очищаем список готовых к загрузке файлов
    fileValidationStatusList.innerHTML = ''; // Очищаем предыдущий список статусов
    finishUploadButton.style.display = 'none'; // Скрываем кнопку "Финиш"
    finishUploadButton.disabled = true; // Делаем кнопку неактивной, пока не будет валидных файлов

    if (filesToProcess.length === 0) {
        if (generalStatusMessage) { // Защита от null
            generalStatusMessage.textContent = 'Видеофайлы не выбраны.';
            generalStatusMessage.className = 'status-message error';
        }
        return;
    }

    if (generalStatusMessage) { // Защита от null
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
                if (generalStatusMessage) { // Защита от null
                    generalStatusMessage.textContent = `Проверено ${totalFiles} файлов. ${filesReadyForUpload.length} готовы к загрузке.`;
                    generalStatusMessage.className = 'status-message success';
                }
            } else {
                if (generalStatusMessage) { // Защита от null
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
    if (generalStatusMessage) { // Защита от null
        generalStatusMessage.textContent = 'Начинается загрузка проверенных видео...';
        generalStatusMessage.className = 'status-message';
    }

    const username = instagramInput.value.trim();
    const linkedin = linkedinInput.value.trim();
    const email = emailInput.value.trim();

    let allUploadsSuccessful = true;
    const taskIds = []; // Собираем task IDs для передачи на results.html

    for (const file of filesReadyForUpload) {
        displayFileStatus(file, 'Загружается на Cloudinary...');
        try {
            // *** ЭТО ВАЖНЫЙ МОМЕНТ, который нужно связать с analyze.js ***
            // Этот блок был скопирован из вашего предоставленного кода.
            // Предполагается, что analyze.js теперь будет просто принимать данные
            // Если вы переместили логику uploadVideoToCloudinary в analyze.js
            // и хотите вызывать ее, то нужно убедиться, что analyze.js экспортирует эту функцию,
            // или что она глобально доступна (например, через window.uploadVideo).
            // В нашем текущем сценарии analyze.js больше не содержит fetch-запросов,
            // а upload_validation.js содержит. Это нормально, если вы так решили.

            const formData = new FormData();
            formData.append('file', file);
            formData.append('username', username); // Используем Instagram как username
            // Можно добавить и другие поля, если бэкенд их ожидает
            // formData.append('linkedin', linkedin);
            // formData.append('email', email);

            // Если вы решили оставить fetch-запрос здесь:
            const response = await fetch('https://video-meta-api.onrender.com/analyze', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                displayFileStatus(file, 'Успешно загружено!', false);
                if (generalStatusMessage) generalStatusMessage.textContent = 'Видео успешно загружено!';
                taskIds.push(data.taskId); // Сохраняем task ID для перехода на страницу результатов
            } else {
                displayFileStatus(file, `Ошибка загрузки: ${data.error || 'Неизвестная ошибка'}`, true);
                if (generalStatusMessage) generalStatusMessage.textContent = `Ошибка загрузки: ${data.error || 'Неизвестная ошибка'}`;
                allUploadsSuccessful = false;
            }

        } catch (error) {
            displayFileStatus(file, `Ошибка сети/сервера: ${error.message}`, true);
            if (generalStatusMessage) generalStatusMessage.textContent = `Ошибка сети/сервера: ${error.message}`;
            allUploadsSuccessful = false;
        }
    }

    finishUploadButton.disabled = false; // Снова включаем кнопку "Финиш" (на случай, если нужно повторить)

    if (allUploadsSuccessful && taskIds.length > 0) {
        if (generalStatusMessage) { // Защита от null
            generalStatusMessage.textContent = 'Все видео успешно загружены. Перенаправление...';
            generalStatusMessage.className = 'status-message success';
        }
        // Сохраняем taskIds в localStorage, чтобы results.html мог их прочитать
        localStorage.setItem('lastUploadedTaskIds', JSON.stringify(taskIds));
        // Перенаправляем на страницу результатов
        window.location.href = 'results.html';
    } else {
        if (generalStatusMessage) { // Защита от null
            generalStatusMessage.textContent = 'Не все видео загружены успешно. Проверьте ошибки выше.';
            generalStatusMessage.className = 'status-message error';
        }
    }
});
