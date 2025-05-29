// script/analyze.js

// Этот файл теперь содержит функцию для загрузки видео и отслеживания прогресса,
// а также логику для отображения прогресс-баров и обработки спойлеров.
// Он больше не объявляет глобальные DOM-элементы, которые уже объявлены в upload_validation.js.

// --- Получаем ссылку на контейнер для прогресс-баров ---
// Это единственный DOM-элемент, который analyze.js должен получить глобально,
// так как он уникален для функциональности отображения прогресса в этом файле.
// Он находится в upload.html с id="videoUploadProgressList"
const videoUploadProgressList = document.getElementById('videoUploadProgressList');
if (!videoUploadProgressList) {
    console.error("Элемент #videoUploadProgressList не найден в DOM. Проверьте upload.html.");
}

// --- Карта для хранения элементов прогресса по имени файла ---
const fileProgressElements = new Map();

/**
 * Функция для создания или обновления элемента прогресса загрузки для файла.
 * @param {File} file - Объект файла.
 * @returns {{itemDiv: HTMLElement, progressBar: HTMLElement, progressText: HTMLElement}} - Элементы прогресс-бара.
 */
function createOrUpdateProgressItem(file) {
    let itemDiv = document.getElementById(`upload-item-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}`);
    let progressBar;
    let progressText;

    if (!itemDiv) {
        itemDiv = document.createElement('div');
        itemDiv.className = 'video-info-item'; // Ваш класс для контейнера
        itemDiv.id = `upload-item-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}`;

        const fileName = document.createElement('p');
        fileName.textContent = `Файл: ${file.name}`;
        itemDiv.appendChild(fileName);

        const progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'progress-bar-container';
        itemDiv.appendChild(progressBarContainer);

        progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.style.width = '0%';
        progressBarContainer.appendChild(progressBar);

        progressText = document.createElement('span');
        progressText.className = 'progress-text';
        progressText.textContent = '0%';
        progressBarContainer.appendChild(progressText);

        videoUploadProgressList.appendChild(itemDiv);
    } else {
        // Если элемент уже существует, находим его дочерние элементы
        progressBar = itemDiv.querySelector('.progress-bar');
        progressText = itemDiv.querySelector('.progress-text');
    }

    // Сохраняем ссылки на элементы для последующего обновления
    fileProgressElements.set(file.name, { itemDiv, progressBar, progressText });

    return { itemDiv, progressBar, progressText };
}

/**
 * Обновляет прогресс загрузки для конкретного файла.
 * @param {File} file - Объект файла.
 * @param {number} progress - Прогресс в процентах (0-100).
 */
function updateFileUploadProgress(file, progress) {
    const elements = fileProgressElements.get(file.name);
    if (elements) {
        elements.progressBar.style.width = `${progress}%`;
        elements.progressText.textContent = `${progress.toFixed(0)}%`;
    }
}

/**
 * Отправляет видео на Cloudinary и отслеживает прогресс.
 * Эта функция теперь доступна глобально через `window.uploadVideoAndTrackProgress`.
 * @param {File} file - Файл видео для загрузки.
 * @param {string} instagramUsername - Имя пользователя Instagram.
 * @param {string} linkedinValue - URL LinkedIn.
 * @param {string} emailValue - Email пользователя.
 * @returns {Promise<object>} - Promise, который разрешается объектом с taskId.
 */
window.uploadVideoAndTrackProgress = async function(file, instagramUsername, linkedinValue, emailValue) {
    // Создаем элементы прогресса для файла
    const { progressBar, progressText } = createOrUpdateProgressItem(file);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', instagramUsername); // Используем Instagram как username
    if (linkedinValue) formData.append('linkedin', linkedinValue);
    if (emailValue) formData.append('email', emailValue);

    return new Promise(async (resolve, reject) => {
        try {
            const xhr = new XMLHttpRequest();

            xhr.open('POST', 'https://video-meta-api.onrender.com/analyze');

            xhr.upload.addEventListener('progress', function(event) {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    updateFileUploadProgress(file, percentComplete);
                }
            });

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const data = JSON.parse(xhr.responseText);
                    updateFileUploadProgress(file, 100); // Убедиться, что прогресс 100% после успешной загрузки
                    resolve(data); // Предполагаем, что data содержит taskId
                } else {
                    const errorData = JSON.parse(xhr.responseText);
                    reject(new Error(`Ошибка сервера: ${errorData.error || xhr.statusText}`));
                }
            };

            xhr.onerror = function() {
                reject(new Error('Ошибка сети при загрузке файла.'));
            };

            xhr.send(formData);

        } catch (error) {
            reject(new Error(`Ошибка при подготовке загрузки: ${error.message}`));
        }
    });
};


// --- Логика для сворачивающихся (spoiler) элементов (если она нужна) ---
// Этот код предполагает, что spoiler-кнопки будут создаваться динамически
// на странице results.html или другой странице, а не upload.html.
// Если он не используется, этот блок можно удалить.

document.addEventListener('DOMContentLoaded', () => {
    // Эта функция будет искать и настраивать spoiler-кнопки
    // Использовать только на страницах, где есть спойлеры (например, results.html)
    setupSpoilerButtons();
});

function setupSpoilerButtons() {
    const spoilerButtons = document.querySelectorAll('.spoiler-btn');
    spoilerButtons.forEach(button => {
        button.addEventListener('click', () => {
            const content = button.nextElementSibling; // Следующий элемент - это контент спойлера
            if (content && content.classList.contains('spoiler-content')) {
                content.classList.toggle('active');
                button.classList.toggle('active'); // Можно добавить класс для стилизации активной кнопки
            }
        });
    });
}
