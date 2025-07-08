// upload_validation.js (Оркестратор с полным UI)

import { uploadFileToCloudinary } from './cloudinary_upload.js';
import { startScanner, stopScanner } from './qr_scanner.js';
import { validateFile } from './file_validator.js';
import { displayGeneralStatus, createPreviewBubble, updateBubbleStatus, clearPreviews } from './ui_upload_feedback.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Элементы ---
    const instagramInput = document.getElementById('instagramInput');
    const emailInput = document.getElementById('emailInput');
    const linkedinInput = document.getElementById('linkedinInput');
    const videoInput = document.getElementById('videoFileInput');
    const selectFilesButton = document.getElementById('selectFilesButton');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const previewContainer = document.getElementById('selectedFilesPreviewContainer');

    // ИСПРАВЛЕНО: Возвращаем элементы для переключения UI
    const showUploadFormBtn = document.getElementById('showUploadFormBtn');
    const showQrScannerBtn = document.getElementById('showQrScannerBtn');
    const uploadFormSection = document.getElementById('uploadFormSection');
    const qrCodeScannerSection = document.getElementById('qrCodeScannerSection');
    const submitSpecialCodeBtn = document.getElementById('submitSpecialCodeBtn');
    const specialCodeInput = document.getElementById('specialCodeInput');
    const specialCodeStatus = document.getElementById('specialCodeStatus');
    // ... и другие элементы, если они вам нужны ...

    let filesToUpload = [];

    // --- Функции ---

    // ИСПРАВЛЕНО: Возвращаем функции для переключения видимости секций
    function showUploadSection() {
        uploadFormSection.classList.remove('hidden');
        qrCodeScannerSection.classList.add('hidden');
        stopScanner(); // Важно останавливать сканер при переключении
    }

    function showQrScannerSection() {
        uploadFormSection.classList.add('hidden');
        qrCodeScannerSection.classList.remove('hidden');
    }

    function validateInputs() {
        const anyFieldFilled = instagramInput.value.trim() !== '' || emailInput.value.trim() !== '' || linkedinInput.value.trim() !== '';
        const allFilesValid = filesToUpload.length > 0 && filesToUpload.every(file => file._isValid);
        selectFilesButton.disabled = !(anyFieldFilled && allFilesValid);
    }

    async function handleFileSelection(event) {
        filesToUpload = Array.from(event.target.files);
        clearPreviews(previewContainer);

        if (filesToUpload.length === 0) {
            validateInputs();
            return;
        }

        previewContainer.parentElement.style.display = 'block';
        displayGeneralStatus(generalStatusMessage, 'Проверка файлов...', 'info');

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
            displayGeneralStatus(generalStatusMessage, `Все ${filesToUpload.length} видео готовы.`, 'completed');
        }
        
        validateInputs();
    }
    
    function startUploadProcess() {
        // ... здесь будет ваша логика поочередной загрузки файлов ...
        console.log("Starting upload process...");
    }

    // --- Обработчики событий ---

    instagramInput?.addEventListener('input', validateInputs);
    emailInput?.addEventListener('input', validateInputs);
    linkedinInput?.addEventListener('input', validateInputs);
    videoInput?.addEventListener('change', handleFileSelection);
    
    selectFilesButton?.addEventListener('click', () => {
        // Логика кнопки теперь может быть проще: если она не отключена, значит можно загружать
        startUploadProcess();
    });

    // ИСПРАВЛЕНО: Возвращаем обработчики для переключения секций
    showUploadFormBtn?.addEventListener('click', showUploadSection);
    showQrScannerBtn?.addEventListener('click', showQrScannerSection);

    // Логика для кнопки "Ввести код"
    submitSpecialCodeBtn?.addEventListener('click', () => {
        const code = specialCodeInput.value.trim();
        if (code) {
            specialCodeStatus.textContent = `Код "${code}" получен. Перенаправление...`;
            localStorage.setItem('hifeUsername', code); // Пример: сохраняем код как username
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('hifeLinkedin');
            setTimeout(() => {
                window.location.href = 'results.html';
            }, 1000);
        } else {
            specialCodeStatus.textContent = 'Пожалуйста, введите код.';
        }
    });
    
    // --- Первоначальная инициализация ---
    
    // Показываем форму загрузки по умолчанию
    showUploadSection();
    validateInputs();
});
