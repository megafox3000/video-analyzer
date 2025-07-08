// results.js
// Этот файл управляет отображением пользовательского интерфейса, статусами видео и взаимодействием.

console.log("DEBUG: results.js loaded and executing.");

// УКАЖИТТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

// Импортируем функцию загрузки из cloudinary_upload.js
import { uploadFileToCloudinary } from './cloudinary_upload.js';

import {
    getTaskStatus, // <-- Используем новую универсальную функцию
    initiateVideoProcessing,
    fetchUserVideosFromBackend,
    deleteVideo
} from './process_videos.js';

// --- Константы и глобальные переменные для таймера неактивности ---
let inactivityTimeout;
const INACTIVITY_THRESHOLD = 90 * 1000; // 90 секунд в миллисекундах

// Глобальная переменная для отслеживания, было ли инициировано объединение видео
let concatenationInitiated = false;
let activeConcatenationTaskId = null; // ID конкретной задачи объединения, если она была инициирована

/**
 * Сбрасывает таймер неактивности.
 * Вызывается при любой активности пользователя.
 */
function resetInactivityTimer() {
    clearTimeout(inactivityTimeout); // Очищаем существующий таймер
    inactivityTimeout = setTimeout(handleInactivity, INACTIVITY_THRESHOLD); // Устанавливаем новый
    console.log("[Inactivity Timer] Таймер неактивности сброшен на results.js.");
}

/**
 * Обрабатывает неактивность пользователя: закрывает сессию и перенаправляет.
 * Вызывается, когда таймер неактивности истекает.
 */
function handleInactivity() {
    console.log("[Inactivity Timer] Пользователь неактивен в течение 90 секунд на results.js. Закрытие сессии и перенаправление на index.html.");

    setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('index.html'); // Перенаправляем на index.html
    }, 100);
}

// Добавляем слушатели событий к документу для отслеживания активности пользователя
// При каждом из этих событий таймер неактивности будет сбрасываться.
document.addEventListener('mousemove', resetInactivityTimer); // Движение мыши
document.addEventListener('keypress', resetInactivityTimer); // Нажатие клавиши
document.addEventListener('click', resetInactivityTimer);    // Клик мышью
document.addEventListener('scroll', resetInactivityTimer);   // Прокрутка страницы

// Инициализируем таймер при загрузке скрипта
// Это запускает отсчет с самого начала
resetInactivityTimer();

// --- DOM Элементы ---
// Все ссылки на элементы DOM теперь собраны в одном объекте для удобства.
const DOM_ELEMENTS = {
    resultsHeader: document.getElementById('resultsHeader'),
    usernameDisplay: document.getElementById('usernameDisplay'),
    uploadNewBtn: document.getElementById('uploadNewBtn'),
    finishSessionBtn: document.getElementById('finishSessionBtn'),
    bubblesContainer: document.getElementById('bubblesContainer'),
    metadataModal: document.getElementById('metadataModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMetadata: document.getElementById('modalMetadata'),
    closeButton: document.querySelector('.close-button'),
    videoFileInput: document.getElementById('videoFileInput'),
    dynamicUploadStatusContainer: document.getElementById('dynamicUploadStatusContainer'),
    uploadStatusText: document.getElementById('uploadStatusText'),
    progressBarContainer: null,
    progressBar: null,
    progressText: null,
    processSelectedVideosButton: document.getElementById('processSelectedVideosButton'),
    connectVideosCheckbox: document.getElementById('connectVideosCheckbox'),
    concatenationStatusDiv: document.getElementById('concatenationStatusDiv')
};

// Инициализация элементов прогресс-бара, так как они могут быть внутри dynamicUploadStatusContainer
if (DOM_ELEMENTS.dynamicUploadStatusContainer) {
    DOM_ELEMENTS.progressBarContainer = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-bar-container');
    DOM_ELEMENTS.progressBar = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-bar');
    DOM_ELEMENTS.progressText = DOM_ELEMENTS.dynamicUploadStatusContainer.querySelector('.progress-text');
}

// Глобальные переменные для управления состоянием видео
let uploadedVideos = []; // Массив для хранения данных о видео
let pollingIntervalId = null; // ID интервала для опроса статусов
const POLLING_INTERVAL = 3000; // Интервал опроса статусов (3 секунды)

let identifierToFetch = null; // Идентификатор пользователя (QR-код, email и т.д.)
let identifierTypeToFetch = null; // Тип идентификатора (например, 'qrCode', 'email')

const taskBubbles = {}; // Объект для хранения ссылок на DOM-элементы "пузырей" по их videoId (Cloudinary ID)

console.log("DEBUG: Script initialized. uploadedVideos is currently:", uploadedVideos);


// --- Вспомогательные функции UI/Локального состояния ---

/**
 * Sanitizes a string for display in HTML (basic escaping).
 * @param {string} str The string to sanitize.
 * @returns {string} The sanitized string.
 */
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

/**
 * Генерирует URL миниатюры Cloudinary из URL видео.
 * @param {string} videoUrl Оригинальный URL видео на Cloudinary.
 * @returns {string} URL миниатюры или путь к дефолтной заглушке.
 */
function getCloudinaryThumbnailUrl(videoUrl) {
    if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
        return 'assets/video_placeholder.png'; // Используем video_placeholder.png
    }

    const parts = videoUrl.split('/upload/');
    if (parts.length < 2) {
        return 'assets/video_placeholder.png';
    }

    const baseUrl = parts[0];
    // Трансформации для миниатюры: обрезка, размер, авто-определение точки интереса, авто-качество, формат JPG, первый кадр
    const transformations = 'c_fill,w_200,h_150,g_auto,q_auto:eco,f_jpg,so_auto/';

    let publicIdPath = parts[1];
    // Удаляем версию (vXXXX/) и меняем расширение на .jpg для миниатюры
    publicIdPath = publicIdPath.replace(/v\d+\//, '');
    publicIdPath = publicIdPath.substring(0, publicIdPath.lastIndexOf('.')) + '.jpg';

    return `${baseUrl}/upload/${transformations}${publicIdPath}`;
}

/**
 * Отображает или скрывает модальное окно метаданных.
 * @param {string} filename Имя файла для заголовка модального окна.
 * @param {object} metadata Объект метаданных для отображения.
 */
function showMetadataModal(filename, metadata) {
    if (DOM_ELEMENTS.modalTitle) DOM_ELEMENTS.modalTitle.textContent = `Метаданные для: ${sanitizeHTML(filename)}`; // Sanitized
    if (DOM_ELEMENTS.modalMetadata) DOM_ELEMENTS.modalMetadata.textContent = typeof metadata === 'object' && metadata !== null ? JSON.stringify(metadata, null, 2) : String(metadata);
    if (DOM_ELEMENTS.metadataModal) DOM_ELEMENTS.metadataModal.style.display = 'flex';
}

/**
 * Обновляет текст и стиль статусного сообщения для новой загрузки.
 * @param {string} message Сообщение для отображения.
 * @param {'info'|'success'|'error'|'pending'} type Тип сообщения для стилизации.
 */
function updateUploadStatusDisplay(message, type) {
    if (DOM_ELEMENTS.uploadStatusText) {
        DOM_ELEMENTS.uploadStatusText.textContent = message;
        DOM_ELEMENTS.uploadStatusText.className = `upload-status-text status-${type}`; // Применяем класс для стилизации
    }
}

/**
 * Сбрасывает состояние прогресс-бара и скрывает его.
 */
function resetProgressBar() {
    if (DOM_ELEMENTS.progressBarContainer) DOM_ELEMENTS.progressBarContainer.style.display = 'none';
    if (DOM_ELEMENTS.progressBar) DOM_ELEMENTS.progressBar.style.width = '0%';
    if (DOM_ELEMENTS.progressText) DOM_ELEMENTS.progressText.textContent = '0%';
}

/**
 * Отображает общее сообщение о статусе на странице результатов.
 * @param {string} message Сообщение для отображения.
 * @param {'info'|'success'|'error'|'pending'|'completed'} type Тип сообщения для стилизации.
 */
function displayGeneralStatus(message, type) {
    if (DOM_ELEMENTS.concatenationStatusDiv) {
        DOM_ELEMENTS.concatenationStatusDiv.textContent = message;
        DOM_ELEMENTS.concatenationStatusDiv.className = `concatenation-status ${type}`;
    }
}

/**
 * Функция для отображения статуса обработки, передаваемая в модули обработки.
 * @param {string} message Сообщение для отображения.
 * @param {'info'|'success'|'error'|'warning'|'completed'|'pending'} type Тип сообщения для стилизации.
 */
function displayProcessStatus(message, type) {
    console.log(`DEBUG: [Process Status Callback] ${type}: ${message}`);
    displayGeneralStatus(message, type); // Используем основную функцию статуса
}

/**
 * Загружает данные uploadedVideos из localStorage.
 * Инициализирует uploadedVideos, если данные не найдены.
 */
function loadVideosFromLocalStorage() {
    try {
        const storedVideos = localStorage.getItem('uploadedVideos');
        uploadedVideos = storedVideos ? JSON.parse(storedVideos) : [];
        console.debug('DEBUG: Videos loaded from localStorage: %o', uploadedVideos);
    } catch (e) {
        console.error('ERROR: Could not parse uploadedVideos from localStorage, resetting.', e);
        uploadedVideos = [];
        localStorage.removeItem('uploadedVideos'); // Очищаем некорректные данные
    }
}

/**
 * Сохраняет текущее состояние uploadedVideos в localStorage.
 */
function saveVideosToLocalStorage() {
    try {
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        console.debug('DEBUG: Videos saved to localStorage: %o', uploadedVideos);
    } catch (e) {
        console.error('ERROR: Could not save uploadedVideos to localStorage.', e);
    }
}

/**
 * Отображает пользовательское модальное окно подтверждения вместо window.confirm().
 * @param {string} message Сообщение для отображения в модальном окне.
 * @returns {Promise<boolean>} Promise, который разрешается true, если пользователь подтвердил, и false в противном случае.
 */
function showConfirmationModal(message) {
    return new Promise(resolve => {
        // Создаем элементы модального окна
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modalOverlay.style.fontFamily = 'Inter, sans-serif'; // Применяем шрифт Inter

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content bg-white p-6 rounded-lg shadow-lg max-w-sm w-full text-center';

        const messageParagraph = document.createElement('p');
        messageParagraph.className = 'text-lg mb-4 text-gray-800';
        messageParagraph.textContent = message;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex justify-center space-x-4';

        const confirmButton = document.createElement('button');
        confirmButton.className = 'bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out';
        confirmButton.textContent = 'Удалить';
        confirmButton.addEventListener('click', () => {
            modalOverlay.remove();
            resolve(true);
        });

        const cancelButton = document.createElement('button');
        cancelButton.className = 'bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out';
        cancelButton.textContent = 'Отмена';
        cancelButton.addEventListener('click', () => {
            modalOverlay.remove();
            resolve(false);
        });

        buttonContainer.appendChild(confirmButton);
        buttonContainer.appendChild(cancelButton);
        modalContent.appendChild(messageParagraph);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);

        document.body.appendChild(modalOverlay);
    });
}


/**
 * Создает или обновляет элемент видео-пузыря в DOM.
 * @param {string} videoId Уникальный идентификатор видео.
 * @param {object} data Объект данных видео (статус, URL, имя файла и т.д.).
 */
function createOrUpdateBubble(videoId, data) {
    let videoGridItem = taskBubbles[videoId]; // Храним обертку здесь
    let bubble; // Сам элемент круглого видео-пузыря

    if (!videoGridItem) {
        // Пузырек не существует, создаем его
        videoGridItem = document.createElement('div');
        videoGridItem.className = 'video-grid-item'; // Новый класс-обертка
        videoGridItem.id = `video-item-${videoId}`; // Уникальный ID для обертки

        bubble = document.createElement('div');
        bubble.className = 'video-bubble loading';
        bubble.id = `bubble-${videoId}`; // Пузырь сохраняет свой ID

        videoGridItem.appendChild(bubble); // Добавляем пузырь в новую обертку
        if (DOM_ELEMENTS.bubblesContainer) DOM_ELEMENTS.bubblesContainer.appendChild(videoGridItem);
        taskBubbles[videoId] = videoGridItem; // Сохраняем обертку для будущих обновлений

        // Удаляем стартовое сообщение "No tasks found", если оно есть
        const initialMessage = document.getElementById('statusMessage');
        if (initialMessage && initialMessage.textContent.includes('Задач не найдено')) {
            initialMessage.remove();
        }
    } else {
        // Пузырек существует, находим его дочерний элемент 'video-bubble'
        bubble = videoGridItem.querySelector('.video-bubble');
    }

    // Объявляем переменные один раз
    let filenameText = `<h3 class="bubble-title-overlay">${sanitizeHTML(data.original_filename || `Задача ${videoId}`)}</h3>`;
    let statusMessageText = '';
    let actionButtonsHtml = ''; // Объявляем здесь один раз
    let thumbnailUrl;

    // ЛОГИКА ОПРЕДЕЛЕНИЯ URL МИНИАТЮРЫ
    // Для объединенного видео используем data.posterUrl
    if (data.isConcatenated && data.posterUrl) {
        thumbnailUrl = data.posterUrl;
        console.log(`DEBUG: Using posterUrl for concatenated video ${videoId}: ${thumbnailUrl}`);
    } else if (data.cloudinary_url) {
        // Для обычного видео используем Cloudinary URL
        thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
        console.log(`DEBUG: Using Cloudinary thumbnail URL for original video ${videoId}: ${thumbnailUrl}`);
    } else {
        // Возвращаемся к плейсхолдеру, если нет специфичного URL
        thumbnailUrl = 'assets/video_placeholder.png';
        console.log(`DEBUG: Using placeholder for video ${videoId} (no specific URL available).`);
    }

    // Логика определения статуса и кнопок действий
    switch (data.status) {
        case 'completed':
            statusMessageText = '<p class="status-message-bubble status-completed">Нажмите для просмотра метаданных</p>';
            bubble.classList.remove('loading');
            break;
        case 'uploaded':
            statusMessageText = `<p class="status-message-bubble status-info">Загружено, ожидание обработки...</p>`;
            bubble.classList.add('loading');
            break;
        case 'processing':
        case 'shotstack_pending':
            statusMessageText = `<p class="status-message-bubble status-pending">Обработка видео (Shotstack)...</p>`;
            bubble.classList.add('loading');
            break;
        case 'concatenated_pending':
            statusMessageText = `<p class="status-message-bubble status-pending">Объединение видео...</p>`;
            bubble.classList.add('loading');
            break;
        case 'concatenated_completed':
            // Используем shotstackUrl, который теперь будет содержать final video_url
            if (data.shotstackUrl) {
                statusMessageText = '<p class="status-message-bubble status-success">Объединение завершено!</p>';
                actionButtonsHtml += `<a href="${sanitizeHTML(data.shotstackUrl)}" target="_blank" class="action-button view-generated-button">Посмотреть сгенерированное видео</a>`;
            } else {
                statusMessageText = '<p class="status-message-bubble status-error">Объединение завершено, но URL отсутствует.</p>';
            }
            bubble.classList.remove('loading');
            break;
        case 'error':
        case 'failed':
        case 'concatenated_failed':
            statusMessageText = `<p class="status-message-bubble status-error">Ошибка: ${sanitizeHTML(data.message || 'Неизвестная ошибка.')}</p>`;
            bubble.classList.remove('loading');
            break;
        default:
            statusMessageText = '<p class="status-message-bubble status-info">Получение статуса...</p>';
            bubble.classList.add('loading');
            break;
    }

    // Добавляем кнопку удаления для всех типов видео, кроме тех, что прямо сейчас в процессе активной обработки.
    // Это должно быть после switch, чтобы не конфликтовать с другими кнопками.
    if (data.status !== 'uploaded' && data.status !== 'processing' && data.status !== 'shotstack_pending' && data.status !== 'concatenated_pending') {
        actionButtonsHtml += `<button class="action-button delete-button" data-video-id="${sanitizeHTML(videoId)}">Удалить</button>`;
    } else {
        // Если видео в процессе, мы не добавляем кнопку, чтобы избежать случайного удаления.
    }

    // Обновляем innerHTML пузыря (круглой части) один раз в конце
    bubble.innerHTML = `
        <img src="${sanitizeHTML(thumbnailUrl)}" alt="Видео превью" class="video-thumbnail">
        <div class="bubble-text-overlay">
            ${filenameText}
            ${statusMessageText}
            <div class="bubble-actions">
                ${actionButtonsHtml}
            </div>
        </div>
    `;

    // Найдите только что созданную кнопку удаления и добавьте слушатель события
    // Этот код должен быть после обновления innerHTML, чтобы кнопка существовала в DOM
    const deleteButton = bubble.querySelector(`.delete-button[data-video-id="${videoId}"]`);
    if (deleteButton) {
        deleteButton.addEventListener('click', async (event) => {
            event.stopPropagation(); // Важно: предотвращаем всплытие события, чтобы не сработал клик на пузырь
            console.log(`DEBUG: Delete button clicked for video ID: ${videoId}`);

            // Запрашиваем подтверждение у пользователя перед удалением с помощью пользовательского модального окна
            const confirmed = await showConfirmationModal(`Вы уверены, что хотите удалить видео ${sanitizeHTML(data.original_filename || videoId)}? Это действие необратимо и удалит видео из Cloudinary и базы данных.`);

            if (confirmed) {
                // Вызываем импортированную функцию deleteVideo, передавая ей необходимые аргументы
                const success = await deleteVideo(videoId, displayGeneralStatus, RENDER_BACKEND_URL);
                if (success) {
                    // Если удаление на бэкенде успешно, обновляем фронтенд
                    // Удаляем видео из массива uploadedVideos в localStorage
                    uploadedVideos = uploadedVideos.filter(v => v.id !== videoId);
                    saveVideosToLocalStorage(); // Сохраняем обновленный массив

                    // Удаляем пузырек из DOM
                    const videoGridItemToRemove = document.getElementById(`video-item-${videoId}`);
                    if (videoGridItemToRemove) {
                        videoGridItemToRemove.remove();
                        delete taskBubbles[videoId]; // Удаляем из объекта taskBubbles
                    }
                    updateConcatenationUI(); // Обновляем UI после удаления (например, состояние кнопки "Объединить")
                    displayGeneralStatus(`Видео ${sanitizeHTML(data.original_filename || videoId)} успешно удалено.`, 'success');
                } else {
                    displayGeneralStatus(`Не удалось удалить видео ${sanitizeHTML(data.original_filename || videoId)}.`, 'error');
                }
            }
        });
    }

    // --- Управление чекбоксом выбора видео ---
    // Сначала удалим существующий, если он есть, чтобы избежать дублирования
    let existingCheckboxContainer = bubble.querySelector('.bubble-checkbox-container');
    if (existingCheckboxContainer) {
        existingCheckboxContainer.remove();
    }

    // Если это НЕ объединенное видео, показываем чекбокс
    if (!data.isConcatenated) {
        const checkboxContainer = document.createElement('label');
        checkboxContainer.className = 'bubble-checkbox-container';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'bubble-checkbox';
        checkbox.value = videoId; // Значение чекбокса - ID видео

        // Получаем текущий список выбранных видео из uploadedVideos
        const currentVideoEntry = uploadedVideos.find(v => v.id === videoId);
        if (currentVideoEntry) {
            checkbox.checked = currentVideoEntry.selectedForConcatenation || false;
        } else {
            checkbox.checked = false;
        }

        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(document.createTextNode(' Выбрать'));
        bubble.appendChild(checkboxContainer); // Добавляем чекбокс в пузырек

        // Обработчик события для чекбокса
        checkbox.addEventListener('change', (event) => {
            const selectedId = event.target.value;
            const videoIndex = uploadedVideos.findIndex(v => v.id === selectedId);
            if (videoIndex !== -1) {
                uploadedVideos[videoIndex].selectedForConcatenation = event.target.checked;
                saveVideosToLocalStorage(); // Сохраняем состояние выбора
                updateConcatenationUI(); // Обновляем состояние кнопки объединения
                console.log(`[FRONTEND] Видео ${selectedId} ${event.target.checked ? 'выбрано' : 'снято с выбора'} для объединения.`);
            }
        });
    }

}

/**
 * Обновляет состояние кнопки "Обработать выбранные видео" и статус сообщений.
 * Теперь состояние чекбокса "Объединить видео" учитывается.
 */
function updateConcatenationUI() {
    // ВСЕГДА перечитываем uploadedVideos из localStorage, чтобы быть уверенными, что работаем с последней версией
    loadVideosFromLocalStorage(); // Загружаем видео из localStorage

    // Фильтруем видео со статусом 'completed', исключая объединенные видео
    const completedVideos = uploadedVideos.filter(v => v.status === 'completed' && !v.isConcatenated);
    const numCompletedVideos = completedVideos.length;

    console.log("DEBUG: updateConcatenationUI called.");
    console.log("DEBUG: numCompletedVideos (completed & not concatenated):", numCompletedVideos);

    const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;
    console.log("DEBUG: shouldConnect (actual checkbox state):", shouldConnect);

    if (!DOM_ELEMENTS.processSelectedVideosButton || !DOM_ELEMENTS.concatenationStatusDiv) return;

    // Управление состоянием чекбокса "Объединить видео"
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        if (numCompletedVideos < 2) {
            DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
            DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '0.5';
            DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'not-allowed';
            console.log("DEBUG: Connect checkbox disabled (less than 2 completed videos).");
            // Если меньше 2, убеждаемся, что чекбокс выключен
            if (DOM_ELEMENTS.connectVideosCheckbox.checked) {
                DOM_ELEMENTS.connectVideosCheckbox.checked = false;
                // И повторно вызываем, чтобы обновить текст кнопки, если надо
                setTimeout(updateConcatenationUI, 0); // небольшая задержка для DOM
                return;
            }
        } else {
            DOM_ELEMENTS.connectVideosCheckbox.disabled = false;
            DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.opacity = '1';
            DOM_ELEMENTS.connectVideosCheckbox.parentElement.style.cursor = 'pointer';
            console.log("DEBUG: Connect checkbox enabled (2+ completed videos).");
        }
    }

    // Логика кнопки "Обработать/Объединить видео"
    if (numCompletedVideos === 0) {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'none';
        displayGeneralStatus('Нет готовых видео для обработки или объединения. Загрузите видео.', 'info');
        console.log("DEBUG: No completed videos. Button hidden.");
    } else {
        DOM_ELEMENTS.processSelectedVideosButton.style.display = 'inline-block';
        if (shouldConnect) {
            const selectedForConcatenationCount = uploadedVideos.filter(v => v.selectedForConcatenation && v.status === 'completed' && !v.isConcatenated).length;
            if (selectedForConcatenationCount < 2) {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Объединить видео';
                displayGeneralStatus('Выберите 2 или более завершенных видео для объединения.', 'info');
                console.log("DEBUG: Connect option checked, but less than 2 selected for concatenation. Button disabled.");
            } else {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = `Объединить выбранные (${selectedForConcatenationCount})`;
                displayGeneralStatus(`Готово к объединению ${selectedForConcatenationCount} видео.`, 'success');
                console.log("DEBUG: Ready to concatenate selected videos. Button enabled.");
            }
        } else {
            // Если объединение не выбрано, кнопка для индивидуальной обработки всех завершенных
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            DOM_ELEMENTS.processSelectedVideosButton.textContent = `Обработать все ${numCompletedVideos} видео`;
            displayGeneralStatus(`Готово к индивидуальной обработке всех ${numCompletedVideos} видео.`, 'info');
            console.log("DEBUG: Ready for individual processing of all completed videos. Button enabled.");
        }
    }

    // Если есть активные задачи обработки/объединения, отключить кнопки
    const anyVideoProcessing = uploadedVideos.some(v =>
        v.status === 'processing' || v.status === 'shotstack_pending' || v.status === 'concatenated_pending'
    );
    if (anyVideoProcessing) {
        if (DOM_ELEMENTS.processSelectedVideosButton) DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
        if (DOM_ELEMENTS.connectVideosCheckbox) DOM_ELEMENTS.connectVideosCheckbox.disabled = true;
        displayGeneralStatus('Видео обрабатываются. Пожалуйста, подождите.', 'pending');
        console.log("DEBUG: Active video processing detected. Buttons disabled.");
    }
}

/**
 * Загружает выбранный файл видео на бэкенд со страницы результатов.
 * @param {File} file Файл для загрузки.
 */
async function uploadVideoFromResults(file) {
    const currentUsername = localStorage.getItem('hifeUsername');
    const currentEmail = localStorage.getItem('hifeEmail');
    const currentLinkedin = localStorage.getItem('hifeLinkedin');

    if (!currentUsername && !currentEmail && !currentLinkedin) {
        displayGeneralStatus('Данные пользователя не найдены. Пожалуйста, войдите, чтобы загрузить видео.', 'error');
        setTimeout(() => {
            window.location.replace('index.html');
        }, 3000);
        return;
    }

    if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
    updateUploadStatusDisplay('Начало загрузки...', 'info');
    if (DOM_ELEMENTS.progressBarContainer) DOM_ELEMENTS.progressBarContainer.style.display = 'flex';
    resetProgressBar();
    if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = true;

    uploadFileToCloudinary( // ИСПОЛЬЗУЕМ ИМПОРТИРОВАННУЮ ФУНКЦИЮ
        file,
        currentUsername,
        currentEmail,
        currentLinkedin,
        {
            updateFileBubbleUI: (f, msg, type) => updateUploadStatusDisplay(msg, type),
            displayGeneralStatus: displayGeneralStatus, // Передаем нашу функцию отображения общего статуса
            resetProgressBar: resetProgressBar,
            selectFilesButton: DOM_ELEMENTS.uploadNewBtn,
            uploadNewBtn: DOM_ELEMENTS.uploadNewBtn,
            progressBar: DOM_ELEMENTS.progressBar,
            progressText: DOM_ELEMENTS.progressText,
            progressBarContainer: DOM_ELEMENTS.progressBarContainer
        },
        (response, uploadedFile) => {
            const taskId = response.taskId;
            updateUploadStatusDisplay(`Видео загружено. ID задачи: ${taskId}. Ожидание обработки.`, 'pending');
            resetProgressBar();

            let newVideoEntry = {
                id: taskId,
                original_filename: response.originalFilename || uploadedFile.name,
                status: 'uploaded', // Начальный статус после загрузки
                timestamp: new Date().toISOString(),
                cloudinary_url: response.cloudinary_url || null,
                metadata: response.metadata || {},
                shotstackRenderId: null,
                shotstackUrl: null,
                posterUrl: null, // Добавляем posterUrl для индивидуальных видео
                isConcatenated: false, // Инициализируем как необъединенное
                selectedForConcatenation: false // Инициализируем как невыбранное
            };

            uploadedVideos.push(newVideoEntry);
            saveVideosToLocalStorage();

            createOrUpdateBubble(taskId, newVideoEntry);
            checkTaskStatuses(); // Запускаем опрос для нового видео
            updateConcatenationUI(); // Обновляем UI после добавления нового видео

            setTimeout(() => {
                if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.add('hidden');
                updateUploadStatusDisplay('Готов к новой загрузке.', 'info');
            }, 5000);
        },
        (error, erroredFile) => {
            updateUploadStatusDisplay(`Ошибка загрузки для ${erroredFile.name}: ${sanitizeHTML(error.error || 'Неизвестная ошибка')}`, 'error');
            resetProgressBar();
            if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;
        }
    );
}

/**
 * Перенаправляет пользователя на страницу finish.html с URL-адресами видео и постера.
 * @param {string} videoUrl - URL объединенного видео.
 * @param {string} posterUrl - URL постера объединенного видео.
 */
function navigateToFinishPage(videoUrl, posterUrl) {
    if (!videoUrl) {
        console.error("[RESULTS] Невозможно перенаправить на finish.html: videoUrl отсутствует.");
        displayGeneralStatus("Не удалось получить URL объединенного видео для перенаправления.", 'error');
        return;
    }
    const params = new URLSearchParams();
    params.append('video_url', videoUrl);
    if (posterUrl) {
        params.append('poster_url', posterUrl);
    }
    // Добавляем исходные данные пользователя для сохранения контекста
    const currentUsername = localStorage.getItem('hifeUsername');
    const currentEmail = localStorage.getItem('hifeEmail');
    const currentLinkedin = localStorage.getItem('hifeLinkedin');

    if (currentUsername) params.append('instagram_username', currentUsername);
    if (currentEmail) params.append('email', currentEmail);
    if (currentLinkedin) params.append('linkedin_profile', currentLinkedin);

    // Очищаем флаги объединения из localStorage перед перенаправлением
    localStorage.removeItem('concatenationInitiated');
    localStorage.removeItem('activeConcatenationTaskId');

    const redirectUrl = `finish.html?${params.toString()}`;
    console.log(`[RESULTS] Перенаправление на: ${redirectUrl}`);
    window.location.href = redirectUrl;
}

/**
 * Обрабатывает запрос на обработку выбранных видео (индивидуально или объединение).
 * Эта функция является точкой входа для UI, вызывающей логику обработки в process_videos.js.
 */
async function handleProcessSelectedVideos() {
    console.debug('DEBUG: --- Process Selected Videos Button Click Handler STARTED ---');
    if (DOM_ELEMENTS.processSelectedVideosButton) {
        DOM_ELEMENTS.processSelectedVideosButton.disabled = true;
        DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Обработка...';
    }

    loadVideosFromLocalStorage();
    console.debug('DEBUG: uploadedVideos reloaded from localStorage at handler start: %o', uploadedVideos);

    const shouldConnect = DOM_ELEMENTS.connectVideosCheckbox ? DOM_ELEMENTS.connectVideosCheckbox.checked : false;
    console.debug("DEBUG: Is 'Connect videos' checkbox checked (actual checkbox state)?: %s", shouldConnect);

    let videosToProcess;
    if (shouldConnect) {
        // Если выбрано объединение, берем только те видео, которые выбраны чекбоксом
        videosToProcess = uploadedVideos.filter(video => video.selectedForConcatenation && video.status === 'completed' && !video.isConcatenated);
        if (videosToProcess.length < 2) {
            displayGeneralStatus('Выберите как минимум два видео для объединения.', 'info');
            if (DOM_ELEMENTS.processSelectedVideosButton) {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Объединить видео';
            }
            console.debug('DEBUG: --- Process Selected Videos Button Click Handler FINISHED (Not enough selected for concatenation) ---');
            return;
        }
    } else {
        // Если объединение не выбрано, берем все "completed" видео для индивидуальной обработки
        videosToProcess = uploadedVideos.filter(video => video.status === 'completed' && !video.isConcatenated);
        if (videosToProcess.length === 0) {
            displayGeneralStatus('Нет завершенных видео для индивидуальной обработки.', 'info');
            if (DOM_ELEMENTS.processSelectedVideosButton) {
                DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
                DOM_ELEMENTS.processSelectedVideosButton.textContent = 'Обработать видео';
            }
            console.debug('DEBUG: --- Process Selected Videos Button Click Handler FINISHED (No completed videos for individual processing) ---');
            return;
        }
    }

    const taskIdsToProcess = videosToProcess.map(video => video.id);
    console.debug('DEBUG: Task IDs to process: %o', taskIdsToProcess);

    const identifierType = localStorage.getItem('hifeIdentifierType');
    const identifierValue = localStorage.getItem('hifeUsername') || localStorage.getItem('hifeEmail') || localStorage.getItem('hifeLinkedin') || '';

    const email = identifierType === 'email' ? identifierValue : null;
    const instagram_username = identifierType === 'instagram_username' ? identifierValue : null;
    const linkedin_profile = identifierType === 'linkedin_profile' ? identifierValue : null;

    displayGeneralStatus('Отправка видео на обработку. Пожалуйста, подождите...', 'info');
    try {
        const response = await initiateVideoProcessing(
            taskIdsToProcess,
            shouldConnect,
            instagram_username,
            email,
            linkedin_profile
        );

        console.debug('DEBUG: initiateVideoProcessing returned: %o', response);

        if (response.error) {
            displayGeneralStatus(response.error, 'error');
            return;
        }

        if (shouldConnect && response.concatenated_task_id) {
            concatenationInitiated = true; // Устанавливаем флаг
            activeConcatenationTaskId = response.concatenated_task_id; // Сохраняем ID объединенной задачи
            localStorage.setItem('concatenationInitiated', 'true'); // Сохраняем в localStorage
            localStorage.setItem('activeConcatenationTaskId', activeConcatenationTaskId); // Сохраняем ID

            const newConcatenatedVideo = {
                id: response.concatenated_task_id,
                original_filename: 'Объединенное Видео',
                status: 'concatenated_pending',
                timestamp: new Date().toISOString(),
                cloudinary_url: null, // Может быть null или временный URL, пока не завершено
                shotstackRenderId: response.shotstackRenderId || null,
                shotstackUrl: null, // Этот будет содержать final video_url после завершения
                posterUrl: null, // Этот будет содержать final poster_url после завершения
                isConcatenated: true, // Флаг для объединенного видео
                selectedForConcatenation: false
            };
            uploadedVideos.push(newConcatenatedVideo);
            saveVideosToLocalStorage();
            createOrUpdateBubble(newConcatenatedVideo.id, newConcatenatedVideo);
            displayGeneralStatus('Объединение видео инициировано. Отслеживание статуса...', 'info');
            console.debug('DEBUG: New concatenated video added for tracking: %o', newConcatenatedVideo);
        } else if (response.initiated_tasks && response.initiated_tasks.length > 0) {
            concatenationInitiated = false; // Убеждаемся, что флаг сброшен, если это индивидуальная обработка
            localStorage.removeItem('concatenationInitiated');
            localStorage.removeItem('activeConcatenationTaskId');

            response.initiated_tasks.forEach(initiatedTask => {
                const videoIndex = uploadedVideos.findIndex(v => v.id === initiatedTask.taskId);
                if (videoIndex !== -1) {
                    uploadedVideos[videoIndex].status = 'shotstack_pending';
                    uploadedVideos[videoIndex].shotstackRenderId = initiatedTask.shotstackRenderId;
                    uploadedVideos[videoIndex].message = initiatedTask.message;
                    uploadedVideos[videoIndex].selectedForConcatenation = false; // Сбрасываем выбор
                    createOrUpdateBubble(uploadedVideos[videoIndex].id, uploadedVideos[videoIndex]);
                }
            });
            saveVideosToLocalStorage();
            displayGeneralStatus('Индивидуальная обработка видео инициирована. Отслеживание статуса...', 'info');
        } else {
            displayGeneralStatus('Не удалось инициировать обработку видео. Пожалуйста, попробуйте еще раз.', 'error');
        }

        // Запускаем опрос статусов после инициирования обработки
        if (!pollingIntervalId) {
            pollingIntervalId = setInterval(checkTaskStatuses, POLLING_INTERVAL);
            console.log("DEBUG: Started polling interval after initiating tasks.");
        }
    } catch (error) {
        console.error('ERROR: Failed to process selected videos:', error);
        displayGeneralStatus(`Ошибка при обработке видео: ${error.message}`, 'error');
    } finally {
        if (DOM_ELEMENTS.processSelectedVideosButton) {
            DOM_ELEMENTS.processSelectedVideosButton.disabled = false;
            updateConcatenationUI(); // Обновляем текст кнопки
        }
        console.debug('DEBUG: --- Process Selected Videos Button Click Handler FINISHED ---');
    }
}


/**
 * Периодически проверяет статусы задач на бэкенде.
 * Обновляет `uploadedVideos` и DOM-элементы.
 */
async function checkTaskStatuses() {
    console.log("DEBUG: checkTaskStatuses called.");

    // ВСЕГДА перезагружаем uploadedVideos из localStorage, чтобы быть уверенными, что работаем с последней версией.
    loadVideosFromLocalStorage();
    console.log("DEBUG: uploadedVideos reloaded from localStorage at checkTaskStatuses start:", uploadedVideos);

    // Получаем состояние флага объединения из localStorage
    concatenationInitiated = localStorage.getItem('concatenationInitiated') === 'true';
    activeConcatenationTaskId = localStorage.getItem('activeConcatenationTaskId');

    let isTargetConcatenationCompleted = false;
    let targetConcatenatedVideo = null;

    if (concatenationInitiated && activeConcatenationTaskId) {
        targetConcatenatedVideo = uploadedVideos.find(v => v.id === activeConcatenationTaskId && v.isConcatenated);
        if (targetConcatenatedVideo && targetConcatenatedVideo.status === 'concatenated_completed') {
            isTargetConcatenationCompleted = true;
            console.log(`DEBUG: checkTaskStatuses - Identified active concatenation task ${activeConcatenationTaskId} as completed.`);
        } else if (targetConcatenatedVideo && targetConcatenatedVideo.status === 'concatenated_failed') {
            // Если инициированное объединение провалилось, сбрасываем флаг и не перенаправляем
            concatenationInitiated = false;
            activeConcatenationTaskId = null;
            localStorage.removeItem('concatenationInitiated');
            localStorage.removeItem('activeConcatenationTaskId');
            console.log(`DEBUG: checkTaskStatuses - Active concatenation task ${activeConcatenationTaskId} failed. Resetting flags.`);
        }
    }

    // Определяем, есть ли ЛЮБЫЕ другие видео, которые все еще обрабатываются (но не наше целевое, если оно завершено)
    const hasAnyActiveProcessing = uploadedVideos.some(v =>
        v.status === 'uploaded' ||
        v.status === 'processing' ||
        v.status === 'shotstack_pending' ||
        (v.status === 'concatenated_pending' && (!activeConcatenationTaskId || v.id !== activeConcatenationTaskId)) // Другие объединенные задачи или текущая, если она еще не завершена
    );

    console.log("DEBUG: checkTaskStatuses - concatenationInitiated:", concatenationInitiated);
    console.log("DEBUG: checkTaskStatuses - activeConcatenationTaskId:", activeConcatenationTaskId);
    console.log("DEBUG: checkTaskStatuses - isTargetConcatenationCompleted:", isTargetConcatenationCompleted);
    console.log("DEBUG: checkTaskStatuses - hasAnyActiveProcessing (excluding a completed specific concat):", hasAnyActiveProcessing);

    // --- Логика перенаправления ---
    // Перенаправляем, если было инициировано объединение И это объединенное видео завершено.
    // При этом не ждем завершения других индивидуальных видео.
    if (concatenationInitiated && isTargetConcatenationCompleted) {
        console.log(`DEBUG: [FRONTEND] Инициированная задача объединения ${activeConcatenationTaskId} завершена. Перенаправление на finish.html.`);
        // Останавливаем опрос перед перенаправлением
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
        // Используем navigateToFinishPage для перенаправления с правильными URL
        navigateToFinishPage(targetConcatenatedVideo.shotstackUrl, targetConcatenatedVideo.posterUrl);
        return; // Важно: выйти после перенаправления
    }

    // --- Управление опросом ---
    // Опрос должен продолжаться, если есть ЛЮБЫЕ активно обрабатываемые или требующие взаимодействия пользователя видео.
    // Если нет активной обработки И НЕ было инициировано объединение (или оно завершилось/провалилось)
    // И есть видео, которые требуют взаимодействия пользователя (completed, но не объединенные)
    const hasAnyVideosAwaitingUserAction = uploadedVideos.some(v => v.status === 'completed' && !v.isConcatenated);

    if (hasAnyActiveProcessing || hasAnyVideosAwaitingUserAction) {
        if (!pollingIntervalId) {
            pollingIntervalId = setInterval(checkTaskStatuses, POLLING_INTERVAL);
            console.log("DEBUG: Запущен интервал опроса статусов задач.");
        }
    } else {
        // Если нет активной обработки И нет видео, требующих взаимодействия с пользователем,
        // это означает, что все видео находятся в конечном состоянии (ошибка/провал) или их нет.
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId); // Останавливаем опрос
            pollingIntervalId = null;
            console.log("[FRONTEND] Нет больше задач, требующих действий. Опрос остановлен.");
        }
        if (uploadedVideos.length === 0) {
            displayGeneralStatus('Видео еще не загружены. Перейдите на страницу загрузки.', 'info');
            if (DOM_ELEMENTS.bubblesContainer) {
                DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
            }
        } else {
            // Если нет активной обработки и не было активной задачи объединения (или она завершилась/провалилась)
            displayGeneralStatus('Все процессы обработки видео завершены. Ознакомьтесь с результатами ниже.', 'completed');
        }
    }

    // Удаляем начальное сообщение "No tasks found", если оно есть и у нас есть реальные видео
    const initialMessage = document.getElementById('statusMessage');
    if (initialMessage && uploadedVideos.length > 0) {
        initialMessage.remove();
    }

    // --- Обработка статусов отдельных задач (цикл) ---
    // Проходим по копии, чтобы избежать проблем с изменением массива во время итерации
    const videosToPoll = uploadedVideos.filter(v =>
        v.status !== 'completed' && v.status !== 'error' && v.status !== 'failed' &&
        v.status !== 'concatenated_completed' && v.status !== 'concatenated_failed'
    );

    for (const video of videosToPoll) {
        const videoId = video.id;
        const currentLocalStatus = video.status;

        // Если это объединенное видео в ожидании, используем специфичную функцию
        if (currentLocalStatus === 'concatenated_pending') {
            try {
                const statusResponse = await getConcatenatedVideoStatus(videoId);
                const index = uploadedVideos.findIndex(v => v.id === videoId);
                if (index !== -1) {
                    // ИЗМЕНЕНО: Проверяем на 'concatenated_completed' и используем video_url/poster_url
                    if (statusResponse && statusResponse.status === 'concatenated_completed' && statusResponse.video_url) {
                        uploadedVideos[index] = {
                            ...uploadedVideos[index],
                            status: 'concatenated_completed',
                            cloudinary_url: statusResponse.cloudinary_url || uploadedVideos[index].cloudinary_url, // Если Cloudinary URL все еще нужен
                            shotstackUrl: statusResponse.video_url, // Обновлено: final video URL
                            posterUrl: statusResponse.poster_url || uploadedVideos[index].posterUrl, // Обновлено: poster URL
                            message: 'Видео объединено и готово!',
                            isConcatenated: true // Убеждаемся, что флаг установлен
                        };
                        createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                        displayGeneralStatus('Объединенное видео готово!', 'success');
                    } else if (statusResponse && statusResponse.status === 'failed') {
                        uploadedVideos[index] = {
                            ...uploadedVideos[index],
                            status: 'concatenated_failed',
                            message: statusResponse.message || 'Объединение видео не удалось.',
                            isConcatenated: true
                        };
                        createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                        displayGeneralStatus(`Ошибка при объединении видео: ${uploadedVideos[index].message}`, 'error');
                    } else {
                        // Если статус не изменился или не содержит final_url, просто обновите bubble
                        createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                    }
                }
            } catch (error) {
                console.error(`Ошибка при проверке статуса объединенного видео ${videoId}:`, error);
                const index = uploadedVideos.findIndex(v => v.id === videoId);
                if (index !== -1) {
                    uploadedVideos[index].status = 'failed';
                    uploadedVideos[index].message = error.message;
                    createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                }
            }
        } else { // Обрабатываем опрос статуса отдельного видео
            try {
                const updatedTask = await getSingleVideoStatus(videoId);
                const index = uploadedVideos.findIndex(v => v.id === videoId);
                if (index !== -1) {
                    uploadedVideos[index] = {
                        ...uploadedVideos[index],
                        status: updatedTask.status,
                        original_filename: updatedTask.originalFilename || uploadedVideos[index].original_filename,
                        cloudinary_url: updatedTask.cloudinary_url || uploadedVideos[index].cloudinary_url,
                        metadata: updatedTask.metadata || uploadedVideos[index].metadata,
                        message: updatedTask.message || uploadedVideos[index].message,
                        shotstackRenderId: updatedTask.shotstackRenderId || uploadedVideos[index].shotstackRenderId,
                        shotstackUrl: updatedTask.shotstackUrl || uploadedTask.video_url || uploadedVideos[index].shotstackUrl, // Prefer video_url if available, then shotstackUrl
                        posterUrl: updatedTask.posterUrl || updatedTask.thumbnail_url || uploadedVideos[index].posterUrl // Prefer posterUrl if available, then thumbnail_url
                    };
                    createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                }
            } catch (error) {
                console.error(`Ошибка при проверке статуса отдельного видео ${videoId}:`, error);
                const index = uploadedVideos.findIndex(v => v.id === videoId);
                if (index !== -1) {
                    uploadedVideos[index].status = 'failed';
                    uploadedVideos[index].message = error.message;
                    createOrUpdateBubble(uploadedVideos[index].id, uploadedVideos[index]);
                }
            }
        }
    }
    saveVideosToLocalStorage(); // Сохраняем все изменения после цикла
    updateConcatenationUI(); // Обновляем UI после всех возможных изменений статусов
}


/**
 * Настраивает все обработчики событий для DOM-элементов.
 */
function setupEventListeners() {
    console.debug("DEBUG: setupEventListeners STARTED.");

    if (DOM_ELEMENTS.uploadNewBtn) {
        DOM_ELEMENTS.uploadNewBtn.addEventListener('click', () => {
            console.debug("DEBUG: 'Upload New Video' button clicked. Triggering hidden file input.");
            if (DOM_ELEMENTS.videoFileInput) {
                DOM_ELEMENTS.videoFileInput.click();
            }
        });
    }

    if (DOM_ELEMENTS.videoFileInput) {
        DOM_ELEMENTS.videoFileInput.addEventListener('change', async (event) => {
            console.debug("DEBUG: Video file input changed. Files selected: %o", event.target.files);
            const file = event.target.files[0];
            if (file) {
                console.debug(`DEBUG: Selected file: ${file.name}, type: ${file.type}, size: ${file.size} bytes.`);
                if (!file.type.startsWith('video/')) {
                    displayGeneralStatus('Пожалуйста, выберите файл видео.', 'error');
                    console.warn('WARN: Non-video file selected.');
                    return;
                }
                await uploadVideoFromResults(file);
            } else {
                console.debug('DEBUG: No file selected.');
            }
            event.target.value = ''; // Очищаем значение инпута
        });
    }

    if (DOM_ELEMENTS.finishSessionBtn) {
        DOM_ELEMENTS.finishSessionBtn.addEventListener('click', () => {
            console.log("DEBUG: Finish Session button clicked. Clearing localStorage and redirecting.");
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('index.html');
        });
    }

    if (DOM_ELEMENTS.closeButton) {
        DOM_ELEMENTS.closeButton.addEventListener('click', () => {
            console.debug("DEBUG: Close button clicked. Hiding metadata modal.");
            if (DOM_ELEMENTS.metadataModal) {
                DOM_ELEMENTS.metadataModal.style.display = 'none';
            }
        });
    }

    // Обработчик кнопки "Обработать/Объединить выбранные видео"
    if (DOM_ELEMENTS.processSelectedVideosButton) {
        DOM_ELEMENTS.processSelectedVideosButton.addEventListener('click', handleProcessSelectedVideos);
        console.debug('DEBUG: Process Selected Videos Button event listener attached.');
    }

    // Обработчик для чекбокса "Объединить видео"
    if (DOM_ELEMENTS.connectVideosCheckbox) {
        DOM_ELEMENTS.connectVideosCheckbox.addEventListener('change', updateConcatenationUI);
        console.debug('DEBUG: Connect Videos Checkbox event listener attached.');
    }

    // Обработчики для закрытия модального окна по клику вне его
    if (DOM_ELEMENTS.metadataModal) {
        DOM_ELEMENTS.metadataModal.addEventListener('click', (event) => {
            if (event.target === DOM_ELEMENTS.metadataModal) {
                console.debug("DEBUG: Clicked outside metadata modal. Hiding modal.");
                DOM_ELEMENTS.metadataModal.style.display = 'none';
            }
        });
    }

    console.debug("DEBUG: setupEventListeners FINISHED.");
}


// --- Инициализация при загрузке страницы ---

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DEBUG: DOMContentLoaded event fired. Initializing application.");
    loadVideosFromLocalStorage(); // Загружаем видео при старте
    setupEventListeners(); // Настраиваем все обработчики событий

    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');
    const linkedin = localStorage.getItem('hifeLinkedin');

    let headerText = 'Ваши Видео';
    identifierToFetch = null;
    identifierTypeToFetch = null;

    if (username) {
        headerText = `Ваши Видео для @${sanitizeHTML(username)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: @${sanitizeHTML(username)}`;
        localStorage.setItem('hifeIdentifierType', 'instagram_username');
        identifierToFetch = username;
        identifierTypeToFetch = 'instagram_username';
    } else if (email) {
        headerText = `Ваши Видео для ${sanitizeHTML(email)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: ${sanitizeHTML(email)}`;
        localStorage.setItem('hifeIdentifierType', 'email');
        identifierToFetch = email;
        identifierTypeToFetch = 'email';
    } else if (linkedin) {
        headerText = `Ваши Видео для ${sanitizeHTML(linkedin)}`;
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = `Для: ${sanitizeHTML(linkedin)}`;
        localStorage.setItem('hifeIdentifierType', 'linkedin_profile');
        identifierToFetch = linkedin;
        identifierTypeToFetch = 'linkedin_profile';
    } else {
        if (DOM_ELEMENTS.usernameDisplay) DOM_ELEMENTS.usernameDisplay.textContent = 'Для: Гость';
        localStorage.removeItem('hifeIdentifierType');
        displayGeneralStatus('Данные пользователя не найдены. Загрузите видео со страницы загрузки.', 'info');
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
    }
    if (DOM_ELEMENTS.resultsHeader) DOM_ELEMENTS.resultsHeader.textContent = headerText;

    // Управление кнопкой "Upload New Video(s)"
    if (identifierToFetch) {
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = false;
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.textContent = 'Загрузить новое видео';
        updateUploadStatusDisplay('Готов к новой загрузке.', 'info');
        if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
        resetProgressBar();
    } else {
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.disabled = true;
        if (DOM_ELEMENTS.uploadNewBtn) DOM_ELEMENTS.uploadNewBtn.textContent = 'Загрузить (сначала войдите)';
        updateUploadStatusDisplay('Невозможно повторно загрузить: данные пользователя не найдены. Пожалуйста, загрузите видео со страницы загрузки.', 'error');
        if (DOM_ELEMENTS.dynamicUploadStatusContainer) DOM_ELEMENTS.dynamicUploadStatusContainer.classList.remove('hidden');
        resetProgressBar();
    }

    // --- Загрузка видео пользователя с бэкенда при загрузке страницы ---
    if (identifierToFetch && identifierTypeToFetch) {
        try {
            const fetchedVideos = await fetchUserVideosFromBackend(identifierToFetch, identifierTypeToFetch);
            // Очищаем существующие видео, так как fetchUserVideosFromBackend вернет актуальный список
            uploadedVideos = [];
            localStorage.removeItem('uploadedVideos');
            fetchedVideos.forEach(newVideo => {
                uploadedVideos.push({
                    id: newVideo.taskId,
                    original_filename: newVideo.originalFilename,
                    status: newVideo.status,
                    timestamp: newVideo.timestamp,
                    cloudinary_url: newVideo.cloudinary_url,
                    shotstackRenderId: newVideo.shotstackRenderId,
                    // ИЗМЕНЕНО: Используем newVideo.video_url для shotstackUrl и newVideo.poster_url для posterUrl
                    shotstackUrl: newVideo.video_url || newVideo.shotstackUrl, // Теперь video_url - основной для final link
                    posterUrl: newVideo.poster_url || newVideo.thumbnail_url, // Теперь poster_url - основной для постера
                    message: newVideo.message,
                    metadata: newVideo.metadata || {},
                    isConcatenated: newVideo.isConcatenated || false, // Важно!
                    selectedForConcatenation: false
                });
                createOrUpdateBubble(newVideo.taskId, uploadedVideos[uploadedVideos.length - 1]);
            });
            saveVideosToLocalStorage();
            if (uploadedVideos.length > 0) {
                displayGeneralStatus(`Найдено ${uploadedVideos.length} видео для этого пользователя.`, 'success');
            } else {
                displayGeneralStatus('Задач не найдено для этого пользователя.', 'info');
                if (DOM_ELEMENTS.bubblesContainer) {
                    DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
                }
            }
        } catch (error) {
            console.error('ERROR: Failed to fetch user videos on load:', error);
            displayGeneralStatus(`Ошибка при загрузке видео: ${sanitizeHTML(error.message)}. Пожалуйста, попробуйте позже.`, 'error');
            uploadedVideos = [];
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
            if (DOM_ELEMENTS.bubblesContainer) {
                DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message error">Не удалось загрузить видео. Пожалуйста, проверьте подключение и попробуйте снова.</p>';
            }
        }
    } else {
        uploadedVideos = [];
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
        if (DOM_ELEMENTS.bubblesContainer) {
            DOM_ELEMENTS.bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">Задач не найдено. Пожалуйста, загрузите видео со <a href="index.html" style="color: #FFD700; text-decoration: underline;">страницы загрузки</a>.</p>';
        }
        displayGeneralStatus('Данные пользователя не найдены. Загрузите видео со страницы загрузки.', 'info');
    }

    checkTaskStatuses(); // Запускаем опрос статусов
    updateConcatenationUI(); // Инициализируем UI объединения
});
