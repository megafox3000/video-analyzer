// results.js

// Получаем ссылки на элементы DOM для страницы results.html
const resultsHeader = document.getElementById('resultsHeader');
const usernameDisplay = document.getElementById('usernameDisplay');
const uploadNewBtn = document.getElementById('uploadNewBtn');
const bubblesContainer = document.getElementById('bubblesContainer');
const metadataModal = document.getElementById('metadataModal');
const modalTitle = document.getElementById('modalTitle');
const modalMetadata = document.getElementById('modalMetadata');
const closeButton = document.querySelector('.close-button');

// --- IndexedDB Setup (должны совпадать с analyze.js) ---
const DB_NAME = 'HifeVideoAnalyzerDB';
const DB_VERSION = 1;
const USER_STORE_NAME = 'users';
const VIDEO_STORE_NAME = 'videos';

let db; // Переменная для хранения экземпляра базы данных

// Функция для открытия/создания базы данных IndexedDB
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            // Создаем хранилища объектов, если их нет
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
            console.log('IndexedDB opened successfully on results page.');
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error on results page:', event.target.errorCode);
            reject('IndexedDB error');
        };
    });
}

// Функция для получения видео по их ID из IndexedDB
async function getVideosByIDs(ids) {
    if (!db) await openDatabase(); // Убедимся, что база данных открыта
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([VIDEO_STORE_NAME], 'readonly');
        const store = transaction.objectStore(VIDEO_STORE_NAME);
        const videos = [];
        let completedRequests = 0;

        if (ids.length === 0) {
            resolve([]);
            return;
        }

        ids.forEach(id => {
            const request = store.get(parseInt(id)); // ID в IndexedDB хранятся как числа
            request.onsuccess = () => {
                if (request.result) {
                    videos.push(request.result);
                }
                completedRequests++;
                if (completedRequests === ids.length) {
                    resolve(videos);
                }
            };
            request.onerror = (event) => {
                console.error('Error fetching video by ID:', event.target.error);
                completedRequests++;
                if (completedRequests === ids.length) {
                    resolve(videos); // Разрешаем даже при ошибке, возвращаем то, что удалось получить
                }
            };
        });
    });
}

// Вспомогательная функция для форматирования метаданных
function formatMetadataForDisplay(metadata) {
    const lines = [];

    lines.push(`File Name: ${metadata.format?.filename || 'N/A'}`);
    lines.push(`File Size: ${metadata.format?.size ? Math.round(metadata.format.size / 1024) + ' kB' : 'N/A'}`);
    lines.push(`Duration: ${metadata.format?.duration ? parseFloat(metadata.format.duration).toFixed(2) + ' seconds' : 'N/A'}`);
    lines.push(`Bit Rate: ${metadata.format?.bit_rate ? Math.round(metadata.format.bit_rate / 1000) + ' kb/s' : 'N/A'}`);
    lines.push(`Format Name: ${metadata.format?.format_name || 'N/A'}`);
    lines.push(`Start Time: ${metadata.format?.start_time || 'N/A'}`);
    lines.push(`Probe Score: ${metadata.format?.probe_score || 'N/A'}`);
    lines.push(`Tags:`);
    if (metadata.format?.tags && Object.keys(metadata.format.tags).length > 0) {
        for (const tag in metadata.format.tags) {
            lines.push(`  ${tag}: ${metadata.format.tags[tag]}`);
        }
    } else {
        lines.push(`  No format tags.`);
    }

    if (metadata.streams && metadata.streams.length > 0) {
        metadata.streams.forEach((stream, i) => {
            lines.push(`\n--- Stream #${i} ---`);
            lines.push(`Codec Name: ${stream.codec_name || 'N/A'}`);
            lines.push(`Codec Type: ${stream.codec_type || 'N/A'}`);
            if (stream.width && stream.height) {
                lines.push(`Resolution: ${stream.width}x${stream.height}`);
            }
            if (stream.avg_frame_rate) {
                lines.push(`Frame Rate: ${stream.avg_frame_rate}`);
            }
            if (stream.bit_rate) {
                lines.push(`Stream Bit Rate: ${Math.round(stream.bit_rate / 1000)} kb/s`);
            }
            lines.push(`Stream Tags:`);
            if (stream.tags && Object.keys(stream.tags).length > 0) {
                for (const tag in stream.tags) {
                    lines.push(`  ${tag}: ${stream.tags[tag]}`);
                }
            } else {
                lines.push(`  No stream tags.`);
            }
        });
    }

    if (metadata.gps && metadata.gps.length > 0) {
        lines.push("\n--- GPS Data ---");
        metadata.gps.forEach(gps => {
            lines.push(`GPS Tag: ${gps.tag}`);
            lines.push(`Location: ${gps.lat}, ${gps.lon}`);
            if (gps.address) lines.push(`Address: ${gps.address}`);
        });
    }

    return lines.join('\n');
}


// Функция для загрузки и отображения видео
async function loadAndDisplayVideos() {
    // Получаем параметры из URL
    const urlParams = new URLSearchParams(window.location.search);
    const instagramUsername = urlParams.get('user');
    const videoIdsParam = urlParams.get('videoIds');
    const videoIds = videoIdsParam ? videoIdsParam.split(',').map(id => parseInt(id)) : [];

    if (instagramUsername) {
        usernameDisplay.textContent = `For: @${instagramUsername}`;
    } else {
        usernameDisplay.textContent = 'No user specified.';
    }

    if (videoIds.length === 0) {
        bubblesContainer.innerHTML = '<p class="status-message">No videos found for analysis.</p>';
        return;
    }

    try {
        const videos = await getVideosByIDs(videoIds);
        if (videos.length === 0) {
            bubblesContainer.innerHTML = '<p class="status-message">No video metadata found in local database for these IDs.</p>';
            return;
        }

        bubblesContainer.innerHTML = ''; // Очищаем контейнер перед добавлением пузырей

        videos.forEach(video => {
            const bubble = document.createElement('div');
            bubble.classList.add('video-bubble');
            bubble.innerHTML = `<span class="bubble-text">${video.filename}</span>`;
            
            // Сохраняем полные метаданные в data-атрибуте для доступа при клике
            bubble.dataset.metadata = JSON.stringify(video.metadata);
            bubble.dataset.filename = video.filename;

            bubble.addEventListener('click', () => {
                openModal(video.filename, JSON.parse(bubble.dataset.metadata));
            });
            bubblesContainer.appendChild(bubble);
        });

    } catch (error) {
        console.error("Error loading videos:", error);
        bubblesContainer.innerHTML = `<p class="status-message" style="color: red;">Error loading video data: ${error.message}</p>`;
    }
}

// --- Функции для управления модальным окном ---
function openModal(title, metadata) {
    modalTitle.textContent = title;
    modalMetadata.textContent = formatMetadataForDisplay(metadata); // Используем новую функцию форматирования
    metadataModal.classList.add('visible'); // Показываем модальное окно
}

function closeModal() {
    metadataModal.classList.remove('visible'); // Скрываем модальное окно
}

// --- Обработчики событий ---
document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем IndexedDB и загружаем видео
    openDatabase().then(() => {
        loadAndDisplayVideos();
    }).catch(error => {
        console.error("Failed to initialize IndexedDB on results page:", error);
        bubblesContainer.innerHTML = `<p class="status-message" style="color: red;">Failed to load video data: ${error.message}</p>`;
    });

    // Кнопка "Upload New Video(s)"
    uploadNewBtn.addEventListener('click', () => {
        window.location.href = 'upload.html'; // Перенаправляем обратно на страницу загрузки
    });

    // Закрытие модального окна по кнопке "x"
    closeButton.addEventListener('click', closeModal);

    // Закрытие модального окна при клике вне его содержимого
    window.addEventListener('click', (event) => {
        if (event.target === metadataModal) {
            closeModal();
        }
    });

    // Закрытие модального окна по кнопке Esc
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && metadataModal.classList.contains('visible')) {
            closeModal();
        }
    });
});
