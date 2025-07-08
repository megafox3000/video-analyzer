// ui_upload_feedback.js
"""
This module contains all functions related to updating the UI
on the upload page. It manipulates the DOM to provide feedback to the user.
"""

/**
 * Displays a general status message on the page.
 * @param {HTMLElement} element - The DOM element for the message.
 * @param {string} message - The message to display.
 * @param {'info'|'success'|'error'|'pending'} type - The type of message for styling.
 */
export function displayGeneralStatus(element, message, type) {
    if (element) {
        element.textContent = message;
        element.className = `status-message status-${type}`;
    }
}

/**
 * Creates a preview "bubble" for a selected file.
 * @param {File} file - The file object.
 * @param {HTMLElement} container - The DOM element to append the bubble to.
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
    // Store a reference to the DOM element directly on the file object for easy access
    file._previewBubble = previewBubble;
}

/**
 * Updates the status message inside a specific file's preview bubble.
 * @param {File} file - The file object that has a _previewBubble property.
 * @param {string} message - The message to display.
 * @param {'info'|'success'|'error'} type - The status type for styling.
 */
export function updateBubbleStatus(file, message, type) {
    const statusElement = file._previewBubble?.querySelector('.status-message-bubble');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status-message-bubble status-${type}`;
    }
}

/**
 * Clears all preview bubbles and hides the preview section.
 * @param {HTMLElement} container - The container holding the bubbles.
 * @param {HTMLElement} section - The parent section element to hide.
 */
export function clearPreviews(container, section) {
    if (container) {
        container.innerHTML = '';
    }
    if (section) {
        section.style.display = 'none';
    }
}

/**
 * Updates the visual progress bar.
 * @param {number} percent - The completion percentage (0-100).
 * @param {object} domElements - An object containing references to progress bar DOM elements.
 */
export function updateProgressBar(percent, domElements) {
    const { progressBar, progressText, progressBarContainer } = domElements;
    if (progressBarContainer) progressBarContainer.style.display = 'flex';
    if (progressBar) progressBar.style.width = `${percent.toFixed(0)}%`;
    if (progressText) progressText.textContent = `${percent.toFixed(0)}%`;
}

/**
 * Resets and hides the progress bar.
 * @param {object} domElements - An object containing references to progress bar DOM elements.
 */
export function resetProgressBar(domElements) {
    const { progressBar, progressText, progressBarContainer } = domElements;
    if (progressBarContainer) progressBarContainer.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
}
