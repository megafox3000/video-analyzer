// analyze.js

// Получаем ссылки на элементы DOM для страницы upload.html
// Убедитесь, что эти ID соответствуют вашему upload.html
const fileInput = document.getElementById('videoUpload');
const uploadLabel = document.querySelector('.upload-label'); // Используем класс, так как это label
const uploadStatus = document.getElementById('uploadStatus');

const spoilerBtn = document.getElementById('spoilerBtn');
const metadataContent = document.getElementById('metadataContent');
const fileNameSpan = document.getElementById('fileName');
const videoInfoContainer = document.getElementById('videoInfo');


// --- Логика для обработки загрузки файла (локально или для анализа) ---
if (fileInput) {
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            uploadStatus.textContent = `Selected file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
            if (videoInfoContainer) {
                videoInfoContainer.classList.remove('hidden'); // Показываем контейнер с информацией о видео
            }

            // Только получаем и отображаем метаданные файла локально
            getMetadata(file);
        } else {
            uploadStatus.textContent = 'No file selected.';
            if (videoInfoContainer) {
                videoInfoContainer.classList.add('hidden'); // Скрываем контейнер, если файл не выбран
            }
        }
    });
}


// --- Логика для получения метаданных видео (пример) ---
function getMetadata(file) {
    if (!metadataContent || !fileNameSpan) return; // Проверка на существование элементов

    // В реальном приложении здесь будет более сложная логика
    // Например, использование MediaSource API или сторонних библиотек для парсинга видео
    // Для демонстрации, просто покажем базовые данные файла
    const metadataHtml = `
        <p><strong>Name:</strong> ${file.name}</p>
        <p><strong>Type:</strong> ${file.type}</p>
        <p><strong>Size:</strong> ${(file.size / (1024 * 1024)).toFixed(2)} MB</p>
        <p><strong>Last Modified:</strong> ${new Date(file.lastModified).toLocaleDateString()}</p>
        <p><em>(More detailed video analysis would go here)</em></p>
    `;
    metadataContent.innerHTML = metadataHtml;
    fileNameSpan.textContent = file.name; // Обновляем текст кнопки спойлера именем файла
    // Убедимся, что спойлер изначально закрыт, если он не должен быть открыт по умолчанию
    metadataContent.classList.remove('visible');
    fileNameSpan.textContent = '📁 ' + file.name + ' Metadata';
}


// --- Логика для переключения спойлера ---
function toggleSpoiler() {
    if (!metadataContent || !fileNameSpan) return; // Проверка на существование элементов

    metadataContent.classList.toggle('visible');
    if (metadataContent.classList.contains('visible')) {
        fileNameSpan.textContent = '📂 ' + fileNameSpan.textContent.replace('📁 ', '').replace(' Metadata', '') + ' Metadata (Hide)';
    } else {
        fileNameSpan.textContent = '📁 ' + fileNameSpan.textContent.replace('📂 ', '').replace(' Metadata (Hide)', '') + ' Metadata';
    }
}

// Добавляем слушатель события для кнопки спойлера
if (spoilerBtn) {
    spoilerBtn.addEventListener('click', toggleSpoiler);
}

// --- Логика для обработки формы социальных сетей (пример) ---
const socialForm = document.querySelector('.social-form');
if (socialForm) {
    socialForm.addEventListener('submit', (event) => {
        event.preventDefault(); // Предотвращаем стандартную отправку формы

        const instagram = document.getElementById('instagramInput').value;
        const linkedin = document.getElementById('linkedinInput').value;
        const email = document.getElementById('emailInput').value;

        console.log('Socials submitted:', { instagram, linkedin, email });
        // Здесь вы можете отправить эти данные на сервер или сохранить их локально
        // В реальном приложении используйте модальное окно или другое уведомление вместо alert()
        alert('Socials saved! (This is a demo alert, replace with better UI)');
    });
}
