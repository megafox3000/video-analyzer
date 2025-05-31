// В самом начале вашего script/upload_validation.js файла,
// ДО document.addEventListener('DOMContentLoaded', ...)

const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');
const existingLinkedin = localStorage.getItem('hifeLinkedin');

// Если данные пользователя И загруженные видео существуют, перенаправляем на results.html
if ((existingUsername || existingEmail || existingLinkedin) && existingUploadedVideos && JSON.parse(existingUploadedVideos).length > 0) {
    window.location.replace('results.html');
}

document.addEventListener('DOMContentLoaded', () => {
    const instagramInput = document.getElementById('instagramInput');
    const emailInput = document.getElementById('emailInput');
    const linkedinInput = document.getElementById('linkedinInput');
    const videoInput = document.getElementById('videoFileInput'); // Input type="file"
    const selectFilesButton = document.getElementById('selectFilesButton'); // Ваша кнопка
    const finishUploadButton = document.getElementById('finishUploadButton');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const uploadedVideosList = document.getElementById('uploadedVideosList');

    // Эти элементы отсутствуют в вашем HTML, но используются в JS.
    // Если их нет, код будет генерировать ошибки.
    // Если они нужны для прогресса/превью, убедитесь, что они есть в HTML.
    // Пока я их закомментирую или поставлю заглушки, чтобы избежать ошибок.
    const videoPreview = document.getElementById('videoPreview'); // Этот элемент есть в старом HTML
    const progressBarContainer = document.querySelector('.progress-bar-container'); // Этого нет в старом HTML
    const progressBar = document.getElementById('progressBar'); // Этого нет в старом HTML
    const progressText = document.getElementById('progressText'); // Этого нет в старом HTML


    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';
    const MAX_VIDEO_SIZE_MB = 100;
    const MAX_VIDEO_DURATION_SECONDS = 600;
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

    let currentUploadXhr = null;

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

    // Кнопка изначально неактивна
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

    // Обработчик события 'change' для videoInput
    // Срабатывает после того, как пользователь выбрал файл в системном диалоге
    videoInput.addEventListener('change', () => {
        generalStatusMessage.textContent = '';
        const file = videoInput.files[0];

        if (file) {
            // Валидация размера
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                generalStatusMessage.textContent = `Видео слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                videoInput.value = ''; // Сброс выбранного файла
                if (videoPreview) videoPreview.style.display = 'none';
                validateInputs(); // Обновить состояние кнопки
                return;
            }

            if (videoPreview) {
                const url = URL.createObjectURL(file);
                videoPreview.src = url;
                videoPreview.style.display = 'block';
                videoPreview.onloadedmetadata = () => {
                    URL.revokeObjectURL(url);
                    // Валидация длительности
                    if (videoPreview.duration > MAX_VIDEO_DURATION_SECONDS) {
                        generalStatusMessage.textContent = `Видео слишком длинное. Максимум ${MAX_VIDEO_DURATION_SECONDS / 60} минут.`;
                        generalStatusMessage.style.color = 'var(--status-error-color)';
                        videoInput.value = ''; // Сброс выбранного файла
                        videoPreview.style.display = 'none';
                        validateInputs(); // Обновить состояние кнопки
                        return;
                    } else {
                        // Если длительность ОК, и поля заполнены, кнопка активна для начала загрузки
                        validateInputs();
                        // Здесь можно сразу начать загрузку, если это желаемое поведение после выбора файла.
                        // uploadVideo(file, instagramInput.value.trim(), emailInput.value.trim(), linkedinInput.value.trim());
                    }
                };
            } else {
                // Если videoPreview не существует, но файл выбран и размер ОК, просто активируем кнопку
                validateInputs();
            }
        } else { // Если пользователь отменил выбор файла или убрал его
            if (videoPreview) {
                videoPreview.style.display = 'none';
                videoPreview.src = '';
            }
            validateInputs(); // Перепроверяем состояние кнопки
        }
    });

    // Обработчик нажатия на кнопку "Upload Video(s)"
    selectFilesButton.addEventListener('click', async () => {
        const username = instagramInput.value.trim();
        const email = emailInput.value.trim();
        const linkedin = linkedinInput.value.trim();
        let file = videoInput.files[0]; // Получаем файл, если он уже выбран

        // Проверка заполненности полей Instagram/Email/LinkedIn
        if (!username && !email && !linkedin) {
            generalStatusMessage.textContent = 'Пожалуйста, введите Instagram ID, Email или LinkedIn.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            validateInputs(); // Перепроверить состояние кнопки
            return;
        }

        // Если файл еще не выбран, программно кликаем на скрытый инпут
        if (!file) {
            generalStatusMessage.textContent = 'Выберите видеофайл...';
            generalStatusMessage.style.color = 'var(--status-info-color)';
            videoInput.click(); // <-- ЭТО САМОЕ ВАЖНОЕ: открываем системный диалог выбора файла
            return; // Прекращаем выполнение, ждем выбора файла через 'change' событие
        }

        // Если файл уже выбран и поля заполнены, запускаем процесс загрузки.
        // Дополнительная валидация лимитов (на случай, если пользователь изменил файл)
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
            generalStatusMessage.textContent = `Видео слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
            videoInput.value = '';
            if (videoPreview) videoPreview.style.display = 'none';
            validateInputs();
            return;
        }
        if (videoPreview && videoPreview.duration && videoPreview.duration > MAX_VIDEO_DURATION_SECONDS) {
            generalStatusMessage.textContent = `Видео слишком длинное. Максимум ${MAX_VIDEO_DURATION_SECONDS / 60} минут.`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
            videoInput.value = '';
            videoPreview.style.display = 'none';
            validateInputs();
            return;
        }

        // Если все проверки пройдены, начинаем загрузку
        uploadVideo(file, username, email, linkedin);
    });

    // Вынесена функция загрузки для чистоты кода
    function uploadVideo(file, username, email, linkedin) {
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
                generalStatusMessage.textContent = `Загрузка: ${file.name} (${percent.toFixed(0)}%)`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
            }
        });

        currentUploadXhr.onload = function() {
            selectFilesButton.disabled = false; // Активируем кнопку после завершения загрузки
            videoInput.value = '';
            if (videoPreview) {
                videoPreview.style.display = 'none';
                videoPreview.src = '';
            }

            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                generalStatusMessage.textContent = `Видео "${file.name}" загружено. ID задачи: ${taskId}.`;
                generalStatusMessage.style.color = 'var(--status-completed-color)';

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
            }
            validateInputs(); // После загрузки/ошибки, проверить состояние кнопки на основе полей
        };

        currentUploadXhr.onerror = function() {
            selectFilesButton.disabled = false; // Активируем кнопку после ошибки
            generalStatusMessage.textContent = 'Ошибка сети во время загрузки видео.';
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

    // Функция валидации, которая управляет состоянием кнопки
    function validateInputs() {
        // Проверяем, заполнено ли хотя бы одно из трех полей
        const anyFieldFilled = instagramInput.value.trim() !== '' ||
                               emailInput.value.trim() !== '' ||
                               linkedinInput.value.trim() !== '';

        const fileSelected = videoInput.files.length > 0;
        let fileIsValid = true; // Предполагаем, что файл валиден, пока не доказано обратное

        if (fileSelected) {
            const file = videoInput.files[0];
            // Проверяем размер файла
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                fileIsValid = false;
            }
            // Проверяем длительность, если videoPreview существует и метаданные загружены
            if (videoPreview && videoPreview.duration && videoPreview.duration > MAX_VIDEO_DURATION_SECONDS) {
                fileIsValid = false;
            }
        }

        // Кнопка активна, если:
        // 1. Заполнено хотя бы одно из полей (Instagram, Email, LinkedIn)
        // И
        // 2. Либо файл еще не выбран (тогда клик по кнопке откроет диалог выбора),
        //    либо выбранный файл валиден (тогда клик по кнопке начнет загрузку).
        selectFilesButton.disabled = !(anyFieldFilled && (!fileSelected || fileIsValid));

        // Если кнопка активирована, и при этом на экране есть сообщение об ошибке, не связанное с файлом,
        // то очищаем его. Сообщения о "слишком большом/длинном" файле остаются.
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
        if (progressBarContainer) progressBarContainer.style.display = 'none'; // Скрываем контейнер
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
    }

    // Инициализируем состояние кнопки при загрузке страницы
    validateInputs();
});
