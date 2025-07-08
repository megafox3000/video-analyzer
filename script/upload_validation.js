// upload_validation.js
"""
This script orchestrates the entire process on the upload page (index.html).
It handles user input, file validation, UI feedback, and the upload queue.
It acts as the "conductor", using functions from other service modules.
"""

import { uploadFileToCloudinary } from './cloudinary_upload.js';
import { startScanner, stopScanner } from './qr_scanner.js';
import { validateFile, MAX_VIDEO_SIZE_MB } from './file_validator.js';
import { displayGeneralStatus, createPreviewBubble, updateBubbleStatus, clearPreviews, resetProgressBar, updateProgressBar } from './ui_upload_feedback.js';

// --- Initial Redirect Logic ---
// If the user already has a session, redirect them to the results page immediately.
const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername') || localStorage.getItem('hifeEmail') || localStorage.getItem('hifeLinkedin');

if (existingUsername && existingUploadedVideos) {
    try {
        if (JSON.parse(existingUploadedVideos).length > 0) {
            console.log("DEBUG: Existing session found, redirecting to results.html.");
            // Using replace to avoid adding to browser history
            window.location.replace('results.html');
        }
    } catch (e) {
        console.error("Error parsing localStorage 'uploadedVideos', clearing invalid data.", e);
        localStorage.removeItem('uploadedVideos');
    }
}

// --- Inactivity Timer Logic ---
let inactivityTimeout;
const INACTIVITY_THRESHOLD = 90 * 1000; // 90 секунд

function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(handleInactivity, INACTIVITY_THRESHOLD);
}

function handleInactivity() {
    console.log("[Inactivity Timer] User inactive. Clearing session and redirecting.");
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('index.html');
}

// Attach inactivity listeners to the document
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('click', resetInactivityTimer);
document.addEventListener('scroll', resetInactivityTimer);


document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Cache ---
    const dom = {
        instagramInput: document.getElementById('instagramInput'),
        emailInput: document.getElementById('emailInput'),
        linkedinInput: document.getElementById('linkedinInput'),
        videoInput: document.getElementById('videoFileInput'),
        selectFilesButton: document.getElementById('selectFilesButton'),
        finishUploadButton: document.getElementById('finishUploadButton'),
        generalStatusMessage: document.getElementById('generalStatusMessage'),
        previewContainer: document.getElementById('selectedFilesPreviewContainer'),
        previewSection: document.querySelector('.selected-files-preview-section'),
        showUploadFormBtn: document.getElementById('showUploadFormBtn'),
        showQrScannerBtn: document.getElementById('showQrScannerBtn'),
        uploadFormSection: document.getElementById('uploadFormSection'),
        qrCodeScannerSection: document.getElementById('qrCodeScannerSection'),
        qrStartScanButton: document.getElementById('startScanButton'),
        qrStopScanButton: document.getElementById('stopScanButton'),
        submitSpecialCodeBtn: document.getElementById('submitSpecialCodeBtn'),
        specialCodeInput: document.getElementById('specialCodeInput'),
        specialCodeStatus: document.getElementById('specialCodeStatus'),
    };

    // --- State Management ---
    let filesToUpload = [];
    let currentFileIndex = 0;
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

    // --- Core UI and Logic Functions ---

    /**
     * Validates user inputs and file selections to enable/disable the main action button.
     * This function is now restored to its original, correct logic.
     */
    function validateInputs() {
        const anyIdentifierFilled = dom.instagramInput.value.trim() !== '' ||
                                    dom.emailInput.value.trim() !== '' ||
                                    dom.linkedinInput.value.trim() !== '';

        const filesSelected = filesToUpload.length > 0;
        const allFilesValid = filesSelected ? filesToUpload.every(file => file._isValid) : false;

        // CORRECTED LOGIC: The button is enabled if an identifier is filled.
        // The logic to check for valid files will be in the click handler.
        dom.selectFilesButton.disabled = !anyIdentifierFilled;

        // Change button text based on state
        if (anyIdentifierFilled && filesSelected && allFilesValid) {
            dom.selectFilesButton.textContent = `Transfer ${filesToUpload.length} Video(s)`;
        } else {
            dom.selectFilesButton.textContent = 'Choose your Video(s)';
        }
        
        checkFinishButtonStatus();
    }
    
    /**
     * Handles the file selection event, validates files, and updates the UI.
     */
    async function handleFileSelection(event) {
        filesToUpload = Array.from(event.target.files);
        clearPreviews(dom.previewContainer, dom.previewSection);

        if (filesToUpload.length === 0) {
            validateInputs();
            return;
        }

        dom.previewSection.style.display = 'block';
        displayGeneralStatus(dom.generalStatusMessage, 'Проверка файлов...', 'info');

        for (const file of filesToUpload) {
            createPreviewBubble(file, dom.previewContainer);
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
            displayGeneralStatus(dom.generalStatusMessage, `${invalidCount} файл(ов) не прошли валидацию.`, 'error');
        } else {
            displayGeneralStatus(dom.generalStatusMessage, `Все ${filesToUpload.length} видео готовы. Нажмите "Transfer".`, 'completed');
        }
        
        validateInputs();
    }

    /**
     * Uploads files from the queue one by one.
     */
    function uploadNextFile() {
        const validFiles = filesToUpload.filter(f => f._isValid);
        
        if (currentFileIndex >= validFiles.length) {
            displayGeneralStatus(dom.generalStatusMessage, 'Все видео успешно загружены! Перенаправление...', 'completed');
            setTimeout(() => window.location.replace('results.html'), 1500);
            return;
        }

        const file = validFiles[currentFileIndex];
        
        const onUploadSuccess = (response) => {
            updateBubbleStatus(file, 'Успешно загружено!', 'success');
            uploadedVideos.push({
                id: response.taskId,
                original_filename: response.originalFilename,
                status: 'completed', // Assume completed after upload
                metadata: response.metadata,
                cloudinary_url: response.cloudinary_url
            });
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
            currentFileIndex++;
            uploadNextFile(); // Start next upload
        };

        const onUploadError = (error) => {
            updateBubbleStatus(file, `Ошибка: ${error.message || 'Сбой сети'}`, 'error');
            displayGeneralStatus(dom.generalStatusMessage, `Ошибка загрузки файла ${file.name}. Процесс остановлен.`, 'error');
            dom.selectFilesButton.disabled = false; // Re-enable button on failure
        };

        const uiCallbacks = {
            updateFileBubbleUI: updateBubbleStatus,
            displayGeneralStatus: (msg, type) => displayGeneralStatus(dom.generalStatusMessage, msg, type),
            updateUploadStatusDisplay: (msg, type) => displayGeneralStatus(dom.generalStatusMessage, msg, type),
            resetProgressBar: resetProgressBar,
            updateProgressBar: updateProgressBar,
            selectFilesButton: dom.selectFilesButton
        };

        uploadFileToCloudinary(
            file,
            dom.instagramInput.value,
            dom.emailInput.value,
            dom.linkedinInput.value,
            uiCallbacks,
            onUploadSuccess,
            onUploadError
        );
    }

    function checkFinishButtonStatus() {
        dom.finishUploadButton.style.display = uploadedVideos.length > 0 ? 'block' : 'none';
    }

    // --- Event Handlers ---
    function handleIdentifierInput() {
        localStorage.setItem('hifeUsername', dom.instagramInput.value.trim());
        localStorage.setItem('hifeEmail', dom.emailInput.value.trim());
        localStorage.setItem('hifeLinkedin', dom.linkedinInput.value.trim());
        validateInputs();
    }
    
    function handleSelectClick() {
        const anyIdentifierFilled = dom.instagramInput.value.trim() !== '' || dom.emailInput.value.trim() !== '' || dom.linkedinInput.value.trim() !== '';
        if (!anyIdentifierFilled) {
            displayGeneralStatus(dom.generalStatusMessage, 'Пожалуйста, введите хотя бы один идентификатор.', 'error');
            return;
        }

        // If no files are selected, open the file dialog.
        if (filesToUpload.length === 0) {
            dom.videoInput.click();
            return;
        }
        
        // If files are selected, check if they are all valid before uploading.
        const allFilesValid = filesToUpload.every(file => file._isValid);
        if (!allFilesValid) {
            displayGeneralStatus(dom.generalStatusMessage, 'Некоторые файлы невалидны. Пожалуйста, исправьте или выберите другие.', 'error');
            return;
        }

        // If everything is ok, start the upload process.
        dom.selectFilesButton.disabled = true;
        currentFileIndex = 0;
        uploadNextFile();
    }

    function showUploadSection() {
        dom.uploadFormSection.classList.remove('hidden');
        dom.qrCodeScannerSection.classList.add('hidden');
        stopScanner();
    }

    function showQrScannerSection() {
        dom.uploadFormSection.classList.add('hidden');
        dom.qrCodeScannerSection.classList.remove('hidden');
    }

    function handleSpecialCodeSubmit() {
        const code = dom.specialCodeInput.value.trim();
        if (code) {
            dom.specialCodeStatus.textContent = `Код "${code}" получен. Перенаправление...`;
            localStorage.setItem('hifeUsername', code);
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('hifeLinkedin');
            setTimeout(() => window.location.replace('results.html'), 1000);
        } else {
            dom.specialCodeStatus.textContent = 'Пожалуйста, введите код.';
        }
    }

    // --- Setup ---
    dom.instagramInput?.addEventListener('input', handleIdentifierInput);
    dom.emailInput?.addEventListener('input', handleIdentifierInput);
    dom.linkedinInput?.addEventListener('input', handleIdentifierInput);
    dom.videoInput?.addEventListener('change', handleFileSelection);
    dom.selectFilesButton?.addEventListener('click', handleSelectClick);
    dom.finishUploadButton?.addEventListener('click', () => window.location.replace('results.html'));
    
    // QR and Special Code listeners
    dom.showUploadFormBtn?.addEventListener('click', showUploadSection);
    dom.showQrScannerBtn?.addEventListener('click', showQrScannerSection);
    dom.qrStartScanButton?.addEventListener('click', startScanner);
    dom.qrStopScanButton?.addEventListener('click', stopScanner);
    dom.submitSpecialCodeBtn?.addEventListener('click', handleSpecialCodeSubmit);

    // Initial state setup
    dom.instagramInput.value = localStorage.getItem('hifeUsername') || '';
    dom.emailInput.value = localStorage.getItem('hifeEmail') || '';
    dom.linkedinInput.value = localStorage.getItem('hifeLinkedin') || '';
    showUploadSection(); // Show the main form by default
    validateInputs();
    checkFinishButtonStatus();
    resetInactivityTimer(); // Start the timer on load
});
