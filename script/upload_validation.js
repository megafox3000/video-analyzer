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
const generalUploadStatus = document.getElementById('generalUploadStatus'); // Общий статус
const fileValidationStatusList = document.getElementById('fileValidationStatusList'); // Список статусов по файлам
const finishUploadButton = document.getElementById('finishUploadButton'); // Кнопка "Финиш"

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
        generalUploadStatus.textContent = 'Пожалуйста, заполните Instagram и хотя бы одно другое поле соцсети.';
        generalUploadStatus.className = 'status-message error';
    } else {
        generalUploadStatus.textContent = '';
        generalUploadStatus.className = 'status-message';
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

    if (filesToProcess.length === 0) {
        generalUploadStatus.textContent = 'Видеофайлы не выбраны.';
        generalUploadStatus.className = 'status-message error';
        return;
    }

    generalUploadStatus.textContent = 'Проверка выбранных видеофайлов...';
    generalUploadStatus.className = 'status-message';

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
                generalUploadStatus.textContent = `Проверено ${totalFiles} файлов. ${filesReadyForUpload.length} готовы к загрузке.`;
                generalUploadStatus.className = 'status-message success';
            } else {
                generalUploadStatus.textContent = 'Все выбранные файлы не прошли проверку.';
                generalUploadStatus.className = 'status-message error';
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
    generalUploadStatus.textContent = 'Начинается загрузка проверенных видео...';
    generalUploadStatus.className = 'status-message';

    const username = instagramInput.value.trim();
    const linkedin = linkedinInput.value.trim();
    const email = emailInput.value.trim();

    // Здесь вам нужно убедиться, что analyze.js экспортирует функцию для загрузки
    // (например, uploadVideoToCloudinary(file, username, email, linkedin))
    // или что вы можете напрямую вызвать логику отправки.

    // Пример вызова функции из analyze.js для каждого файла
    // Если analyze.js не экспортирует, вам нужно будет либо
    // 1. Сделать функцию глобальной (не рекомендуется)
    // 2. Экспортировать её из analyze.js и импортировать сюда (нужен bundler, например Webpack/Parcel)
    // 3. Или встроить логику fetch API прямо здесь (что может сделать этот файл слишком большим)

    let allUploadsSuccessful = true;
    const taskIds = []; // Собираем task IDs для передачи на results.html

    for (const file of filesReadyForUpload) {
        displayFileStatus(file, 'Загружается на Cloudinary...');
        try {
            // *** ЭТО ВАЖНЫЙ МОМЕНТ, который нужно связать с analyze.js ***
            // Я предполагаю, что в analyze.js есть функция, которую можно вызвать
            // для отправки одного файла, и которая возвращает Promise с результатом.
            // Например: window.uploadVideo(file, username, email, linkedin);
            // Или если analyze.js использует глобальные переменные, то можно получить доступ к ним.

            // ВАРИАНТ 1: Если analyze.js делает свою работу и вы просто хотите вызвать её
            // Вам нужно убедиться, что analyze.js имеет функцию, которую можно вызвать извне
            // и которая принимает файл, username, email, linkedin.
            // Например, если в analyze.js есть функция function uploadVideo(file, username, ...) {...}
            // window.uploadVideo(file, username, email, linkedin); // Вызовите вашу функцию из analyze.js

            // ВАРИАНТ 2: Встроить логику отправки fetch API прямо сюда (если analyze.js не адаптирован)
            const formData = new FormData();
            formData.append('file', file);
            formData.append('username', username); // Используем Instagram как username
            // Можно добавить и другие поля, если бэкенд их ожидает
            // formData.append('linkedin', linkedin);
            // formData.append('email', email);

            const response = await fetch('https://video-meta-api.onrender.com/analyze', {
                method: 'POST',
                body: formData,
                // headers: {
                //    'Content-Type': 'multipart/form-data' // НЕ УСТАНАВЛИВАЙТЕ Content-Type для FormData, браузер сделает это сам
                // }
            });

            const data = await response.json();

            if (response.ok) {
                displayFileStatus(file, 'Успешно загружено!', false);
                generalUploadStatus.textContent = 'Видео успешно загружено!';
                taskIds.push(data.taskId); // Сохраняем task ID для перехода на страницу результатов
            } else {
                displayFileStatus(file, `Ошибка загрузки: ${data.error || 'Неизвестная ошибка'}`, true);
                generalUploadStatus.textContent = `Ошибка загрузки: ${data.error || 'Неизвестная ошибка'}`;
                allUploadsSuccessful = false;
            }

        } catch (error) {
            displayFileStatus(file, `Ошибка сети/сервера: ${error.message}`, true);
            generalUploadStatus.textContent = `Ошибка сети/сервера: ${error.message}`;
            allUploadsSuccessful = false;
        }
    }

    finishUploadButton.disabled = false; // Снова включаем кнопку "Финиш" (на случай, если нужно повторить)

    if (allUploadsSuccessful && taskIds.length > 0) {
        generalUploadStatus.textContent = 'Все видео успешно загружены. Перенаправление...';
        generalUploadStatus.className = 'status-message success';
        // Сохраняем taskIds в localStorage, чтобы results.html мог их прочитать
        localStorage.setItem('lastUploadedTaskIds', JSON.stringify(taskIds));
        // Перенаправляем на страницу результатов
        window.location.href = 'results.html';
    } else {
        generalUploadStatus.textContent = 'Не все видео загружены успешно. Проверьте ошибки выше.';
        generalUploadStatus.className = 'status-message error';
    }
});
