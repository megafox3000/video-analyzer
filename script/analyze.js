// analyze.js

// Получаем ссылки на элементы DOM для страницы upload.html
const fileInput = document.getElementById('videoUpload');
const uploadLabel = document.querySelector('.upload-label'); // Используем класс, так как это label
const uploadStatus = document.getElementById('uploadStatus');
const videoInfoList = document.getElementById('videoInfoList'); // Контейнер для списка видео
const instagramInput = document.getElementById('instagramInput'); // Получаем поле Instagram

// --- IndexedDB Setup ---
const DB_NAME = 'HifeVideoAnalyzerDB';
const DB_VERSION = 1;
const USER_STORE_NAME = 'users';
const VIDEO_STORE_NAME = 'videos';

let db;

// Функция для открытия/создания базы данных IndexedDB
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(USER_STORE_NAME)) {
                db.createObjectStore(USER_STORE_NAME, { keyPath: 'instagramUsername' });
            }
            if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
                const videoStore = db.createObjectStore(VIDEO_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                videoStore.createIndex('by_instagram', 'instagramUsername', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('IndexedDB opened successfully.');
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.errorCode);
            reject('IndexedDB error');
        };
    });
}

// Функция для сохранения/обновления пользователя
async function saveUser(instagramUsername, linkedin, email) {
    if (!db) await openDatabase(); // Убедимся, что база данных открыта
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([USER_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(USER_STORE_NAME);
        const user = { instagramUsername, linkedin, email, lastUpdated: new Date().toISOString() };
        const request = store.put(user); // put() обновляет, если существует, или добавляет

        request.onsuccess = () => {
            console.log('User saved:', user);
            resolve();
        };

        request.onerror = (event) => {
            console.error('Error saving user:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Функция для сохранения метаданных видео
async function saveVideoMetadata(videoData) {
    if (!db) await openDatabase(); // Убедимся, что база данных открыта
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([VIDEO_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(VIDEO_STORE_NAME);
        const request = store.add(videoData); // add() добавляет новую запись

        request.onsuccess = () => {
            console.log('Video metadata saved:', videoData);
            resolve();
        };

        request.onerror = (event) => {
            console.error('Error saving video metadata:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Инициализируем базу данных при загрузке скрипта
openDatabase().catch(error => console.error("Failed to open IndexedDB:", error));


// --- Обработчик изменения файла ---
if (fileInput) {
    fileInput.addEventListener('change', () => {
        // Проверяем, введено ли имя Instagram
        const instagramUsername = instagramInput.value.trim();
        if (!instagramUsername) {
            uploadStatus.textContent = 'Please enter your Instagram username before uploading videos.';
            instagramInput.focus(); // Устанавливаем фокус на поле Instagram
            instagramInput.style.borderColor = 'red'; // Визуальная индикация ошибки
            return; // Прерываем загрузку
        } else {
            instagramInput.style.borderColor = ''; // Сбрасываем рамку, если была ошибка
        }

        // Автоматически сохраняем пользователя при начале загрузки, используя данные из полей
        const linkedin = document.getElementById('linkedinInput').value.trim();
        const email = document.getElementById('emailInput').value.trim();
        saveUser(instagramUsername, linkedin, email).catch(error => {
            console.error("Failed to save user data automatically:", error);
            // Опционально: показать сообщение пользователю
        });


        if (fileInput.files.length) {
            uploadStatus.textContent = `Selected ${fileInput.files.length} file(s). Starting upload...`;
            videoInfoList.innerHTML = ''; // Очищаем список перед новой загрузкой
            uploadVideos(fileInput.files, instagramUsername); // Передаем имя Instagram
        } else {
            uploadStatus.textContent = 'No files selected.';
            videoInfoList.innerHTML = '';
        }
    });
}

// --- Функция для загрузки нескольких видео и отображения прогресса ---
async function uploadVideos(files, instagramUsername) { // Добавлен instagramUsername
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
        // *** ИЗМЕНЕНИЕ ЗДЕСЬ: Используем img для иконки ***
        spoilerBtn.innerHTML = `<img src="assets/image-logo.jpeg" alt="Video Icon" class="spoiler-icon"><span id="fileName-${i}">@${instagramUsername} - ${file.name}</span>`;

        // Устанавливаем CSS-переменную для прогресса в 0%
        spoilerBtn.style.setProperty('--upload-progress', '0%');
        // Добавляем класс для золотого стиля сразу при создании кнопки
        spoilerBtn.classList.add('loaded-spoiler-btn');


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

                    // Обновляем CSS-переменную для заливки кнопки
                    spoilerBtn.style.setProperty('--upload-progress', `${percent}%`);
                }
            };

            xhr.onload = async function () { // Асинхронная функция для await
                progressBarContainer.style.display = "none"; // Скрываем прогресс-бар после завершения
                uploadStatus.textContent = `Finished processing ${file.name}.`;

                // Убедимся, что заливка завершена на 100%
                spoilerBtn.style.setProperty('--upload-progress', '100%');
                // Класс 'loaded-spoiler-btn' уже добавлен ранее

                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    // Передаем имя Instagram в showResult
                    showResult(data, metadataContent, spoilerBtn.querySelector('span'), instagramUsername);

                    // *** НОВОЕ: Сохраняем метаданные видео в IndexedDB ***
                    const videoMetadataToSave = {
                        filename: data.filename,
                        size_bytes: data.size_bytes,
                        analyzed_at: data.analyzed_at,
                        instagramUsername: instagramUsername, // Привязываем к пользователю
                        metadata: data.metadata // Сохраняем все метаданные
                    };
                    try {
                        await saveVideoMetadata(videoMetadataToSave);
                    } catch (dbError) {
                        console.error("Failed to save video metadata to IndexedDB:", dbError);
                        // Опционально: показать сообщение пользователю об ошибке сохранения
                    }

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
function showResult(data, targetMetadataContent, targetFileNameSpan, uploadedByInstagram) { // Добавлен uploadedByInstagram
    const lines = [];

    // Добавляем имя Instagram пользователя
    if (uploadedByInstagram) {
        lines.push(`Uploaded By: @${uploadedByInstagram}`);
    }
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

    // *** ИЗМЕНЕНИЕ ЗДЕСЬ: Текст кнопки спойлера теперь содержит имя Instagram и имя файла без иконки ***
    targetFileNameSpan.textContent = `@${uploadedByInstagram} - ${data.filename}`;
}

// --- Логика для переключения спойлера ---
function toggleSpoiler(metadataContentElement, fileNameSpanElement) {
    if (!metadataContentElement || !fileNameSpanElement) return;

    metadataContentElement.classList.toggle('visible');
    if (metadataContentElement.classList.contains('visible')) {
        // Обновляем текст кнопки при открытии спойлера: добавляем " (Hide)"
        fileNameSpanElement.textContent = fileNameSpanElement.textContent + ' (Hide)';
    } else {
        // Обновляем текст кнопки при закрытии спойлера: убираем "(Hide)"
        fileNameSpanElement.textContent = fileNameSpanElement.textContent.replace(' (Hide)', '');
    }
}

// --- Логика для обработки формы социальных сетей (пример) ---
// Удален обработчик submit для формы, так как кнопка "Save Socials" удалена.
// Данные пользователя теперь сохраняются автоматически при загрузке видео.
