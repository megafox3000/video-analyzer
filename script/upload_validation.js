// In the beginning of your script/upload_validation.js file,
// BEFORE document.addEventListener('DOMContentLoaded', ...)

const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');
const existingLinkedin = localStorage.getItem('hifeLinkedin');

// If user data AND uploaded videos exist, redirect to results.html
if ((existingUsername || existingEmail || existingLinkedin) && existingUploadedVideos && JSON.parse(existingUploadedVideos).length > 0) {
    window.location.replace('results.html');
}

document.addEventListener('DOMContentLoaded', () => {
    const instagramInput = document.getElementById('instagramInput');
    const emailInput = document.getElementById('emailInput');
    const linkedinInput = document.getElementById('linkedinInput');
    const videoInput = document.getElementById('videoFileInput');
    const selectFilesButton = document.getElementById('selectFilesButton');
    const finishUploadButton = document.getElementById('finishUploadButton');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const uploadedVideosList = document.getElementById('uploadedVideosList');

    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    // NEW: Get the container for file previews
    const selectedFilesPreviewSection = document.querySelector('.selected-files-preview-section');
    const selectedFilesPreviewContainer = document.getElementById('selectedFilesPreviewContainer');

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';
    const MAX_VIDEO_SIZE_MB = 100;
    const MAX_VIDEO_DURATION_SECONDS = 600; // Changed from 60 to 600 as per previous discussion
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

    let currentUploadXhr = null;
    let filesToUpload = []; // Array to store files waiting for upload
    let currentFileIndex = 0; // Index of the current file being uploaded
    let objectURLs = []; // NEW: Array to store object URLs for later revocation

    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let hifeEmail = localStorage.getItem('hifeEmail') || '';
    let hifeLinkedin = localStorage.getItem('hifeLinkedin') || '';

    instagramInput.value = hifeUsername;
    emailInput.value = hifeEmail;
    linkedinInput.value = hifeLinkedin;

    updateUploadedVideosList();
    checkFinishButtonStatus();
    resetProgressBar(); // Ensure progress bar is hidden on page load

    // NEW: Set initial button text
    selectFilesButton.textContent = 'Choose your Video(s)';
    selectFilesButton.disabled = true; // Initial state: button is disabled until fields are filled

    instagramInput.addEventListener('input', () => {
        const value = instagramInput.value.trim();
        localStorage.setItem('hifeUsername', value);
        hifeUsername = value;
        generalStatusMessage.textContent = '';
        validateInputs();
    });

    emailInput.addEventListener('input', () => {
        const value = emailInput.value.trim();
        localStorage.setItem('hifeEmail', value);
        hifeEmail = value;
        generalStatusMessage.textContent = '';
        validateInputs();
    });

    linkedinInput.addEventListener('input', () => {
        const value = linkedinInput.value.trim();
        localStorage.setItem('hifeLinkedin', value);
        hifeLinkedin = value;
        generalStatusMessage.textContent = '';
        validateInputs();
    });

    videoInput.addEventListener('change', () => {
        generalStatusMessage.textContent = '';
        
        // NEW: Clear previous previews and object URLs
        clearPreviews();

        filesToUpload = Array.from(videoInput.files);
        currentFileIndex = 0; // Reset index for a new upload queue

        if (filesToUpload.length === 0) {
            validateInputs();
            // NEW: If files are cancelled, revert button text to initial state
            selectFilesButton.textContent = 'Choose your Video(s)';
            // NEW: Hide preview section if no files are selected
            selectedFilesPreviewSection.style.display = 'none';
            return;
        }

        let allFilesValid = true;
        let filesToValidateMetadata = [];

        // --- NEW: CREATING PREVIEWS START ---
        selectedFilesPreviewContainer.innerHTML = ''; // Clear container
        selectedFilesPreviewSection.style.display = 'block'; // Show preview section

        filesToUpload.forEach(file => {
            const previewBubble = document.createElement('div');
            previewBubble.className = 'preview-bubble';

            // Use <video> for preview, as it's a video file
            const videoElement = document.createElement('video');
            const objectURL = URL.createObjectURL(file);
            objectURLs.push(objectURL); // Store URL for later revocation

            videoElement.src = objectURL;
            videoElement.autoplay = true; // Autoplay
            videoElement.loop = true;     // Loop
            videoElement.muted = true;    // Mute sound
            videoElement.playsinline = true; // For iOS, to play inline
            videoElement.preload = 'metadata'; // Load only metadata first

            // Add overlay with file name
            const fileNameOverlay = document.createElement('div');
            fileNameOverlay.className = 'file-name-overlay';
            fileNameOverlay.textContent = file.name;

            previewBubble.appendChild(videoElement);
            previewBubble.appendChild(fileNameOverlay);
            selectedFilesPreviewContainer.appendChild(previewBubble);
        });
        // --- NEW: CREATING PREVIEWS END ---

        for (const file of filesToUpload) {
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                generalStatusMessage.textContent = `Видео "${file.name}" слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                videoInput.value = ''; // Reset all selected files if at least one is invalid
                allFilesValid = false;
                break;
            }
            filesToValidateMetadata.push(file);
        }

        if (!allFilesValid) {
            validateInputs();
            // NEW: If there are invalid files, revert button text to initial state
            selectFilesButton.textContent = 'Choose your Video(s)';
            filesToUpload = []; // Clear queue as there are invalid files
            // NEW: Clear previews and hide section if files failed validation
            clearPreviews();
            selectedFilesPreviewSection.style.display = 'none';
            return;
        }

        let validationsCompleted = 0;
        const totalFilesForValidation = filesToValidateMetadata.length;

        if (totalFilesForValidation === 0) {
             validateInputs();
             // NEW: If no files for validation, revert button text to initial state
             selectFilesButton.textContent = 'Choose your Video(s)';
             clearPreviews();
             selectedFilesPreviewSection.style.display = 'none';
             return;
        }

        generalStatusMessage.textContent = 'Проверка выбранных видео...';
        generalStatusMessage.style.color = 'var(--status-info-color)';


        filesToValidateMetadata.forEach((file) => {
            const tempVideoElement = document.createElement('video');
            tempVideoElement.preload = 'metadata';
            tempVideoElement.src = URL.createObjectURL(file); // Use URL for metadata

            tempVideoElement.onloadedmetadata = () => {
                const videoDuration = tempVideoElement.duration;
                // No need to revoke URL here, as it might be needed for preview.
                // Revocation will happen in clearPreviews().
                
                if (isNaN(videoDuration) || videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                    generalStatusMessage.textContent = `Видео "${file.name}" слишком длинное. Максимум ${MAX_VIDEO_DURATION_SECONDS / 60} минут.`;
                    generalStatusMessage.style.color = 'var(--status-error-color)';
                    videoInput.value = '';
                    allFilesValid = false;
                }

                validationsCompleted++;
                if (validationsCompleted === totalFilesForValidation) {
                    if (allFilesValid) {
                        generalStatusMessage.textContent = `Все ${filesToUpload.length} видео готовы к загрузке. Нажмите "Transfer your Video(s)".`;
                        generalStatusMessage.style.color = 'var(--status-completed-color)';
                        // NEW: Change button text after successful validation
                        selectFilesButton.textContent = 'Transfer your Video(s)';
                        validateInputs();
                    } else {
                        generalStatusMessage.textContent = `Некоторые видео не прошли валидацию. Пожалуйста, выберите другие файлы.`;
                        generalStatusMessage.style.color = 'var(--status-error-color)';
                        filesToUpload = [];
                        videoInput.value = ''; // Reset if invalid
                        // NEW: If validation failed, revert button text to initial state
                        selectFilesButton.textContent = 'Choose your Video(s)';
                        // NEW: Clear previews if validation failed
                        clearPreviews();
                        selectedFilesPreviewSection.style.display = 'none';
                        validateInputs();
                    }
                }
            };
            tempVideoElement.onerror = () => {
                // No need to revoke URL here
                
                generalStatusMessage.textContent = `Не удалось загрузить метаданные видео "${file.name}". Возможно, файл поврежден или не является видео.`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                videoInput.value = '';
                allFilesValid = false;
                validationsCompleted++;
                if (validationsCompleted === totalFilesForValidation) {
                    filesToUpload = [];
                    // NEW: If metadata error, revert button text to initial state
                    selectFilesButton.textContent = 'Choose your Video(s)';
                    // NEW: Clear previews if metadata error
                    clearPreviews();
                    selectedFilesPreviewSection.style.display = 'none';
                    validateInputs();
                }
            };
        });
    });

    // Function to upload the next file in the queue
    function uploadNextFile() {
        if (currentFileIndex < filesToUpload.length) {
            const file = filesToUpload[currentFileIndex];
            const username = instagramInput.value.trim();
            const email = emailInput.value.trim();
            const linkedin = linkedinInput.value.trim();

            uploadVideo(file, username, email, linkedin);
        } else {
            // All files uploaded. Now redirect to results.html
            generalStatusMessage.textContent = 'Все видео успешно загружены!';
            generalStatusMessage.style.color = 'var(--status-completed-color)';
            selectFilesButton.disabled = false;
            // NEW: Revert button text to initial state after all uploads
            selectFilesButton.textContent = 'Choose your Video(s)';
            videoInput.value = '';
            resetProgressBar();
            // NEW: Clear previews before redirecting
            clearPreviews();
            selectedFilesPreviewSection.style.display = 'none';
            window.location.replace('results.html');
        }
    }

    selectFilesButton.addEventListener('click', async () => {
        const username = instagramInput.value.trim();
        const email = emailInput.value.trim();
        const linkedin = linkedinInput.value.trim();

        if (!username && !email && !linkedin) {
            generalStatusMessage.textContent = 'Пожалуйста, введите Instagram ID, Email или LinkedIn.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            validateInputs();
            return;
        }

        // If no files in queue (or if input is empty), open file selection dialog
        if (filesToUpload.length === 0 || videoInput.files.length === 0) {
            generalStatusMessage.textContent = 'Выберите видеофайл(ы)...';
            generalStatusMessage.style.color = 'var(--status-info-color)';
            videoInput.click();
            return;
        }

        // If files are already selected and validated (and button already says "Transfer your Video(s)"),
        // then start the upload
        selectFilesButton.disabled = true; // Disable button while upload is in progress
        uploadNextFile();
    });

    function uploadVideo(file, username, email, linkedin) {
        generalStatusMessage.textContent = `Загрузка видео ${currentFileIndex + 1} из ${filesToUpload.length}: ${file.name}...`;
        generalStatusMessage.style.color = 'var(--status-info-color)';

        if (progressBarContainer) progressBarContainer.style.display = 'flex';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';

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

        currentUploadXhr = new XMLHttpRequest();
        currentUploadXhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

        currentUploadXhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                if (progressBar) progressBar.style.width = `${percent.toFixed(0)}%`;
                if (progressText) progressText.textContent = `${percent.toFixed(0)}%`;
                generalStatusMessage.textContent = `Загрузка видео ${currentFileIndex + 1} из ${filesToUpload.length}: ${file.name} (${percent.toFixed(0)}%)`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
            }
        });

        currentUploadXhr.onload = function() {
            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                const newVideoEntry = {
                    id: taskId,
                    original_filename: file.name,
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                    cloudinary_url: response.cloudinary_url // Save Cloudinary URL
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                currentFileIndex++;
                uploadNextFile();

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                generalStatusMessage.textContent = `Ошибка загрузки видео ${currentFileIndex + 1} из ${filesToUpload.length} ("${file.name}"): ${error.error || 'Неизвестная ошибка'}`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                resetProgressBar();
                selectFilesButton.disabled = false;
                // NEW: Revert button text to initial state on upload error
                selectFilesButton.textContent = 'Choose your Video(s)';
                filesToUpload = []; // Clear queue on error to allow user to restart
                currentFileIndex = 0;
                videoInput.value = '';
                // NEW: Clear previews on upload error
                clearPreviews();
                selectedFilesPreviewSection.style.display = 'none';
                validateInputs();
            }
        };

        currentUploadXhr.onerror = function() {
            selectFilesButton.disabled = false;
            // NEW: Revert button text to initial state on network error
            selectFilesButton.textContent = 'Choose your Video(s)';
            generalStatusMessage.textContent = `Ошибка сети во время загрузки видео ${currentFileIndex + 1} из ${filesToUpload.length} ("${file.name}").`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
            resetProgressBar();
            filesToUpload = []; // Clear queue on error
            currentFileIndex = 0;
            videoInput.value = '';
            // NEW: Clear previews on network error
            clearPreviews();
            selectedFilesPreviewSection.style.display = 'none';
            validateInputs();
        };

        currentUploadXhr.send(formData);
    }

    finishUploadButton.addEventListener('click', () => {
        if (localStorage.getItem('uploadedVideos') && JSON.parse(localStorage.getItem('uploadedVideos')).length > 0) {
            window.location.replace('results.html');
        } else {
            generalStatusMessage.textContent = "Видео не загружено для отображения результатов.";
            generalStatusMessage.style.color = 'var(--status-pending-color)';
        }
    });

    function validateInputs() {
        const anyFieldFilled = instagramInput.value.trim() !== '' ||
                               emailInput.value.trim() !== '' ||
                               linkedinInput.value.trim() !== '';

        const filesSelected = videoInput.files.length > 0;
        let allSelectedFilesAreValid = true;

        if (filesSelected) {
            for (const file of Array.from(videoInput.files)) {
                if (file.size > MAX_VIDEO_SIZE_BYTES) {
                    allSelectedFilesAreValid = false;
                    break;
                }
            }
        }

        selectFilesButton.disabled = !(anyFieldFilled && (!filesSelected || allSelectedFilesAreValid));

        if (anyFieldFilled && filesSelected && allSelectedFilesAreValid && currentFileIndex === 0) {
            selectFilesButton.textContent = 'Transfer your Video(s)';
        } else if (!filesSelected && anyFieldFilled) {
            selectFilesButton.textContent = 'Choose your Video(s)';
        } else if (!anyFieldFilled) {
             selectFilesButton.textContent = 'Choose your Video(s)';
        }


        if (!selectFilesButton.disabled && generalStatusMessage.style.color === 'var(--status-error-color)' &&
            !generalStatusMessage.textContent.includes('слишком')) {
            generalStatusMessage.textContent = '';
        }
    }

    function updateUploadedVideosList() {
        uploadedVideosList.innerHTML = '';
        if (uploadedVideos.length === 0) {
            uploadedVideosList.innerHTML = '<p>Пока нет загруженных видео.</p>';
        } else {
            uploadedVideos.forEach(video => {
                const li = document.createElement('li');
                li.textContent = `${video.original_filename} (ID: ${video.id}) - Статус: ${video.status}`;
                uploadedVideosList.appendChild(li);
            });
        }
    }

    function checkFinishButtonStatus() {
        if (uploadedVideos.length === 0) {
            finishUploadButton.style.display = 'none';
        } else {
            finishUploadButton.style.display = 'block';
        }
    }

    function resetProgressBar() {
        if (progressBarContainer) progressBarContainer.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
    }

    // NEW: Function to clear previews and revoke Object URLs
    function clearPreviews() {
        selectedFilesPreviewContainer.innerHTML = '';
        objectURLs.forEach(url => URL.revokeObjectURL(url)); // Revoke URLs to free memory
        objectURLs = []; // Reset the array
    }

    validateInputs(); // Call on page load to set initial state
});
