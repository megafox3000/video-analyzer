// upload_validation.js (Оркестратор)

import { uploadFileToCloudinary } from './cloudinary_upload.js';
import { startScanner, stopScanner } from './qr_scanner.js';
import { validateFile } from './file_validator.js';
import { displayGeneralStatus, createPreviewBubble, updateBubbleStatus, clearPreviews } from './ui_upload_feedback.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Элементы ---
    const instagramInput = document.getElementById('instagramInput');
    const selectFilesButton = document.getElementById('selectFilesButton');
    const videoInput = document.getElementById('videoFileInput');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const previewContainer = document.getElementById('selectedFilesPreviewContainer');
    // ... (остальные ваши DOM элементы) ...

    let filesToUpload = [];

    // --- Функции ---

    function validateInputs() {
        const anyFieldFilled = instagramInput.value.trim() !== ''; // Упрощенная проверка
        const allFilesValid = filesToUpload.every(file => file._isValid);
        selectFilesButton.disabled = !(anyFieldFilled && filesToUpload.length > 0 && allFilesValid);
    }

    async function handleFileSelection(event) {
        filesToUpload = Array.from(event.target.files);
        clearPreviews(previewContainer);

        if (filesToUpload.length === 0) {
            validateInputs();
            return;
        }

        previewContainer.parentElement.style.display = 'block';

        for (const file of filesToUpload) {
            createPreviewBubble(file, previewContainer);
            const validationResult = await validateFile(file);
            file._isValid = validationResult.isValid;

            if (validationResult.isValid) {
                updateBubbleStatus(file, 'Готов к загрузке', 'success');
            } else {
                updateBubbleStatus(file, validationResult.reason, 'error');
            }
        }
        
        const invalidCount = filesToUpload.filter(f => !f._isValid).length;
        if (invalidCount > 0) {
            displayGeneralStatus(generalStatusMessage, `${invalidCount} файл(ов) не прошли валидацию.`, 'error');
        } else {
            displayGeneralStatus(generalStatusMessage, `Все ${filesToUpload.length} видео готовы. Нажмите "Transfer".`, 'completed');
        }
        
        validateInputs();
    }
    
    function uploadNextFile() {
        const validFiles = filesToUpload.filter(f => f._isValid);
        // ... (ваша логика поочередной загрузки, теперь она будет вызывать uploadFileToCloudinary)
    }

    // --- Обработчики событий ---
    instagramInput?.addEventListener('input', validateInputs);
    videoInput?.addEventListener('change', handleFileSelection);
    selectFilesButton?.addEventListener('click', () => {
        if (selectFilesButton.textContent.includes('Choose')) {
            videoInput.click();
        } else {
            uploadNextFile();
        }
    });

    // ... (остальные обработчики: QR, спец.код, таймер неактивности) ...

    validateInputs(); // Первоначальная проверка при загрузке
});
