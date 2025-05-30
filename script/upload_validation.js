// В самом начале вашего файла script/upload_validation.js,
// ПЕРЕД document.addEventListener('DOMContentLoaded', ...)

// Проверяем, есть ли уже загруженные видео и имя пользователя (т.е. пользователь уже прошел начальную загрузку)
// Получаем существующие данные пользователя для логики перенаправления
// (Эти переменные используются ТОЛЬКО для следующей проверки на results.html)
const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');

// Новый пользователь попадет на upload.html и сможет ввести данные.

// Если есть данные пользователя И загруженные видео, перенаправляем на results.html
// Эта проверка должна идти после проверки на полный сброс/отсутствие данных.
if ((existingUsername || existingEmail) && existingUploadedVideos) {
    window.location.replace('results.html');
}

document.addEventListener('DOMContentLoaded', () => {
    const instagramInput = document.getElementById('instagramInput');
    const emailInput = document.getElementById('emailInput');
    const videoInput = document.getElementById('videoFileInput'); // ИЗМЕНЕНО с 'videoInput' на 'videoFileInput'
    const startUploadButton = document.getElementById('selectFilesButton'); // ИЗМЕНЕНО с 'startUploadButton' на 'selectFilesButton'
    const finishUploadButton = document.getElementById('finishUploadButton'); // Получаем кнопку "Финиш"
    const uploadStatusContainer = document.getElementById('uploadStatusContainer');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const uploadedVideosList = document.getElementById('uploadedVideosList');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const videoPreview = document.getElementById('videoPreview');

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render

    let currentUploadXhr = null; // Для отмены текущей загрузки

    // Загружаем сохраненные данные из localStorage при старте
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let hifeEmail = localStorage.getItem('hifeEmail') || '';

    // Устанавливаем значения полей, если они есть в localStorage
    instagramInput.value = hifeUsername;
    emailInput.value = hifeEmail;

    // Обновляем список загруженных видео на старте
    updateUploadedVideosList();
    checkFinishButtonStatus();

    // Отменяем предыдущую загрузку, если она была активна
    if (currentUploadXhr) {
        currentUploadXhr.abort();
        console.log('Предыдущая загрузка отменена.');
    }

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

    videoInput.addEventListener('change', () => {
        validateInputs();
        if (videoInput.files.length > 0) {
            const file = videoInput.files[0];
            const url = URL.createObjectURL(file);
            videoPreview.src = url;
            videoPreview.style.display = 'block';
            videoPreview.onloadedmetadata = () => {
                URL.revokeObjectURL(url); // Очищаем объект URL после загрузки метаданных
            };
        } else {
            videoPreview.style.display = 'none';
            videoPreview.src = '';
        }
    });

    startUploadButton.addEventListener('click', async () => {
        const file = videoInput.files[0];
        const username = instagramInput.value.trim();
        const email = emailInput.value.trim();

        if (!file) {
            generalStatusMessage.textContent = 'Пожалуйста, выберите видео файл.';
            generalStatusMessage.style.color = 'red';
            return;
        }

        if (!username && !email) {
            generalStatusMessage.textContent = 'Пожалуйста, введите Instagram ID или Email.';
            generalStatusMessage.style.color = 'red';
            return;
        }

        // Деактивируем кнопку загрузки
        startUploadButton.disabled = true;
        generalStatusMessage.textContent = 'Загрузка...';
        generalStatusMessage.style.color = 'var(--status-info-color)';
        uploadStatusContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

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
                progressBar.style.width = `${percent.toFixed(0)}%`;
                progressText.textContent = `${percent.toFixed(0)}%`;
                generalStatusMessage.textContent = `Загрузка: ${file.name} (${percent.toFixed(0)}%)`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
            }
        });

        currentUploadXhr.onload = function() {
            startUploadButton.disabled = false; // Активируем кнопку после завершения
            videoInput.value = ''; // Очищаем инпут файл
            videoPreview.style.display = 'none';
            videoPreview.src = '';

            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                generalStatusMessage.textContent = `Видео "${file.name}" загружено. Task ID: ${taskId}.`;
                generalStatusMessage.style.color = 'var(--status-success-color)';

                // Сохраняем информацию о загруженном видео
                const newVideoEntry = {
                    id: taskId,
                    original_filename: file.name, // Сохраняем имя файла
                    status: 'pending', // Начальный статус
                    timestamp: new Date().toISOString()
                    // metadata и cloudinary_url будут добавлены позже при обновлении статуса
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                updateUploadedVideosList();
                checkFinishButtonStatus();
                resetProgressBar(); // Сбрасываем прогресс-бар

                // Опционально: скрыть контейнер статуса через несколько секунд
                setTimeout(() => {
                    uploadStatusContainer.style.display = 'none';
                    generalStatusMessage.textContent = '';
                }, 5000);

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                generalStatusMessage.textContent = `Ошибка загрузки "${file.name}": ${error.error || 'Неизвестная ошибка'}`;
                generalStatusMessage.style.color = 'red';
                resetProgressBar(); // Сбрасываем прогресс-бар
                // Оставляем сообщение об ошибке видимым
            }
        };

        currentUploadXhr.onerror = function() {
            startUploadButton.disabled = false; // Активируем кнопку после ошибки
            generalStatusMessage.textContent = 'Сетевая ошибка при загрузке видео.';
            generalStatusMessage.style.color = 'red';
            resetProgressBar(); // Сбрасываем прогресс-бар
        };

        currentUploadXhr.send(formData);
    });

    // Обработчик кнопки "Финиш"
    finishUploadButton.addEventListener('click', () => {
        if (localStorage.getItem('uploadedVideos')) { // Проверяем, есть ли что-то в localStorage
            // Перенаправляем на страницу результатов (results.html)
            // Используем replace() вместо href, чтобы предотвратить возврат назад на upload.html
            window.location.replace('results.html');
        } else {
            generalStatusMessage.textContent = "Нет загруженных видео для отображения результатов.";
            generalStatusMessage.style.color = 'orange';
        }
    });

    function validateInputs() {
        const usernameValid = instagramInput.value.trim() !== '';
        const emailValid = emailInput.value.trim() !== '';
        const fileSelected = videoInput.files.length > 0;

        // Кнопка "Начать загрузку" активна, если выбрано видео И (есть username ИЛИ email)
        startUploadButton.disabled = !fileSelected || (!usernameValid && !emailValid);
    }

    function updateUploadedVideosList() {
        uploadedVideosList.innerHTML = ''; // Очищаем текущий список
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
        // Кнопка "Финиш" активна, если есть хотя бы одно загруженное видео
        finishUploadButton.disabled = uploadedVideos.length === 0;
    }

    function resetProgressBar() {
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        uploadStatusContainer.style.display = 'none'; // Скрываем контейнер прогресса
    }

    // Инициализация при загрузке страницы
    validateInputs();
});
