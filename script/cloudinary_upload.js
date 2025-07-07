// script/cloudinary_upload.js

// УКАЖИТЕ ЗДЕСЬ АКТУАЛЬНЫЙ URL ВАШЕГО БЭКЕНДА НА RENDER.COM
const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL

/**
 * Загружает файл видео на бэкенд (который, в свою очередь, загружает его в Cloudinary).
 * Эта функция является переносимой и может использоваться как на странице загрузки, так и на странице результатов.
 *
 * @param {File} file - Объект файла для загрузки.
 * @param {string} username - Имя пользователя Instagram.
 * @param {string} email - Email пользователя.
 * @param {string} linkedin - Профиль LinkedIn пользователя.
 * @param {object} uiCallbacks - Объект с функциями обратного вызова и DOM-элементами для обновления UI.
 * @param {Function} onUploadSuccess - Функция, вызываемая при успешной загрузке. Принимает (response, file).
 * @param {Function} onUploadError - Функция, вызываемая при ошибке загрузки. Принимает (error, file).
 */
export async function uploadFileToCloudinary(
    file,
    username,
    email,
    linkedin,
    uiCallbacks,
    onUploadSuccess,
    onUploadError
) {
    const {
        updateFileBubbleUI,
        displayGeneralStatus,
        updateUploadStatusDisplay,
        resetProgressBar,
        selectFilesButton,
        uploadNewBtn,
        progressBar,
        progressText,
        progressBarContainer
    } = uiCallbacks;

    // Обновляем UI для текущего файла, показывая "Uploading..."
    if (updateFileBubbleUI) {
        updateFileBubbleUI(file, 'Uploading...', 'info');
    }
    if (displayGeneralStatus) {
        displayGeneralStatus(`Uploading video ${file.name}...`, 'info');
    }
    if (updateUploadStatusDisplay) {
        updateUploadStatusDisplay(`Uploading: 0%`, 'info');
    }

    if (progressBarContainer) progressBarContainer.style.display = 'flex';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';

    if (selectFilesButton) selectFilesButton.disabled = true;
    if (uploadNewBtn) uploadNewBtn.disabled = true;

    const formData = new FormData();
    formData.append('video', file);
    if (username) {
        formData.append('instagram_username', username);
    }
    if (email) {
        formData.append('email', email);
    }
    if (linkedin) {
        formData.append('linkedin_profile', linkedin);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

    xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            if (progressBar) progressBar.style.width = `${percent.toFixed(0)}%`;
            if (progressText) progressText.textContent = `${percent.toFixed(0)}%`;
            if (displayGeneralStatus) {
                displayGeneralStatus(`Uploading video ${file.name} (${percent.toFixed(0)}%)`, 'info');
            }
            if (updateUploadStatusDisplay) {
                updateUploadStatusDisplay(`Uploading: ${percent.toFixed(0)}%`, 'info');
            }
        }
    });

    xhr.onload = function() {
        if (selectFilesButton) selectFilesButton.disabled = false;
        if (uploadNewBtn) uploadNewBtn.disabled = false;

        if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            onUploadSuccess(response, file);
        } else {
            // --- НАЧАЛО ИСПРАВЛЕНИЯ ---
            let errorPayload;
            try {
                // Пытаемся обработать ответ как JSON
                errorPayload = JSON.parse(xhr.responseText);
            } catch (e) {
                // Если не получилось, используем текстовый ответ как сообщение об ошибке
                errorPayload = { error: 'Server returned a non-JSON response.', details: xhr.responseText };
            }
            onUploadError(errorPayload, file);
            // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
        }
        if (resetProgressBar) resetProgressBar(); // Сбрасываем прогресс-бар после загрузки/ошибки
    };

    xhr.onerror = function() {
        if (selectFilesButton) selectFilesButton.disabled = false;
        if (uploadNewBtn) uploadNewBtn.disabled = false;
        onUploadError({ error: 'Network error during upload.' }, file);
        if (resetProgressBar) resetProgressBar();
    };

    xhr.send(formData);
}
