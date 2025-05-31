// В самом начале вашего script/upload_validation.js файла,
// ДО document.addEventListener('DOMContentLoaded', ...)

// Проверка на существующие видео и пользователя для перенаправления
const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');

// Если данные пользователя И загруженные видео существуют, перенаправляем на results.html
if ((existingUsername || existingEmail) && existingUploadedVideos && JSON.parse(existingUploadedVideos).length > 0) {
    window.location.replace('results.html');
}

document.addEventListener('DOMContentLoaded', () => {
    const instagramInput = document.getElementById('instagramInput');
    const emailInput = document.getElementById('emailInput');
    const videoInput = document.getElementById('videoFileInput');
    const selectFilesButton = document.getElementById('selectFilesButton'); // Это ваша кнопка "Upload Video(s)"
    const finishUploadButton = document.getElementById('finishUploadButton');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const uploadedVideosList = document.getElementById('uploadedVideosList');

    const videoPreview = document.getElementById('videoPreview');
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';
    // --- НОВЫЕ КОНСТАНТЫ ДЛЯ ЛИМИТОВ ВИДЕО ---
    const MAX_VIDEO_SIZE_MB = 100; // Максимальный размер видео в мегабайтах
    const MAX_VIDEO_DURATION_SECONDS = 60; // Максимальная длительность видео в секундах (10 минут = 600 сек)
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024; // Конвертация в байты
    // --- КОНЕЦ НОВЫХ КОНСТАНТ ---


    let currentUploadXhr = null; // Для отмены текущей загрузки

    // Загружаем сохраненные данные из localStorage при запуске
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let hifeEmail = localStorage.getItem('hifeEmail') || '';

    // Устанавливаем значения полей ввода, если они есть в localStorage
    instagramInput.value = hifeUsername;
    emailInput.value = hifeEmail;

    // Обновляем список загруженных видео при запуске
    updateUploadedVideosList();
    checkFinishButtonStatus();

    // Отменяем предыдущую загрузку, если она была активна
    if (currentUploadXhr) {
        currentUploadXhr.abort();
        console.log('Предыдущая загрузка отменена.');
    }

    // --- Ключевое изменение: Изначально кнопка Select Files Button неактивна
    selectFilesButton.disabled = true; // НЕАКТИВНА по умолчанию
    // --- Конец ключевого изменения

    // Обработчики ввода для Instagram и Email
    instagramInput.addEventListener('input', () => {
        const value = instagramInput.value.trim();
        localStorage.setItem('hifeUsername', value);
        hifeUsername = value;
        generalStatusMessage.textContent = ''; // Очищаем сообщение
        validateInputs(); // Вызываем валидацию для активации кнопки
    });

    emailInput.addEventListener('input', () => {
        const value = emailInput.value.trim();
        localStorage.setItem('hifeEmail', value);
        hifeEmail = value;
        generalStatusMessage.textContent = ''; // Очищаем сообщение
        validateInputs(); // Вызываем валидацию для активации кнопки
    });

    // Обработчик выбора файла
    videoInput.addEventListener('change', () => {
        generalStatusMessage.textContent = ''; // Очищаем сообщение при выборе файла
        const file = videoInput.files[0];
        if (file) {
            if (videoPreview) {
                const url = URL.createObjectURL(file);
                videoPreview.src = url;
                videoPreview.style.display = 'block';
                videoPreview.onloadedmetadata = () => {
                    URL.revokeObjectURL(url); // Очищаем URL-объект
                    // --- Валидация длительности после загрузки метаданных ---
                    if (videoPreview.duration > MAX_VIDEO_DURATION_SECONDS) {
                        generalStatusMessage.textContent = `Видео слишком длинное. Максимум ${MAX_VIDEO_DURATION_SECONDS / 60} минут.`;
                        generalStatusMessage.style.color = 'var(--status-error-color)';
                        selectFilesButton.disabled = true; // Отключаем кнопку, если видео слишком длинное
                        videoInput.value = ''; // Сброс выбранного файла
                        videoPreview.style.display = 'none'; // Скрыть превью
                        return;
                    } else {
                        // Если длительность ОК, убедимся, что кнопка активна (если данные пользователя введены)
                        validateInputs();
                    }
                };
            }
            // --- Валидация размера файла сразу после выбора (до onloadedmetadata) ---
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                generalStatusMessage.textContent = `Видео слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                selectFilesButton.disabled = true; // Отключаем кнопку, если видео слишком большое
                videoInput.value = ''; // Сброс выбранного файла
                if (videoPreview) videoPreview.style.display = 'none'; // Скрыть превью
                return;
            }
        } else {
            if (videoPreview) {
                videoPreview.style.display = 'none';
                videoPreview.src = '';
            }
            validateInputs(); // Валидируем состояние кнопки, если файл был убран
        }
    });

    // Обработчик нажатия на кнопку "Upload Video(s)"
    selectFilesButton.addEventListener('click', async () => {
        const file = videoInput.files[0];
        const username = instagramInput.value.trim();
        const email = emailInput.value.trim();

        // Повторная, более строгая валидация перед началом загрузки на сервер
        // (на случай, если пользователь изменил данные после выбора файла)
        if (!username && !email) {
            generalStatusMessage.textContent = 'Пожалуйста, введите Instagram ID или Email.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            return;
        }

        if (!file) {
            generalStatusMessage.textContent = 'Пожалуйста, выберите видеофайл для загрузки.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            return;
        }

        // --- Дополнительная проверка лимитов непосредственно перед загрузкой ---
        // (Это важно, т.к. onloadedmetadata может быть асинхронным)
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
            generalStatusMessage.textContent = `Видео слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
            videoInput.value = ''; // Сброс выбранного файла
            if (videoPreview) videoPreview.style.display = 'none'; // Скрыть превью
            validateInputs(); // Перепроверяем состояние кнопки
            return;
        }
        // Для длительности, надежнее всего положиться на onloadedmetadata,
        // но можно добавить запасную проверку если videoPreview.duration уже доступен
        if (videoPreview.duration && videoPreview.duration > MAX_VIDEO_DURATION_SECONDS) {
            generalStatusMessage.textContent = `Видео слишком длинное. Максимум ${MAX_VIDEO_DURATION_SECONDS / 60} минут.`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
            videoInput.value = ''; // Сброс выбранного файла
            videoPreview.style.display = 'none'; // Скрыть превью
            validateInputs(); // Перепроверяем состояние кнопки
            return;
        }
        // --- Конец дополнительной проверки лимитов ---


        // Если все условия пройдены, тогда отключаем кнопку и начинаем загрузку
        selectFilesButton.disabled = true; // Отключаем кнопку на время загрузки
        generalStatusMessage.textContent = 'Загрузка...';
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

        currentUploadXhr = new XMLHttpRequest();
        currentUploadXhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

        currentUploadXhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                if (progressBar) progressBar.style.width = `${percent.toFixed(0)}%`;
                if (progressText) progressText.textContent = `${percent.toFixed(0)}%`;
                generalStatusMessage.textContent = `Загрузка: ${file.name} (${percent.toFixed(0)}%)`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
            }
        });

        currentUploadXhr.onload = function() {
            selectFilesButton.disabled = false; // Активируем кнопку после завершения загрузки
            videoInput.value = ''; // Очищаем поле выбора файла
            if (videoPreview) {
                videoPreview.style.display = 'none';
                videoPreview.src = '';
            }

            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                generalStatusMessage.textContent = `Видео "${file.name}" загружено. ID задачи: ${taskId}.`;
                generalStatusMessage.style.color = 'var(--status-completed-color)';

                // Сохраняем информацию о загруженном видео
                const newVideoEntry = {
                    id: taskId,
                    original_filename: file.name,
                    status: 'pending',
                    timestamp: new Date().toISOString()
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                updateUploadedVideosList();
                checkFinishButtonStatus();
                resetProgressBar();

                setTimeout(() => {
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                    generalStatusMessage.textContent = '';
                }, 5000);

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                generalStatusMessage.textContent = `Ошибка загрузки "${file.name}": ${error.error || 'Неизвестная ошибка'}`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                resetProgressBar();
                validateInputs(); // Проверяем состояние кнопки после ошибки
            }
        };

        currentUploadXhr.onerror = function() {
            selectFilesButton.disabled = false; // Активируем кнопку после ошибки
            generalStatusMessage.textContent = 'Ошибка сети во время загрузки видео.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            resetProgressBar();
            validateInputs(); // Проверяем состояние кнопки после ошибки
        };

        currentUploadXhr.send(formData);
    });

    // "Finish" button handler
    finishUploadButton.addEventListener('click', () => {
        if (localStorage.getItem('uploadedVideos') && JSON.parse(localStorage.getItem('uploadedVideos')).length > 0) {
            window.location.replace('results.html');
        } else {
            generalStatusMessage.textContent = "Видео не загружено для отображения результатов.";
            generalStatusMessage.style.color = 'var(--status-pending-color)';
        }
    });

    // --- ОБНОВЛЕННАЯ ФУНКЦИЯ ВАЛИДАЦИИ КНОПКИ ---
    function validateInputs() {
        const usernameOrEmailFilled = instagramInput.value.trim() !== '' || emailInput.value.trim() !== '';
        // Кнопка активна, если заполнено Instagram ИЛИ Email, ИЛИ если уже выбран файл (для случая, если файл был выбран до заполнения полей)
        // Но по вашей логике, она должна активироваться только по заполнению полей.
        // Поэтому:
        selectFilesButton.disabled = !usernameOrEmailFilled;
    }
    // --- КОНЕЦ ОБНОВЛЕННОЙ ФУНКЦИИ ВАЛИДАЦИИ КНОПКИ ---

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
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
    }

    // Инициализируем состояние кнопки при загрузке страницы
    validateInputs();
});
