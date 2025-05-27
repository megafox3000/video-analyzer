// analyze.js
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш реальный URL бэкенда Render
// Получаем ссылки на элементы DOM для страницы upload.html
const fileInput = document.getElementById('videoUpload');
const uploadButton = document.getElementById('uploadButton');
const uploadStatus = document.getElementById('uploadStatus');
const videoInfoList = document.getElementById('videoInfoList');
const instagramInput = document.getElementById('instagramInput');
const linkedinInput = document.getElementById('linkedinInput');
const emailInput = document.getElementById('emailInput');

// --- IndexedDB Setup ---
const DB_NAME = 'HifeVideoAnalyzerDB';
const DB_VERSION = 1;
const USER_STORE_NAME = 'users';
const VIDEO_STORE_NAME = 'videos'; // Это хранилище будет использоваться results.js, если данные будут сохраняться локально

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
    if (!db) await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([USER_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(USER_STORE_NAME);
        const user = { instagramUsername, linkedin, email, lastUpdated: new Date().toISOString() };
        const request = store.put(user);

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

// Инициализируем базу данных при загрузке скрипта
openDatabase().catch(error => console.error("Failed to open IndexedDB:", error));

// --- Функция для обновления состояния кнопки загрузки ---
function updateUploadButtonState() {
    const isAnySocialFieldFilled = instagramInput.value.trim() !== '' ||
                                   linkedinInput.value.trim() !== '' ||
                                   emailInput.value.trim() !== '';

    if (isAnySocialFieldFilled && instagramInput.value.trim() !== '') { // Instagram поле теперь обязательное
        uploadButton.classList.remove('disabled');
        uploadButton.disabled = false;
    } else {
        uploadButton.classList.add('disabled');
        uploadButton.disabled = true;
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

        if (!instagramUsername) {
            uploadStatus.textContent = 'Instagram username is required to upload videos.';
            instagramInput.focus();
            instagramInput.style.borderColor = 'red';
            linkedinInput.style.borderColor = ''; // Сброс
            emailInput.style.borderColor = ''; // Сброс
            return;
        } else {
            instagramInput.style.borderColor = '';
            linkedinInput.style.borderColor = '';
            emailInput.style.borderColor = '';
        }

        // Если все проверки пройдены, очищаем предыдущее сообщение о статусе
        uploadStatus.textContent = '';
        fileInput.click();
    });
}

// --- Обработчик изменения скрытого input type="file" (срабатывает после выбора файлов) ---
if (fileInput) {
    fileInput.addEventListener('change', () => {
        const files = fileInput.files;
        if (files.length > 0) {
            const instagramUsername = instagramInput.value.trim();

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
    if (uploadButton) {
        uploadButton.style.pointerEvents = 'none';
        uploadButton.style.opacity = '0.7';
    }

    const pendingTaskIds = []; // Массив для хранения ID задач от бэкенда

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file); // Убедитесь, что имя поля соответствует app.post('/analyze', upload.single('file'))
        formData.append("username", instagramUsername); // Передаем имя пользователя

        const videoInfoItem = document.createElement('div');
        videoInfoItem.classList.add('video-info-item');
        videoInfoItem.id = `video-item-${i}`;

        const spoilerBtn = document.createElement('button');
        spoilerBtn.classList.add('spoiler-btn');
        spoilerBtn.id = `spoilerBtn-${i}`;
        spoilerBtn.innerHTML = `<img src="assets/image-logo.jpeg" alt="Video Icon" class="spoiler-icon"><span id="fileName-${i}">@${instagramUsername} - ${file.name}</span>`;
        spoilerBtn.style.setProperty('--upload-progress', '0%');
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

        videoInfoItem.appendChild(spoilerBtn);
        videoInfoItem.appendChild(progressBarContainer);
        videoInfoList.appendChild(videoInfoItem);

        await new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${RENDER_BACKEND_URL}/analyze`); // Отправляем на /analyze
            
            // Если требуется CORS, убедитесь, что ваш Render backend разрешает запросы
            // xhr.setRequestHeader('Access-Control-Allow-Origin', '*'); // Обычно настраивается на стороне сервера

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
                uploadStatus.textContent = `Finished uploading ${file.name}. Waiting for analysis...`; 
                spoilerBtn.style.setProperty('--upload-progress', '100%');

                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    
                    if (data.taskId) { 
                        pendingTaskIds.push(data.taskId); // Сохраняем taskId
                        console.log(`[FRONTEND] Task ID received for ${file.name}: ${data.taskId}`);
                        // Здесь мы больше не сохраняем метаданные в IndexedDB,
                        // т.к. бэкенд не возвращает их сразу.
                        // results.js будет опрашивать бэкенд для получения статуса и метаданных.
                        resolve(); 
                    } else {
                        console.error("No Task ID received for file:", file.name, "Response:", data);
                        videoInfoItem.innerHTML = `<p style="color: red;">Error processing ${file.name}: No Task ID.</p>`;
                        resolve();
                    }

                } else {
                    console.error("Upload failed for file:", file.name, "Status:", xhr.status, "Response:", xhr.responseText);
                    videoInfoItem.innerHTML = `<p style="color: red;">Upload failed for ${file.name}. Status: ${xhr.status}.</p>`;
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

    if (uploadButton) {
        uploadButton.style.pointerEvents = 'auto';
        uploadButton.style.opacity = '1';
    }
    uploadStatus.textContent = `All files uploaded. Redirecting to results...`;

    // После обработки всех видео, сохраняем ID задач в sessionStorage и перенаправляем
    sessionStorage.setItem('pendingTaskIds', JSON.stringify(pendingTaskIds));
    sessionStorage.setItem('hifeUsername', instagramUsername); // Сохраняем имя пользователя
    setTimeout(() => {
        window.location.href = `results.html`; // Перенаправляем на results.html
    }, 1500);
}
