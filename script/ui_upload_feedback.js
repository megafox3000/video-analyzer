// ui_upload_feedback.js

/**
 * Отображает общее сообщение о статусе.
 * @param {HTMLElement} element - DOM-элемент для сообщения.
 * @param {string} message - Сообщение.
 * @param {'info'|'success'|'error'|'pending'} type - Тип для стилизации.
 */
export function displayGeneralStatus(element, message, type) {
    if (element) {
        element.textContent = message;
        element.className = `status-message status-${type}`;
    }
}

/**
 * Создает "пузырь" для предпросмотра файла.
 * @param {File} file - Файл.
 * @param {HTMLElement} container - DOM-элемент контейнера для превью.
 * @returns {HTMLElement} Созданный элемент пузыря.
 */
export function createPreviewBubble(file, container) {
    const previewBubble = document.createElement('div');
    previewBubble.className = 'preview-bubble media-bubble';
    previewBubble.innerHTML = `
        <img class="bubble-preview-img" src="assets/video_placeholder.png" alt="Превью">
        <div class="bubble-text-overlay">
            <h3 class="bubble-title-overlay">${file.name}</h3>
            <p class="status-message-bubble status-info">Валидация...</p>
        </div>
    `;
    container.appendChild(previewBubble);
    file._previewBubble = previewBubble; // Сохраняем ссылку на элемент в объекте файла
    return previewBubble;
}

/**
 * Обновляет статус внутри конкретного пузыря.
 * @param {File} file - Файл, у которого есть свойство _previewBubble.
 * @param {string} message - Сообщение.
 * @param {'info'|'success'|'error'} type - Тип статуса.
 */
export function updateBubbleStatus(file, message, type) {
    const statusElement = file._previewBubble?.querySelector('.status-message-bubble');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status-message-bubble status-${type}`;
    }
}

/**
 * Очищает контейнер предпросмотра.
 * @param {HTMLElement} container 
 */
export function clearPreviews(container) {
    if (container) {
        container.innerHTML = '';
        container.parentElement.style.display = 'none';
    }
}
