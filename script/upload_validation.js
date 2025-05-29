// --- Настройки для валидации ---
const MAX_FILE_SIZE_MB = 100; // Максимальный размер файла в мегабайтах
const MAX_DURATION_MINUTES = 5; // Максимальная продолжительность видео в минутах

const maxFileSize = MAX_FILE_SIZE_MB * 1024 * 1024; // Переводим МБ в байты
const maxDuration = MAX_DURATION_MINUTES * 60; // Переводим минуты в секунды

// --- Получаем ссылки на элементы DOM ---
const videoFileInput = document.getElementById('videoFileInput');
const uploadButton = document.getElementById('uploadButton');
// Добавьте ссылку на ваш элемент для отображения сообщений пользователю, если он есть
// const messageDisplay = document.getElementById('messageDisplay');

// --- Функция для сброса состояния ввода файла и кнопки ---
function resetFileInput() {
    videoFileInput.value = ''; // Очищаем выбранный файл
    uploadButton.disabled = true; // Отключаем кнопку загрузки
    // if (messageDisplay) messageDisplay.textContent = ''; // Очищаем сообщение
}

// --- Обработчик изменения файла ---
videoFileInput.addEventListener('change', function() {
    const file = this.files[0]; // Получаем выбранный файл
    uploadButton.disabled = true; // Отключаем кнопку по умолчанию, пока не проверим
    // if (messageDisplay) messageDisplay.textContent = ''; // Очищаем предыдущие сообщения

    if (!file) {
        // Файл не выбран
        return;
    }

    // --- 1. Проверка размера файла ---
    if (file.size > maxFileSize) {
        alert(`Ошибка: Файл слишком большой! Максимальный размер: ${MAX_FILE_SIZE_MB} МБ.`);
        // if (messageDisplay) messageDisplay.textContent = `Ошибка: Файл слишком большой! Максимальный размер: ${MAX_FILE_SIZE_MB} МБ.`;
        resetFileInput();
        return;
    }

    // --- 2. Проверка продолжительности видео (только если это видеофайл) ---
    if (file.type.startsWith('video/')) {
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata'; // Загружаем только метаданные, не все видео

        videoElement.onloadedmetadata = function() {
            window.URL.revokeObjectURL(videoElement.src); // Очищаем URL объекта для освобождения памяти

            if (videoElement.duration > maxDuration) {
                alert(`Ошибка: Видео слишком длинное! Максимальная продолжительность: ${MAX_DURATION_MINUTES} минут.`);
                // if (messageDisplay) messageDisplay.textContent = `Ошибка: Видео слишком длинное! Максимальная продолжительность: ${MAX_DURATION_MINUTES} минут.`;
                resetFileInput();
            } else {
                console.log('Видео соответствует требованиям по длительности:', videoElement.duration.toFixed(2) + ' сек.');
                uploadButton.disabled = false; // Включаем кнопку загрузки, если все ОК
                // if (messageDisplay) messageDisplay.textContent = 'Видео готово к загрузке.';
            }
        };

        videoElement.onerror = function() {
            window.URL.revokeObjectURL(videoElement.src); // Очищаем URL
            alert('Ошибка: Не удалось прочитать метаданные видео. Возможно, файл поврежден или не поддерживается.');
            // if (messageDisplay) messageDisplay.textContent = 'Ошибка: Не удалось прочитать метаданные видео. Возможно, файл поврежден или не поддерживается.';
            resetFileInput();
        };

        videoElement.src = URL.createObjectURL(file); // Создаем URL объекта для файла
    } else {
        // Если это не видеофайл (например, если accept="*/*" или пользователь обошел его)
        console.log('Выбран не видеофайл, проверка длительности пропущена.');
        // Если вы разрешаете другие типы файлов, то кнопка может быть включена здесь.
        // Для данного проекта, скорее всего, вам нужно, чтобы это был видеофайл.
        alert('Ошибка: Пожалуйста, выберите видеофайл.');
        resetFileInput();
    }
});

// --- Важно: Убедитесь, что ваша функция отправки видео вызывается, когда кнопка uploadButton нажата ---
// Пример:
// uploadButton.addEventListener('click', function(event) {
//     event.preventDefault(); // Предотвращаем стандартное поведение формы, если есть
//     // Здесь вызывается ваша существующая функция отправки видео на бэкенд
//     // Например: uploadVideoFile(videoFileInput.files[0]);
// });
