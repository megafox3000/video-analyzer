// In the very beginning of your script/upload_validation.js file,
// BEFORE document.addEventListener('DOMContentLoaded', ...)

// Check if there are already uploaded videos and a username (i.e., the user has already completed the initial upload)
// Get existing user data for redirection logic
// (These variables are ONLY used for the following check for results.html)
const existingUploadedVideos = localStorage.getItem('uploadedVideos');
const existingUsername = localStorage.getItem('hifeUsername');
const existingEmail = localStorage.getItem('hifeEmail');

// A new user will land on upload.html and can enter their data.

// If user data AND uploaded videos exist, redirect to results.html
// This check should come after checking for a full reset/missing data.
if ((existingUsername || existingEmail) && existingUploadedVideos && JSON.parse(existingUploadedVideos).length > 0) {
    window.location.replace('results.html');
}

document.addEventListener('DOMContentLoaded', () => {
    const instagramInput = document.getElementById('instagramInput');
    const emailInput = document.getElementById('emailInput');
    const videoInput = document.getElementById('videoFileInput');
    const startUploadButton = document.getElementById('selectFilesButton');
    const finishUploadButton = document.getElementById('finishUploadButton');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const uploadedVideosList = document.getElementById('uploadedVideosList');
    
    // Get the progress bar container and its children
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    const videoPreview = document.getElementById('videoPreview');

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';

    let currentUploadXhr = null; // For cancelling the current upload

    // Load saved data from localStorage on start
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let hifeEmail = localStorage.getItem('hifeEmail') || '';

    // Set input field values if they exist in localStorage
    instagramInput.value = hifeUsername;
    emailInput.value = hifeEmail;

    // Update the list of uploaded videos on start
    updateUploadedVideosList();
    checkFinishButtonStatus();

    // Cancel previous upload if it was active
    if (currentUploadXhr) {
        currentUploadXhr.abort();
        console.log('Previous upload cancelled.');
    }

    instagramInput.addEventListener('input', () => {
        const value = instagramInput.value.trim();
        localStorage.setItem('hifeUsername', value);
        hifeUsername = value;
        validateInputs();
    });

    emailInput.addEventListener('input', () => {
        const value = emailInput.value.trim();
        localStorage.setItem('hifeEmail', value);
        hifeEmail = value;
        validateInputs();
    });

    videoInput.addEventListener('change', () => {
        validateInputs();
        if (videoInput.files.length > 0) {
            const file = videoInput.files[0];
            if (videoPreview) {
                const url = URL.createObjectURL(file);
                videoPreview.src = url;
                videoPreview.style.display = 'block';
                videoPreview.onloadedmetadata = () => {
                    URL.revokeObjectURL(url); // Clean up the URL object after metadata is loaded
                };
            }
        } else {
            if (videoPreview) {
                videoPreview.style.display = 'none';
                videoPreview.src = '';
            }
        }
    });

    startUploadButton.addEventListener('click', async () => {
        const file = videoInput.files[0];
        const username = instagramInput.value.trim();
        const email = emailInput.value.trim();

        if (!file) {
            generalStatusMessage.textContent = 'Please select a video file.';
            generalStatusMessage.style.color = 'var(--status-error-color)'; // Using CSS variable for consistency
            return;
        }

        if (!username && !email) {
            generalStatusMessage.textContent = 'Please enter an Instagram ID or Email.';
            generalStatusMessage.style.color = 'var(--status-error-color)'; // Using CSS variable for consistency
            return;
        }

        // Deactivate upload button
        startUploadButton.disabled = true;
        generalStatusMessage.textContent = 'Uploading...';
        generalStatusMessage.style.color = 'var(--status-info-color)';
        
        // Show progress bar if elements exist
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

        currentUploadXhr = new XMLHttpRequest();
        currentUploadXhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

        currentUploadXhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                if (progressBar) progressBar.style.width = `${percent.toFixed(0)}%`;
                if (progressText) progressText.textContent = `${percent.toFixed(0)}%`;
                generalStatusMessage.textContent = `Uploading: ${file.name} (${percent.toFixed(0)}%)`;
                generalStatusMessage.style.color = 'var(--status-info-color)';
            }
        });

        currentUploadXhr.onload = function() {
            startUploadButton.disabled = false; // Activate button after completion
            videoInput.value = ''; // Clear file input
            if (videoPreview) {
                videoPreview.style.display = 'none';
                videoPreview.src = '';
            }

            if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
                const response = JSON.parse(currentUploadXhr.responseText);
                const taskId = response.taskId;

                generalStatusMessage.textContent = `Video "${file.name}" uploaded. Task ID: ${taskId}.`;
                generalStatusMessage.style.color = 'var(--status-completed-color)';

                // Save information about the uploaded video
                const newVideoEntry = {
                    id: taskId,
                    original_filename: file.name, // Save file name
                    status: 'pending', // Initial status
                    timestamp: new Date().toISOString()
                    // metadata and cloudinary_url will be added later upon status update
                };
                uploadedVideos.push(newVideoEntry);
                localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

                updateUploadedVideosList();
                checkFinishButtonStatus();
                resetProgressBar(); // Reset progress bar

                // Optionally: hide status container after a few seconds
                setTimeout(() => {
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                    generalStatusMessage.textContent = '';
                }, 5000);

            } else {
                const error = JSON.parse(currentUploadXhr.responseText);
                generalStatusMessage.textContent = `Upload error "${file.name}": ${error.error || 'Unknown error'}`;
                generalStatusMessage.style.color = 'var(--status-error-color)';
                resetProgressBar(); // Reset progress bar
                // Keep error message visible
            }
        };

        currentUploadXhr.onerror = function() {
            startUploadButton.disabled = false; // Activate button after error
            generalStatusMessage.textContent = 'Network error during video upload.';
            generalStatusMessage.style.color = 'var(--status-error-color)';
            resetProgressBar(); // Reset progress bar
        };

        currentUploadXhr.send(formData);
    });

    // "Finish" button handler
    finishUploadButton.addEventListener('click', () => {
        if (localStorage.getItem('uploadedVideos') && JSON.parse(localStorage.getItem('uploadedVideos')).length > 0) { // Check if something is in localStorage
            // Redirect to results page (results.html)
            // Use replace() instead of href to prevent going back to upload.html
            window.location.replace('results.html');
        } else {
            generalStatusMessage.textContent = "No videos uploaded to display results.";
            generalStatusMessage.style.color = 'var(--status-pending-color)'; // Orange for warning
        }
    });

    function validateInputs() {
        const usernameValid = instagramInput.value.trim() !== '';
        const emailValid = emailInput.value.trim() !== '';
        const fileSelected = videoInput.files.length > 0;

        // "Start Upload" button is active if a video is selected AND (username OR email exists)
        startUploadButton.disabled = !fileSelected || (!usernameValid && !emailValid);
    }

    function updateUploadedVideosList() {
        uploadedVideosList.innerHTML = ''; // Clear current list
        if (uploadedVideos.length === 0) {
            uploadedVideosList.innerHTML = '<p>No videos uploaded yet.</p>';
        } else {
            uploadedVideos.forEach(video => {
                const li = document.createElement('li');
                li.textContent = `${video.original_filename} (ID: ${video.id}) - Status: ${video.status}`;
                uploadedVideosList.appendChild(li);
            });
        }
    }

    function checkFinishButtonStatus() {
        // "Finish" button is active if there is at least one uploaded video
        // If no videos are uploaded, hide it, otherwise show it
        if (uploadedVideos.length === 0) {
            finishUploadButton.style.display = 'none';
        } else {
            finishUploadButton.style.display = 'block'; // Or 'inline-block' depending on styles
        }
    }

    function resetProgressBar() {
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        if (progressBarContainer) progressBarContainer.style.display = 'none'; // Hide progress container
    }

    // Initialize on page load
    validateInputs();
});
