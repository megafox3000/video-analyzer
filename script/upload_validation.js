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
    const videoInput = document.getElementById('videoFileInput'); // Input type="file" is active again
    const selectFilesButton = document.getElementById('selectFilesButton');
    const finishUploadButton = document.getElementById('finishUploadButton');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const uploadedVideosList = document.getElementById('uploadedVideosList');

    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';
    const MAX_VIDEO_SIZE_MB = 100;
    const MAX_VIDEO_DURATION_SECONDS = 60;
    const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

    let currentUploadXhr = null;

    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let hifeEmail = localStorage.getItem('hifeEmail') || '';
    let hifeLinkedin = localStorage.getItem('hifeLinkedin') || '';

    instagramInput.value = hifeUsername;
    emailInput.value = hifeEmail;
    linkedinInput.value = hifeLinkedin;

    updateUploadedVideosList();
    checkFinishButtonStatus();

    if (currentUploadXhr) {
        currentUploadXhr.abort();
        console.log('Previous upload aborted.');
    }

    // Button is initially disabled
    selectFilesButton.disabled = true;

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

    // Event listener for 'change' on videoInput - triggers after user selects a file
    videoInput.addEventListener('change', () => {
        generalStatusMessage.textContent = '';
        const file = videoInput.files[0];

        if (file) {
            // Size validation
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                generalStatusMessage.textContent = `Видео слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                videoInput.value = ''; // Reset the selected file
                validateInputs(); // Update button state
                return;
            }

            // Use a temporary <video> element to get metadata (without displaying it)
            const tempVideoElement = document.createElement('video');
            tempVideoElement.preload = 'metadata';

            tempVideoElement.onloadedmetadata = () => {
                const videoDuration = tempVideoElement.duration;
                // Revoke URL with a small delay for stability
                setTimeout(() => {
                    URL.revokeObjectURL(tempVideoElement.src);
                }, 100);

                if (isNaN(videoDuration) || videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                    generalStatusMessage.textContent = `Видео слишком длинное. Максимум ${MAX_VIDEO_DURATION_SECONDS / 60} минут.`;
                    generalStatusMessage.style.color = 'var(--status-error-color)';
                    videoInput.value = ''; // Reset the selected file
                    validateInputs(); // Update button state
                    return;
                } else {
                    validateInputs();
                    // --- NEW: Automatic upload trigger after successful file validation ---
                    const username = instagramInput.value.trim();
                    const email = emailInput.value.trim();
                    const linkedin = linkedinInput.value.trim();

                    // Ensure user fields are filled before attempting to upload
                    if (username || email || linkedin) {
                        uploadVideo(file, username, email, linkedin);
                    } else {
                        generalStatusMessage.textContent = 'Пожалуйста, заполните Instagram ID, Email или LinkedIn, чтобы начать загрузку.';
                        generalStatusMessage.style.color = 'var(--status-error-color)';
                        selectFilesButton.disabled = true; // Disable button until fields are filled
                    }
                    // --- END OF NEW BLOCK ---
                }
            };
            tempVideoElement.onerror = () => {
                // In case of metadata loading error, also revoke the URL
                setTimeout(() => {
                    URL.revokeObjectURL(tempVideoElement.src);
                }, 100);

                generalStatusMessage.textContent = 'Не удалось загрузить метаданные видео. Возможно, файл поврежден или не является видео.';
                generalStatusMessage.style.color = 'var(--status-error-color)';
                videoInput.value = '';
                validateInputs();
            };
            tempVideoElement.src = URL.createObjectURL(file); // Load file metadata

        } else { // If user cancelled file selection or removed it
            validateInputs(); // Re-check button state
        }
    });

    // Event listener for "Upload Video(s)" button click
    // Its primary role is now to trigger the file input dialog
    selectFilesButton.addEventListener('click', async () => {
        const username = instagramInput.value.trim();
        const email = emailInput.value.trim();
        const linkedin = linkedinInput.value.trim();
        let file = videoInput.files[0]; // Get the file if already selected

        // Check if Instagram/Email/LinkedIn fields are filled
        if (!username && !email && !linkedin) {
            generalStatusMessage.textContent = 'Пожалуйста, введите Instagram ID, Email или LinkedIn.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            validateInputs(); // Re-check button state
            return;
        }

        // If no file is selected yet, programmatically click the hidden input
        if (!file) {
            generalStatusMessage.textContent = 'Выберите видеофайл...';
            generalStatusMessage.style.color = 'var(--status-info-color)';
            videoInput.click(); // This opens the system file dialog
            return; // Stop execution, wait for file selection via 'change' event
        }

        // If a file is already selected and fields are filled,
        // and it passed initial validation in the 'change' event,
        // we can proceed with upload if needed.
        // However, with automatic upload, this branch might be less frequently hit.
        // Re-validate limits just in case user changed file without triggering 'change' correctly
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
            generalStatusMessage.textContent = `Видео слишком большое. Максимум ${MAX_VIDEO_SIZE_MB} MB.`;
            generalStatusMessage.style.color = 'var(--status-error-color)';
            videoInput.value = '';
            validateInputs();
            return;
        }
        // Duration check relies on the async 'change' event handler having reset videoInput.value if invalid.

        // All checks passed, start upload (this might be redundant if auto-upload always fires)
        uploadVideo(file, username, email, linkedin);
    });

    // Upload function extracted for cleaner code
    function uploadVideo(file, username, email, linkedin) {
        selectFilesButton.disabled = true; // Disable button during upload
        generalStatusMessage.textContent = 'Загрузка...';
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
                generalStatusMessage.textContent = `Загрузка: ${file.name} (${percent.toFixed(0)}%)`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
            }
        });

        currentUploadXhr.onload = function() {
            selectFilesButton.disabled = false; // Enable button after upload completes
            videoInput.value = ''; // Clear file input field

            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                generalStatusMessage.textContent = `Видео "${file.name}" загружено. ID задачи: ${taskId}.`;
                generalStatusMessage.style.color = 'var(--status-completed-color)';

                const newVideoEntry = {
                    id: taskId,
                    original_filename: file.name,
                    status: 'pending',
                    timestamp: new Date().toISOString()
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                updateUploadedVideosList();
                checkFinishButtonStatus();
                resetProgressBar();

                setTimeout(() => {
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                    generalStatusMessage.textContent = '';
                }, 5000);

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                generalStatusMessage.textContent = `Ошибка загрузки "${file.name}": ${error.error || 'Неизвестная ошибка'}`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                resetProgressBar();
            }
            validateInputs(); // After upload/error, check button state based on fields
        };

        currentUploadXhr.onerror = function() {
            selectFilesButton.disabled = false; // Enable button after error
            generalStatusMessage.textContent = 'Ошибка сети во время загрузки видео.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            resetProgressBar();
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

    // Validation function controlling button state
    function validateInputs() {
        // Check if at least one of the three fields is filled
        const anyFieldFilled = instagramInput.value.trim() !== '' ||
                               emailInput.value.trim() !== '' ||
                               linkedinInput.value.trim() !== '';

        const fileSelected = videoInput.files.length > 0;
        let fileIsValid = true; // Assume file is valid until proven otherwise

        if (fileSelected) {
            const file = videoInput.files[0];
            // Check file size
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                fileIsValid = false;
            }
            // Duration check relies on the async 'change' event handler having reset videoInput.value if invalid.
        }

        // Button is active if:
        // 1. At least one of the fields (Instagram, Email, LinkedIn) is filled
        // AND
        // 2. Either no file is selected yet (then clicking the button will open the selection dialog),
        //    OR the selected file is valid (then clicking the button will start the upload if not automatic).
        selectFilesButton.disabled = !(anyFieldFilled && (!fileSelected || fileIsValid));

        // If the button is enabled, and there's an error message not related to the file,
        // clear it. Messages about "too large/long" file remain.
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

    // Initialize button state on page load
    validateInputs();
});
