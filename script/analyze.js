// analyze.js

// Получаем ссылки на элементы DOM для страницы upload.html
const fileInput = document.getElementById('videoUpload');
const uploadLabel = document.querySelector('.upload-label');
const uploadStatus = document.getElementById('uploadStatus');
const videoInfoList = document.getElementById('videoInfoList'); // Новый контейнер для списка видео

// --- Логика для обработки загрузки/выбора файлов ---
if (fileInput) {
    fileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            uploadStatus.textContent = `Selected ${files.length} file(s). Processing...`;
            videoInfoList.innerHTML = ''; // Очищаем список перед добавлением новых файлов

            // Обрабатываем каждый выбранный файл
            Array.from(files).forEach((file, index) => {
                processFile(file, index);
            });
        } else {
            uploadStatus.textContent = 'No files selected.';
            videoInfoList.innerHTML = ''; // Очищаем список, если нет файлов
        }
    });
}

// --- Функция для обработки каждого файла ---
function processFile(file, index) {
    // Создаем новый контейнер для информации о видео
    const videoInfoContainer = document.createElement('div');
    videoInfoContainer.classList.add('video-info-item'); // Добавляем класс для стилизации
    videoInfoContainer.id = `videoInfo-${index}`; // Уникальный ID для каждого элемента

    // Создаем кнопку спойлера
    const spoilerBtn = document.createElement('button');
    spoilerBtn.classList.add('spoiler-btn');
    spoilerBtn.id = `spoilerBtn-${index}`;
    spoilerBtn.innerHTML = `📁 <span id="fileName-${index}">${file.name} Metadata</span>`;

    // Создаем контейнер для метаданных
    const metadataContent = document.createElement('div');
    metadataContent.classList.add('spoiler-content');
    metadataContent.id = `metadataContent-${index}`;

    // Создаем элемент для прогресса
    const progressBarContainer = document.createElement('div');
    progressBarContainer.classList.add('progress-bar-container');
    const progressBar = document.createElement('div');
    progressBar.classList.add('progress-bar');
    progressBar.style.width = '0%';
    const progressText = document.createElement('span');
    progressText.classList.add('progress-text');
    progressText.textContent = '0%';

    progressBarContainer.appendChild(progressBar);
    progressBarContainer.appendChild(progressText);


    // Добавляем элементы в контейнер информации о видео
    videoInfoContainer.appendChild(spoilerBtn);
    videoInfoContainer.appendChild(progressBarContainer); // Добавляем прогресс-бар
    videoInfoContainer.appendChild(metadataContent);


    // Добавляем контейнер информации о видео в общий список
    videoInfoList.appendChild(videoInfoContainer);

    // --- Логика для получения метаданных видео и отображения прогресса ---
    const reader = new FileReader();

    reader.onprogress = (event) => {
        if (event.lengthComputable) {
            const percentLoaded = (event.loaded / event.total) * 100;
            progressBar.style.width = `${percentLoaded}%`;
            progressText.textContent = `${percentLoaded.toFixed(0)}%`;
            uploadStatus.textContent = `Processing ${file.name}: ${percentLoaded.toFixed(0)}%`;
        }
    };

    reader.onload = (e) => {
        // В реальном приложении здесь будет более сложная логика анализа видео
        // Для демонстрации, просто покажем базовые данные файла
        const metadataHtml = `
            <p><strong>Name:</strong> ${file.name}</p>
            <p><strong>Type:</strong> ${file.type}</p>
            <p><strong>Size:</strong> ${(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            <p><strong>Last Modified:</strong> ${new Date(file.lastModified).toLocaleDateString()}</p>
            <p><em>(More detailed video analysis would go here)</em></p>
        `;
        metadataContent.innerHTML = metadataHtml;

        // Автоматически открываем спойлер после загрузки метаданных
        metadataContent.classList.add('visible');
        spoilerBtn.querySelector('span').textContent = '📂 ' + file.name + ' Metadata (Hide)';
        progressBarContainer.style.display = 'none'; // Скрываем прогресс-бар после завершения

        uploadStatus.textContent = `Finished processing ${file.name}.`;
    };

    reader.onerror = () => {
        metadataContent.innerHTML = `<p style="color: red;">Error reading file: ${file.name}</p>`;
        uploadStatus.textContent = `Error processing ${file.name}.`;
        progressBarContainer.style.display = 'none';
    };

    // Читаем файл как ArrayBuffer, чтобы получить прогресс
    reader.readAsArrayBuffer(file);

    // --- Логика для переключения спойлера (для динамически созданных кнопок) ---
    spoilerBtn.addEventListener('click', () => {
        metadataContent.classList.toggle('visible');
        const currentFileNameSpan = spoilerBtn.querySelector('span'); // Получаем span внутри этой кнопки
        if (metadataContent.classList.contains('visible')) {
            currentFileNameSpan.textContent = '📂 ' + currentFileNameSpan.textContent.replace('📁 ', '').replace(' Metadata', '') + ' Metadata (Hide)';
        } else {
            currentFileNameSpan.textContent = '📁 ' + currentFileNameSpan.textContent.replace('📂 ', '').replace(' Metadata (Hide)', '') + ' Metadata';
        }
    });
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
