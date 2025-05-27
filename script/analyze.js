// analyze.js
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Для теста локально
// Получаем ссылки на элементы DOM для страницы upload.html
const fileInput = document.getElementById('videoUpload'); // Скрытый input для выбора файлов
const uploadButton = document.getElementById('uploadButton'); // Новая кнопка, которая заменяет label
const uploadStatus = document.getElementById('uploadStatus');
const videoInfoList = document.getElementById('videoInfoList'); // Контейнер для списка видео
const instagramInput = document.getElementById('instagramInput'); // Поле Instagram
const linkedinInput = document.getElementById('linkedinInput'); // Поле LinkedIn
const emailInput = document.getElementById('emailInput'); // Поле Email

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

// --- Функция для обновления состояния кнопки загрузки ---
function updateUploadButtonState() {
    const isAnySocialFieldFilled = instagramInput.value.trim() !== '' ||
                                   linkedinInput.value.trim() !== '' ||
                                   emailInput.value.trim() !== '';

    if (isAnySocialFieldFilled) {
        uploadButton.classList.remove('disabled');
        uploadButton.disabled = false; // Включаем кнопку
    } else {
        uploadButton.classList.add('disabled');
        uploadButton.disabled = true; // Отключаем кнопку
    }
}

// --- Обработчики событий для полей социальных сетей ---
instagramInput.addEventListener('input', updateUploadButtonState);
linkedinInput.addEventListener('input', updateUploadButtonState);
emailInput.addEventListener('input', updateUploadButtonState);

// Вызываем функцию при загрузке страницы, чтобы установить начальное состояние кнопки
document.addEventListener('DOMContentLoaded', updateUploadButtonState);


// --- Обработчик клика на кнопку загрузки ---
if (uploadButton) {
    uploadButton.addEventListener('click', () => {
        const instagramUsername = instagramInput.value.trim();
        const linkedinValue = linkedinInput.value.trim();
        const emailValue = emailInput.value.trim();

        // 1. Проверка: хотя бы одно из трех полей должно быть заполнено
        if (!instagramUsername && !linkedinValue && !emailValue) {
            uploadStatus.textContent = 'Please fill at least one social media field (Instagram, LinkedIn, or Email) to proceed.';
            instagramInput.focus(); // Фокус на Instagram как основной
            instagramInput.style.borderColor = 'red';
            linkedinInput.style.borderColor = 'red';
            emailInput.style.borderColor = 'red';
            return; // Останавливаемся, не открываем окно выбора файлов
        } else {
            // Сбрасываем подсветку ошибок, если поля заполнены
            instagramInput.style.borderColor = '';
            linkedinInput.style.borderColor = '';
            emailInput.style.borderColor = '';
        }

        // 2. Проверка: поле Instagram должно быть обязательно заполнено
        if (!instagramUsername) {
            uploadStatus.textContent = 'Instagram username is required to upload videos.';
            instagramInput.focus();
            instagramInput.style.borderColor = 'red';
            return; // Останавливаемся, не открываем окно выбора файлов
        } else {
            instagramInput.style.borderColor = '';
        }

        // Если все проверки пройдены, очищаем предыдущее сообщение о статусе
        uploadStatus.textContent = '';
        // Программно кликаем по скрытому input type="file", чтобы открыть диалог выбора файлов
        fileInput.click();
    });
}

// --- Обработчик изменения скрытого input type="file" (срабатывает после выбора файлов) ---
if (fileInput) {
    fileInput.addEventListener('change', () => {
        const files = fileInput.files;
        if (files.length > 0) {
            const instagramUsername = instagramInput.value.trim(); // Получаем имя Instagram еще раз

            uploadStatus.textContent = `Selected ${files.length} file(s). Starting upload...`;
            videoInfoList.innerHTML = ''; // Очищаем список перед новой загрузкой
            uploadVideos(files, instagramUsername); // Начинаем процесс загрузки
        } else {
            uploadStatus.textContent = 'No files selected.';
            videoInfoList.innerHTML = '';
        }
    });
}

// --- Функция для загрузки нескольких видео и отображения прогресса ---
async function uploadVideos(files, instagramUsername) {
    // Отключаем кнопку загрузки на время обработки
    if (uploadButton) {
        uploadButton.style.pointerEvents = 'none';
        uploadButton.style.opacity = '0.7';
    }

    const processedVideoIds = []; // Массив для хранения ID обработанных видео

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);

        // Временно создаем элементы для каждого файла для отображения прогресса на текущей странице
        // Эти элементы будут удалены после перенаправления
        const videoInfoItem = document.createElement('div');
        videoInfoItem.classList.add('video-info-item');
        videoInfoItem.id = `video-item-${i}`;

        const spoilerBtn = document.createElement('button');
        spoilerBtn.classList.add('spoiler-btn');
        spoilerBtn.id = `spoilerBtn-${i}`;
        spoilerBtn.innerHTML = `<img src="assets/image-logo.jpeg" alt="Video Icon" class="spoiler-icon"><span id="fileName-${i}">@${instagramUsername} - ${file.name}</span>`;
        spoilerBtn.style.setProperty('--upload-progress', '0%');
        spoilerBtn.classList.add('loaded-spoiler-btn'); // Применяем стиль сразу

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

        videoInfoItem.appendChild(spoilerBtn);
        videoInfoItem.appendChild(progressBarContainer);
        videoInfoList.appendChild(videoInfoItem);


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
                    spoilerBtn.style.setProperty('--upload-progress', `${percent}%`);
                }
            };

            xhr.onload = async function () {
                progressBarContainer.style.display = "none";
                uploadStatus.textContent = `Finished processing ${file.name}.`;
                spoilerBtn.style.setProperty('--upload-progress', '100%');

                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    const videoMetadataToSave = {
                        filename: data.filename,
                        size_bytes: data.size_bytes,
                        analyzed_at: data.analyzed_at,
                        instagramUsername: instagramUsername, // Привязываем к пользователю
                        metadata: data.metadata, // Сохраняем все метаданные
                        uploadedDate: new Date().toISOString() // Добавляем дату загрузки
                    };
                    try {
                        // Сохраняем метаданные видео в IndexedDB
                        // При добавлении в IndexedDB, id генерируется автоматически (autoIncrement: true)
                        // Мы должны дождаться завершения операции, чтобы получить ID
                        const addRequest = db.transaction([VIDEO_STORE_NAME], 'readwrite')
                                            .objectStore(VIDEO_STORE_NAME)
                                            .add(videoMetadataToSave);

                        addRequest.onsuccess = (event) => {
                            const newVideoId = event.target.result; // Получаем ID нового элемента
                            processedVideoIds.push(newVideoId); // Добавляем ID в список
                            console.log('Video metadata saved with ID:', newVideoId);
                            resolve(); // Завершаем Promise только после сохранения в IndexedDB
                        };

                        addRequest.onerror = (event) => {
                            console.error("Failed to save video metadata to IndexedDB:", event.target.error);
                            resolve(); // Завершаем Promise даже при ошибке сохранения, чтобы продолжить цикл
                        };

                    } catch (dbError) {
                        console.error("Failed to save video metadata to IndexedDB (catch):", dbError);
                        resolve();
                    }

                } else {
                    console.error("Upload failed for file:", file.name, "Status:", xhr.status);
                    // Вместо alert можно обновить статус для конкретного файла
                    videoInfoItem.innerHTML = `<p style="color: red;">Upload failed for ${file.name}. Status: ${xhr.status}</p>`;
                    resolve();
                }
            };

            xhr.onerror = function() {
                console.error("Network error during upload for file:", file.name);
                videoInfoItem.innerHTML = `<p style="color: red;">Network error for ${file.name}.</p>`;
                resolve();
            };

            xhr.send(formData);
        });
    }

    // Включаем кнопку загрузки обратно после обработки всех файлов
    if (uploadButton) {
        uploadButton.style.pointerEvents = 'auto';
        uploadButton.style.opacity = '1';
    }
    uploadStatus.textContent = `All files processed. Redirecting...`;

    // После обработки всех видео и сохранения их в IndexedDB, перенаправляем пользователя
    // Передаем имя пользователя Instagram через URL-параметр
    // и возможно, ID обработанных видео, чтобы results.js знал, что отобразить
    setTimeout(() => {
        window.location.href = `results.html?user=${encodeURIComponent(instagramUsername)}&videoIds=${processedVideoIds.join(',')}`;
    }, 1500); // Небольшая задержка для отображения сообщения
}

// --- Эти функции showResult и toggleSpoiler больше не нужны здесь,
//     так как вывод результатов перенесен на results.html ---
/*
function showResult(data, targetMetadataContent, targetFileNameSpan, uploadedByInstagram) {
    // ... (логика отображения результатов) ...
}

function toggleSpoiler(metadataContentElement, fileNameSpanElement) {
    // ... (логика переключения спойлера) ...
}
*/
