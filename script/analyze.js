// analyze.js

// Получаем ссылки на элементы DOM для страницы upload.html
const fileInput = document.getElementById('videoUpload');
const uploadLabel = document.querySelector('.upload-label'); // Используем класс, так как это label
const uploadStatus = document.getElementById('uploadStatus');
const videoInfoList = document.getElementById('videoInfoList'); // Контейнер для списка видео

// --- Обработчик изменения файла ---
if (fileInput) {
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            uploadStatus.textContent = `Selected ${fileInput.files.length} file(s). Starting upload...`;
            videoInfoList.innerHTML = ''; // Очищаем список перед новой загрузкой
            uploadVideos(fileInput.files);
        } else {
            uploadStatus.textContent = 'No files selected.';
            videoInfoList.innerHTML = '';
        }
    });
}

// --- Функция для загрузки нескольких видео и отображения прогресса ---
async function uploadVideos(files) {
    // Отключаем кнопку загрузки на время обработки
    if (uploadLabel) {
        uploadLabel.style.pointerEvents = 'none';
        uploadLabel.style.opacity = '0.7';
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);

        // Создаем элементы для каждого файла
        const videoInfoItem = document.createElement('div');
        videoInfoItem.classList.add('video-info-item');
        videoInfoItem.id = `video-item-${i}`;

        const spoilerBtn = document.createElement('button');
        spoilerBtn.classList.add('spoiler-btn');
        spoilerBtn.id = `spoilerBtn-${i}`;
        spoilerBtn.innerHTML = `📁 <span id="fileName-${i}">${file.name} Metadata</span>`;

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

        const metadataContent = document.createElement('div');
        metadataContent.classList.add('spoiler-content');
        metadataContent.id = `metadataContent-${i}`;

        videoInfoItem.appendChild(spoilerBtn);
        videoInfoItem.appendChild(progressBarContainer);
        videoInfoItem.appendChild(metadataContent);
        videoInfoList.appendChild(videoInfoItem);

        // Добавляем слушатель для переключения спойлера
        spoilerBtn.addEventListener('click', () => toggleSpoiler(metadataContent, spoilerBtn.querySelector('span')));

        // Отправляем файл на API
        await new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "https://video-meta-api.onrender.com/analyze"); // Ваш API для анализа

            xhr.upload.onprogress = function (e) {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = percent + "%";
                    progressText.textContent = `${percent}%`;
                    uploadStatus.textContent = `Uploading ${file.name}: ${percent}%`;
                }
            };

            xhr.onload = function () {
                progressBarContainer.style.display = "none"; // Скрываем прогресс-бар после завершения
                uploadStatus.textContent = `Finished processing ${file.name}.`;

                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    showResult(data, metadataContent, spoilerBtn.querySelector('span')); // Передаем элементы для обновления
                } else {
                    metadataContent.innerHTML = `<p style="color: red;">Upload failed for file: ${file.name}. Status: ${xhr.status}</p>`;
                    alert("Upload failed for file: " + file.name); // Используйте модальное окно вместо alert
                }
                resolve();
            };

            xhr.onerror = function() {
                metadataContent.innerHTML = `<p style="color: red;">Network error during upload for file: ${file.name}</p>`;
                uploadStatus.textContent = `Network error for ${file.name}.`;
                progressBarContainer.style.display = "none";
                alert("Network error during upload for file: " + file.name); // Используйте модальное окно вместо alert
                resolve();
            };

            xhr.send(formData);
        });
    }

    // Включаем кнопку загрузки обратно после обработки всех файлов
    if (uploadLabel) {
        uploadLabel.style.pointerEvents = 'auto';
        uploadLabel.style.opacity = '1';
    }
    uploadStatus.textContent = `All files processed.`;
}

// --- Функция для отображения результатов анализа под спойлером ---
function showResult(data, targetMetadataContent, targetFileNameSpan) {
    const lines = [];

    lines.push(`File Name: ${data.filename}`);
    lines.push(`File Size: ${Math.round(data.size_bytes / 1024)} kB`);
    lines.push(`Analyzed At: ${data.analyzed_at}`);
    lines.push("");

    const meta = data.metadata || {};
    const format = meta.format || {};
    const tags = format.tags || {};

    for (const key in format) {
        if (typeof format[key] !== "object" && key !== "tags") { // Исключаем 'tags' из формата
            lines.push(`${key}: ${format[key]}`);
        }
    }

    // Добавляем теги формата
    if (Object.keys(tags).length > 0) {
        lines.push("--- Format Tags ---");
        for (const tag in tags) {
            lines.push(`${tag}: ${tags[tag]}`);
        }
    }


    if (meta.streams?.length) {
        meta.streams.forEach((stream, i) => {
            lines.push(`--- Stream #${i} ---`);
            for (const key in stream) {
                if (typeof stream[key] !== "object" && key !== "tags") { // Исключаем 'tags' из потока
                    lines.push(`${key}: ${stream[key]}`);
                }
            }
            // Добавляем теги потока, если есть
            if (stream.tags && Object.keys(stream.tags).length > 0) {
                lines.push(`  Stream #${i} Tags:`);
                for (const tag in stream.tags) {
                    lines.push(`  ${tag}: ${stream.tags[tag]}`);
                }
            }
        });
    }

    if (data.metadata?.gps?.length) {
        lines.push("");
        lines.push("--- GPS Data ---");
        data.metadata.gps.forEach(gps => {
            lines.push(`GPS Tag: ${gps.tag}`);
            lines.push(`Location: ${gps.lat}, ${gps.lon}`);
            if (gps.address) lines.push(`Address: ${gps.address}`);
        });
    }

    const contentPre = document.createElement("pre");
    contentPre.textContent = lines.join("\n");
    targetMetadataContent.innerHTML = ''; // Очищаем перед добавлением
    targetMetadataContent.appendChild(contentPre);

    // *** НЕТ АВТОМАТИЧЕСКОГО ОТКРЫТИЯ СПОЙЛЕРА ЗДЕСЬ ***
    // Спойлер останется закрытым, пока пользователь не кликнет
    targetFileNameSpan.textContent = '📁 ' + data.filename + ' Metadata'; // Убедимся, что иконка закрыта
}

// --- Логика для переключения спойлера ---
function toggleSpoiler(metadataContentElement, fileNameSpanElement) {
    if (!metadataContentElement || !fileNameSpanElement) return;

    metadataContentElement.classList.toggle('visible');
    if (metadataContentElement.classList.contains('visible')) {
        fileNameSpanElement.textContent = '📂 ' + fileNameSpanElement.textContent.replace('📁 ', '').replace(' Metadata', '') + ' Metadata (Hide)';
    } else {
        fileNameSpanElement.textContent = '📁 ' + fileNameSpanElement.textContent.replace('📂 ', '').replace(' Metadata (Hide)', '') + ' Metadata';
    }
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
