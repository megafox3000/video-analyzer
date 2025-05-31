// В самом начале вашего файла script/upload_validation.js,
// ПЕРЕД document.addEventListener('DOMContentLoaded', ...)

// Проверяем, есть ли уже загруженные видео и имя пользователя (т.е. пользователь уже прошел начальную загрузку)
// Если есть данные пользователя И загруженные видео, перенаправляем на results.html
// (Опционально: можно закомментировать, если хотите, чтобы пользователь всегда начинал с этой страницы)
// const existingUploadedVideosOnLoad = localStorage.getItem('uploadedVideos');
// const existingUsernameOnLoad = localStorage.getItem('hifeUsername');
// const existingEmailOnLoad = localStorage.getItem('hifeEmail');
// if ((existingUsernameOnLoad || existingEmailOnLoad) && existingUploadedVideosOnLoad) {
//     window.location.replace('results.html');
// }


document.addEventListener('DOMContentLoaded', () => {
    const instagramInput = document.getElementById('instagramInput');
    const emailInput = document.getElementById('emailInput');
    const videoFileInput = document.getElementById('videoFileInput');
    const selectFilesButton = document.getElementById('selectFilesButton');
    const finishUploadButton = document.getElementById('finishUploadButton'); // Теперь это "Перейти к Результатам"

    // Элементы DOM для статуса и прогресса
    const uploadStatusContainer = document.getElementById('uploadStatusContainer');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const uploadedVideosList = document.getElementById('uploadedVideosList');
    const fileValidationStatusList = document.getElementById('fileValidationStatusList'); // Список для статусов валидации
    // const videoPreview = document.getElementById('videoPreview'); // УДАЛЕНО: Элемент для предварительного просмотра

    // Константы для максимального размера и длительности
    const MAX_FILE_SIZE_MB = 100; // Максимальный размер файла в мегабайтах (100 МБ)
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024; // Переводим в байты
    const MAX_VIDEO_DURATION_SECONDS = 60; // Максимальная длительность видео в секундах (1 минута)

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render

    // Загружаем сохраненные данные из localStorage при старте
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let hifeEmail = localStorage.getItem('hifeEmail') || '';

    // Устанавливаем значения полей, если они есть в localStorage
    instagramInput.value = hifeUsername;
    emailInput.value = hifeEmail;

    // Обновляем списки на старте
    updateUploadedVideosList();
    updateFileValidationStatusListPlaceholder(); // Изначальное сообщение
    checkFinishButtonStatus();

    // Обработчики ввода соцсетей
    instagramInput.addEventListener('input', () => {
        const value = instagramInput.value.trim();
        localStorage.setItem('hifeUsername', value);
        hifeUsername = value;
        validateInputs();
    });

    emailInput.addEventListener('input', () => {
        const value = emailInput.value.trim();
        localStorage.setItem('hifeEmail', value);
        hifeEmail = value;
        validateInputs();
    });

    // selectFilesButton запускает скрытый файловый ввод
    selectFilesButton.addEventListener('click', () => {
        if (selectFilesButton.disabled) {
            return;
        }
        videoFileInput.click();
    });

    // videoFileInput change event: валидация и немедленная загрузка
    videoFileInput.addEventListener('change', async () => {
        const files = videoFileInput.files;
        fileValidationStatusList.innerHTML = ''; // Очищаем предыдущие статусы
        // videoPreview.style.display = 'none'; // УДАЛЕНО
        // videoPreview.src = ''; // УДАЛЕНО
        resetProgressBar(); // Сбрасываем прогресс бар

        if (files.length === 0) {
            generalStatusMessage.textContent = 'Выбор файла отменен.';
            generalStatusMessage.style.color = 'var(--status-info-color)';
            uploadStatusContainer.style.display = 'none';
            return;
        }

        let validFilesCount = 0;
        let invalidFilesCount = 0;
        let filesToProcess = [];

        // Сначала валидируем все файлы
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let isValid = true;
            let validationMessage = '';

            // 1. Проверка размера файла
            if (file.size > MAX_FILE_SIZE_BYTES) {
                validationMessage = `Ошибка: файл "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} МБ) превышает ${MAX_FILE_SIZE_MB} МБ.`;
                isValid = false;
            }

            // 2. Проверка длительности видео (только если размер в норме)
            if (isValid) {
                try {
                    const duration = await getVideoDuration(file);
                    if (duration > MAX_VIDEO_DURATION_SECONDS) {
                        validationMessage = `Ошибка: длительность видео "${file.name}" (${Math.floor(duration / 60)} мин ${Math.floor(duration % 60)} сек) превышает ${MAX_VIDEO_DURATION_SECONDS / 60} минуту.`;
                        isValid = false;
                    }
                } catch (error) {
                    validationMessage = `Ошибка: Не удалось получить длительность видео "${file.name}". ${error.message || 'Возможно, файл поврежден или имеет неподдерживаемый формат.'}`;
                    isValid = false;
                }
            }

            const li = document.createElement('li');
            li.textContent = `${file.name}: `;
            if (isValid) {
                li.innerHTML += `<span class="status-success">Готов к загрузке</span>`;
                validFilesCount++;
                filesToProcess.push(file); // Добавляем файл в очередь на загрузку
            } else {
                li.innerHTML += `<span class="status-error">${validationMessage}</span>`;
                invalidFilesCount++;
            }
            fileValidationStatusList.appendChild(li);
        }

        // Обновляем общее сообщение о статусе после первичной валидации
        if (validFilesCount > 0 && invalidFilesCount === 0) {
            generalStatusMessage.textContent = `${validFilesCount} файл(ов) готов(ы) к загрузке. Начинаю загрузку...`;
            generalStatusMessage.style.color = 'var(--status-info-color)';
        } else if (validFilesCount > 0 && invalidFilesCount > 0) {
            generalStatusMessage.textContent = `${validFilesCount} файл(ов) готов(ы) к загрузке. ${invalidFilesCount} файл(ов) отклонен(ы). Начинаю загрузку валидных...`;
            generalStatusMessage.style.color = 'var(--status-warning-color)';
        } else if (invalidFilesCount > 0) {
            generalStatusMessage.textContent = `Все выбранные файлы были отклонены: ${invalidFilesCount} с ошибками.`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
        } else {
            generalStatusMessage.textContent = 'Нет файлов для загрузки.';
            generalStatusMessage.style.color = 'var(--status-info-color)';
        }

        // УДАЛЕНО: Логика предпросмотра
        // if (filesToProcess.length === 1) {
        //     const url = URL.createObjectURL(filesToProcess[0]);
        //     videoPreview.src = url;
        //     videoPreview.style.display = 'block';
        //     videoPreview.onloadedmetadata = () => {
        //         URL.revokeObjectURL(url);
        //     };
        // } else {
        //     videoPreview.style.display = 'none';
        //     videoPreview.src = '';
        // }

        // Очищаем поле ввода файла, чтобы можно было выбрать те же файлы снова
        videoFileInput.value = '';

        // Теперь запускаем загрузку валидных файлов последовательно
        if (filesToProcess.length > 0) {
            uploadStatusContainer.style.display = 'block';
            progressBar.parentElement.style.display = 'flex';
            generalStatusMessage.textContent = `Начинается загрузка ${filesToProcess.length} файла(ов)...`;
            generalStatusMessage.style.color = 'var(--status-info-color)';

            for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                generalStatusMessage.textContent = `Загрузка файла ${i + 1}/${filesToProcess.length}: ${file.name}...`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
                resetProgressBar(); // Сбрасываем прогресс для каждого нового файла

                await uploadVideoPromise(file, instagramInput.value.trim(), emailInput.value.trim());
            }

            generalStatusMessage.textContent = `Все загрузки завершены. ${validFilesCount} успешно, ${invalidFilesCount} с ошибками валидации.`;
            generalStatusMessage.style.color = 'var(--status-completed-color)';
            resetProgressBar();
            setTimeout(() => {
                uploadStatusContainer.style.display = 'none';
                generalStatusMessage.textContent = '';
            }, 5000); // Сообщение исчезнет через 5 секунд

        } else {
            // Если нет файлов для загрузки, скрыть прогресс-бар
            uploadStatusContainer.style.display = 'none';
        }

        checkFinishButtonStatus(); // Обновить состояние кнопки "Перейти к Результатам"
        validateInputs(); // Повторно валидировать основные кнопки
    });


    // Функция для получения длительности видео (используется на обеих страницах)
    function getVideoDuration(file) {
        return new Promise((resolve, reject) => {
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';

            tempVideo.onloadedmetadata = () => {
                window.URL.revokeObjectURL(tempVideo.src);
                resolve(tempVideo.duration);
            };

            tempVideo.onerror = (e) => {
                window.URL.revokeObjectURL(tempVideo.src);
                let errorMessage = `Не удалось получить длительность видео "${file.name}".`;
                if (tempVideo.error) {
                    errorMessage += ` Код ошибки: ${tempVideo.error.code}. Сообщение: ${tempVideo.error.message}.`;
                } else {
                    errorMessage += ` Возможно, файл поврежден или имеет неподдерживаемый формат.`;
                }
                reject(new Error(errorMessage));
            };

            tempVideo.src = window.URL.createObjectURL(file);
        });
    }

    // Функция для загрузки видео на бэкенд (используется на обеих страницах)
    function uploadVideoPromise(file, username, email) {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('video', file);
            if (username) {
                formData.append('instagram_username', username);
            }
            if (email) {
                formData.append('email', email);
            }

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    progressBar.style.width = `${percent.toFixed(0)}%`;
                    progressText.textContent = `${percent.toFixed(0)}%`;
                }
            });

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId;

                    // Обновляем глобальный массив uploadedVideos и localStorage
                    const newVideoEntry = {
                        id: taskId,
                        original_filename: file.name,
                        status: 'pending', // Начальный статус
                        timestamp: new Date().toISOString()
                    };
                    uploadedVideos.push(newVideoEntry);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                    updateUploadedVideosList(); // Обновить список уже загруженных видео
                    checkFinishButtonStatus(); // Обновить состояние кнопки "Перейти к Результатам"
                    resolve(true); // Указываем на успех
                } else {
                    const error = JSON.parse(xhr.responseText);
                    console.error(`Ошибка загрузки "${file.name}":`, error);
                    resolve(false); // Указываем на сбой
                }
            };

            xhr.onerror = function() {
                console.error(`Сетевая ошибка при загрузке видео "${file.name}".`);
                resolve(false); // Указываем на сбой
            };

            xhr.send(formData);
        });
    }

    // Обработчик кнопки "Перейти к Результатам" теперь только перенаправляет
    finishUploadButton.addEventListener('click', () => {
        window.location.replace('results.html');
    });

    // Функция для очистки/показа сообщения по умолчанию для списка валидации
    function updateFileValidationStatusListPlaceholder() {
        fileValidationStatusList.innerHTML = '<p>Выберите видео для анализа.</p>';
    }

    // Обновление списка успешно загруженных видео (на этой странице)
    function updateUploadedVideosList() {
        uploadedVideosList.innerHTML = '';
        if (uploadedVideos.length === 0) {
            uploadedVideosList.innerHTML = '<p>Пока нет успешно загруженных видео.</p>';
        } else {
            uploadedVideos.forEach(video => {
                const li = document.createElement('li');
                // Отображаем filename, ID и статус
                li.textContent = `${video.original_filename} (ID: ${video.id}) - Статус: ${video.status}`;
                uploadedVideosList.appendChild(li);
            });
        }
    }

    // Проверка состояния кнопки "Перейти к Результатам" (только наличие загруженных видео)
    function checkFinishButtonStatus() {
        if (uploadedVideos.length > 0) {
            finishUploadButton.disabled = false;
            finishUploadButton.style.display = 'inline-block';
            finishUploadButton.textContent = 'Перейти к Результатам';
        } else {
            finishUploadButton.disabled = true;
            finishUploadButton.style.display = 'none';
        }
    }

    // Проверка активности кнопки выбора файлов (зависит от соц. данных)
    function validateInputs() {
        if (hifeUsername || hifeEmail) {
            selectFilesButton.disabled = false;
        } else {
            selectFilesButton.disabled = true;
        }
    }

    // Сброс прогресс-бара
    function resetProgressBar() {
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        // if (progressBar && progressBar.parentElement) progressBar.parentElement.style.display = 'none'; // Можно скрыть, если не нужна постоянная видимость
    }

    // Начальная настройка при загрузке страницы
    validateInputs(); // Валидация кнопки выбора файлов
    if (uploadStatusContainer) uploadStatusContainer.style.display = 'none';
    if (progressBar && progressBar.parentElement) progressBar.parentElement.style.display = 'none';
    updateFileValidationStatusListPlaceholder(); // Установим начальное сообщение
});
