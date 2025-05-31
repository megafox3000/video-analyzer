const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com';

const resultsHeader = document.getElementById('resultsHeader');
const usernameDisplay = document.getElementById('usernameDisplay');
const uploadNewBtn = document.getElementById('uploadNewBtn');
const bubblesContainer = document.getElementById('bubblesContainer');
const metadataModal = document.getElementById('metadataModal');
const modalTitle = document.getElementById('modalTitle');
const modalMetadata = document.getElementById('modalMetadata');
const closeButton = document.querySelector('.close-button');

// Elements for re-uploading
const videoFileInput = document.getElementById('videoFileInput');
const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
const uploadStatusText = document.getElementById('uploadStatusText');

// Check that elements exist before attempting to get their children
const progressBarContainer = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar-container') : null;
const progressBar = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-bar') : null;
const progressText = dynamicUploadStatusContainer ? dynamicUploadStatusContainer.querySelector('.progress-text') : null;

// Declare taskBubbles in global scope
const taskBubbles = {};

// Helper function to create a thumbnail URL from a Cloudinary video URL
function getCloudinaryThumbnailUrl(videoUrl) {
    if (!videoUrl || !videoUrl.includes('res.cloudinary.com')) {
        return 'assets/default_video_thumbnail.png'; // Placeholder if not a Cloudinary URL
    }

    const parts = videoUrl.split('/upload/');
    if (parts.length < 2) {
        return 'assets/default_video_thumbnail.png';
    }

    const baseUrl = parts[0];
    const transformations = 'c_fill,w_200,h_150,g_auto,q_auto:eco,f_jpg,so_auto/';

    let publicIdPath = parts[1];
    publicIdPath = publicIdPath.replace(/v\d+\//, '');
    publicIdPath = publicIdPath.substring(0, publicIdPath.lastIndexOf('.')) + '.jpg';

    return `${baseUrl}/upload/${transformations}${publicIdPath}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // Get username (Instagram) and email from localStorage
    const username = localStorage.getItem('hifeUsername');
    const email = localStorage.getItem('hifeEmail');

    // --- PERSONALIZED HEADER LOGIC ---
    let headerText = 'Your Video(s)'; // Default header

    if (username) {
        headerText = `Your Video(s) for @${username}`;
        if (usernameDisplay) usernameDisplay.textContent = `For: @${username}`; // Also update text below header
    } else if (email) {
        headerText = `Your Video(s) for ${email}`;
        if (usernameDisplay) usernameDisplay.textContent = `For: ${email}`; // Also update text below header
    } else {
        if (usernameDisplay) usernameDisplay.textContent = 'For: Guest';
    }
    if (resultsHeader) resultsHeader.textContent = headerText;
    // --- END PERSONALIZED HEADER LOGIC ---


    // --- START "Upload New Video(s)" BUTTON AND RE-UPLOAD LOGIC ---
    if (username || email) { // If any user data exists
        if (uploadNewBtn) uploadNewBtn.disabled = false;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload New Video(s)';
        if (uploadStatusText) uploadStatusText.textContent = 'Ready for new upload.'; // Initial message in dynamic status
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden'); // Show status area immediately
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    } else {
        // If no user data (no initial upload), deactivate re-upload button
        if (uploadNewBtn) uploadNewBtn.disabled = true;
        if (uploadNewBtn) uploadNewBtn.textContent = 'Upload (Login first)';
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Cannot re-upload: no user data found. Please upload videos from the upload page.';
            uploadStatusText.style.color = 'var(--status-error-color)';
        }
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden'); // Show error message
        if (progressBarContainer) progressBarContainer.style.display = 'none';
    }

    // Click handler for "Upload New Video(s)" button
    if (uploadNewBtn) {
        uploadNewBtn.addEventListener('click', () => {
            if (uploadNewBtn.disabled) {
                return; // Do nothing if button is deactivated
            }
            // Programmatically click the hidden file input
            if (videoFileInput) videoFileInput.click();
        });
    }

    // Change handler for the hidden file input
    if (videoFileInput) {
        videoFileInput.addEventListener('change', (event) => {
            const selectedFile = event.target.files[0];
            if (selectedFile) {
                // If a file is selected, start the upload process
                uploadVideoFromResults(selectedFile);
                // Reset selected file after initiating upload
                videoFileInput.value = ''; // Clear input so the same file can be uploaded again
            } else {
                // If no file is selected (user cancelled dialog)
                if (uploadStatusText) {
                    uploadStatusText.textContent = 'File selection canceled.';
                    uploadStatusText.style.color = 'var(--status-info-color)';
                }
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            }
        });
    }


    /**
     * Sends the video to the server for processing, using user data from localStorage.
     * @param {File} file - Video file to upload.
     */
    async function uploadVideoFromResults(file) {
        const currentUsername = localStorage.getItem('hifeUsername');
        const currentEmail = localStorage.getItem('hifeEmail');

        if (!currentUsername && !currentEmail) {
            alert('No user data found. Redirecting to the home page to start over.');
            window.location.replace('index.html'); // Redirect to index.html
            return; // Terminate function execution
        }

        const formData = new FormData();
        formData.append('video', file);
        if (currentUsername) {
            formData.append('instagram_username', currentUsername);
        }
        if (currentEmail) {
            formData.append('email', currentEmail);
        }

        // Show status container and reset progress
        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.remove('hidden');
        if (uploadStatusText) {
            uploadStatusText.textContent = 'Starting upload...';
            uploadStatusText.style.color = 'var(--status-info-color)';
        }
        if (progressBarContainer) progressBarContainer.style.display = 'flex';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        if (uploadNewBtn) uploadNewBtn.disabled = true; // Deactivate button during upload


        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    if (progressBar) progressBar.style.width = `${percent.toFixed(0)}%`;
                    if (progressText) progressText.textContent = `${percent.toFixed(0)}%`;
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Uploading: ${percent.toFixed(0)}%`;
                        uploadStatusText.style.color = 'var(--status-info-color)';
                    }
                }
            });

            xhr.onload = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false; // Activate button after upload completion

                if (xhr.status >= 200 && xhr.status < 300) { // Consider 2xx codes as success
                    const response = JSON.parse(xhr.responseText);
                    const taskId = response.taskId; // Use taskId as in upload_validation.js
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Video uploaded. Task ID: ${taskId}. Waiting for processing.`;
                        uploadStatusText.style.color = 'var(--status-pending-color)';
                    }
                    if (progressBarContainer) progressBarContainer.style.display = 'none'; // Hide progress bar after upload

                    // --- Save new task to localStorage ---
                    let uploadedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');
                    const newVideoEntry = {
                        id: taskId,
                        original_filename: file.name,
                        status: 'pending', // Initial status of new task
                        timestamp: new Date().toISOString()
                        // metadata and cloudinary_url will be added later upon status update
                    };
                    uploadedVideosData.push(newVideoEntry);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideosData));

                    // Create a new bubble for the just uploaded task
                    createOrUpdateBubble(taskId, newVideoEntry);

                    // Immediately start polling statuses for all tasks, so the new one also starts updating
                    checkTaskStatuses(uploadedVideosData);

                    // Optionally: hide status container after a few seconds
                    setTimeout(() => {
                        if (dynamicUploadStatusContainer) dynamicUploadStatusContainer.classList.add('hidden');
                        if (uploadStatusText) uploadStatusText.textContent = 'Ready for new upload.'; // Reset text for next upload
                    }, 5000);

                } else {
                    const error = JSON.parse(xhr.responseText);
                    if (uploadStatusText) {
                        uploadStatusText.textContent = `Upload error: ${error.error || 'Unknown error'}`;
                        uploadStatusText.style.color = 'var(--status-error-color)';
                    }
                    if (progressBarContainer) progressBarContainer.style.display = 'none';
                    // Keep error message visible
                }
            };

            xhr.onerror = function() {
                if (uploadNewBtn) uploadNewBtn.disabled = false; // Activate button after error
                if (uploadStatusText) {
                    uploadStatusText.textContent = 'Network error during upload.';
                    uploadStatusText.style.color = 'var(--status-error-color)';
                }
                if (progressBarContainer) progressBarContainer.style.display = 'none';
            };

            xhr.send(formData);

        } catch (error) {
            if (uploadNewBtn) uploadNewBtn.disabled = false; // Activate button after error
            console.error('Error sending upload request:', error);
            if (uploadStatusText) {
                uploadStatusText.textContent = `An error occurred: ${error.message}`;
                uploadStatusText.style.color = 'var(--status-error-color)';
            }
            if (progressBarContainer) progressBarContainer.style.display = 'none';
        }
    }
    // --- END "Upload New Video(s)" BUTTON AND RE-UPLOAD LOGIC ---

    // --- EXISTING LOGIC FOR LOADING DATA FROM localStorage AND POLLING STATUSES ---
    const storedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

    if (storedVideosData.length === 0) {
        const existingStatusMessage = document.getElementById('statusMessage');
        // Added condition to avoid overwriting if the message already exists
        if (!existingStatusMessage || (existingStatusMessage.textContent.includes('No tasks found') && existingStatusMessage.id === 'statusMessage')) {
            if (bubblesContainer) bubblesContainer.innerHTML = '<p id="statusMessage" class="status-message info">No tasks found. Please upload a video from the <a href="upload.html" style="color: #FFD700; text-decoration: underline;">upload page</a>.</p>';
        }
    } else {
        if (bubblesContainer) bubblesContainer.innerHTML = ''; // Clear to add actual bubbles
        storedVideosData.forEach(video => {
            createOrUpdateBubble(video.id, video);
        });

        const hasPendingTasks = storedVideosData.some(video => video.status !== 'completed' && video.status !== 'error' && video.status !== 'failed');
        let statusMessageElement = document.getElementById('statusMessage');
        if (!statusMessageElement) {
             statusMessageElement = document.createElement('p');
             statusMessageElement.id = 'statusMessage';
             if (bubblesContainer) bubblesContainer.prepend(statusMessageElement);
        }

        if (statusMessageElement) {
            if (hasPendingTasks) {
                statusMessageElement.textContent = 'Checking status of your videos...';
                statusMessageElement.className = 'status-message pending';
            } else {
                statusMessageElement.textContent = 'All tasks completed or processed.';
                statusMessageElement.className = 'status-message info';
            }
        }
    }

    const CHECK_STATUS_INTERVAL_MS = 2000;

    // Start polling statuses for all tasks stored in localStorage
    // Pass only tasks that need polling (not completed)
    checkTaskStatuses(storedVideosData.filter(v => v.status !== 'completed' && v.status !== 'error' && v.status !== 'failed'));


    async function checkTaskStatuses(currentVideosData) {
        const tasksToKeepPolling = [];
        const updatedVideosData = JSON.parse(localStorage.getItem('uploadedVideos') || '[]'); // Get actual data from localStorage

        if (currentVideosData.length === 0 && (!bubblesContainer || bubblesContainer.children.length <= 1)) {
            // If there are no tasks to poll and no other elements on the page besides the "No tasks found" message
            const statusMessageElement = document.getElementById('statusMessage');
            if (statusMessageElement) {
                statusMessageElement.textContent = 'All tasks completed or processed.';
                statusMessageElement.className = 'status-message info';
            }
            return;
        }

        for (const video of currentVideosData) {
            const taskId = video.id;
            // Find the current video object in updatedVideosData for update
            let currentVideoInLocalStorage = updatedVideosData.find(v => v.id === taskId);
            
            // If the task is already completed or in error, skip polling
            if (currentVideoInLocalStorage && (currentVideoInLocalStorage.status === 'completed' || currentVideoInLocalStorage.status === 'error' || currentVideoInLocalStorage.status === 'failed')) {
                createOrUpdateBubble(taskId, currentVideoInLocalStorage); // Update bubble just in case
                continue;
            }

            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/task-status/${taskId}`);
                const data = await response.json();

                if (response.ok) {
                    // Update data in localStorage
                    if (currentVideoInLocalStorage) {
                        currentVideoInLocalStorage.status = data.status;
                        currentVideoInLocalStorage.message = data.message;
                        currentVideoInLocalStorage.metadata = data.metadata;
                        currentVideoInLocalStorage.cloudinary_url = data.cloudinary_url;
                    } else {
                        // If for some reason the task is not found in localStorage, add it
                        // (e.g., if it was just uploaded from this page)
                        currentVideoInLocalStorage = {
                            id: taskId,
                            original_filename: data.original_filename || `Task ${taskId}`, // If backend returns original_filename
                            status: data.status,
                            message: data.message,
                            metadata: data.metadata,
                            cloudinary_url: data.cloudinary_url,
                            timestamp: new Date().toISOString() // Add timestamp for new entry
                        };
                        updatedVideosData.push(currentVideoInLocalStorage);
                    }
                    createOrUpdateBubble(taskId, currentVideoInLocalStorage); // Update bubble
                    
                    if (currentVideoInLocalStorage.status !== 'completed' && currentVideoInLocalStorage.status !== 'error' && currentVideoInLocalStorage.status !== 'failed') {
                        tasksToKeepPolling.push(currentVideoInLocalStorage.id);
                    }
                } else {
                    console.error(`[FRONTEND] Error getting status for task ${taskId}:`, data.message || response.statusText);
                    if (currentVideoInLocalStorage) {
                        currentVideoInLocalStorage.status = 'error';
                        currentVideoInLocalStorage.message = data.message || 'Failed to fetch status.';
                    } else {
                        // If task not found, but got an error, add as an error
                        currentVideoInLocalStorage = {
                            id: taskId,
                            original_filename: `Task ${taskId}`,
                            status: 'error',
                            message: data.message || 'Failed to fetch status.',
                            timestamp: new Date().toISOString()
                        };
                        updatedVideosData.push(currentVideoInLocalStorage);
                    }
                    createOrUpdateBubble(taskId, currentVideoInLocalStorage);
                }
            } catch (error) {
                console.error(`[FRONTEND] Network error checking status for task ${taskId}:`, error);
                if (currentVideoInLocalStorage) {
                    currentVideoInLocalStorage.status = 'error';
                    currentVideoInLocalStorage.message = 'Network error or backend unreachable.';
                } else {
                    currentVideoInLocalStorage = {
                        id: taskId,
                        original_filename: `Task ${taskId}`,
                        status: 'error',
                        message: 'Network error or backend unreachable.',
                        timestamp: new Date().toISOString()
                    };
                    updatedVideosData.push(currentVideoInLocalStorage);
                }
                createOrUpdateBubble(taskId, currentVideoInLocalStorage);
            }
        }

        // Update localStorage once after all checks
        localStorage.setItem('uploadedVideos', JSON.stringify(updatedVideosData));

        const statusMessageElement = document.getElementById('statusMessage');
        if (statusMessageElement) {
            if (tasksToKeepPolling.length > 0) {
                statusMessageElement.textContent = 'Checking status of your videos...';
                statusMessageElement.className = 'status-message pending';
            } else {
                statusMessageElement.textContent = 'All tasks completed or processed.';
                statusMessageElement.className = 'status-message info';
            }
        }

        if (tasksToKeepPolling.length > 0) {
            setTimeout(() => checkTaskStatuses(updatedVideosData.filter(v => tasksToKeepPolling.includes(v.id))), CHECK_STATUS_INTERVAL_MS);
        } else {
            console.log("[FRONTEND] All tasks completed or errored. Polling stopped.");
        }
    }


    function createOrUpdateBubble(taskId, data) {
        let bubble = taskBubbles[taskId];
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'video-bubble loading';
            bubble.id = `bubble-${taskId}`;
            if (bubblesContainer) bubblesContainer.appendChild(bubble);
            taskBubbles[taskId] = bubble;

            // Remove "No tasks found" message if it exists
            const initialMessage = document.getElementById('statusMessage');
            if (initialMessage && initialMessage.textContent.includes('No tasks found')) {
                initialMessage.remove();
            }
        }

        let filenameText = `<h3 class="bubble-title-overlay">${data.original_filename || `Task ${taskId}`}</h3>`;
        let previewHtml = '';
        let statusMessageText = '';

        if (data.status === 'completed') {
            const thumbnailUrl = getCloudinaryThumbnailUrl(data.cloudinary_url);
            previewHtml = `<img class="bubble-preview-img" src="${thumbnailUrl}" alt="Video Preview">`;
            statusMessageText = '<p class="status-message-bubble status-completed">Click to view metadata</p>';
            bubble.classList.remove('loading');
        } else if (data.status === 'pending' || data.status === 'processing') {
            previewHtml = `<img class="bubble-preview-img" src="assets/processing_placeholder.png" alt="Video Processing">`;
            statusMessageText = '<p class="status-message-bubble status-pending">Video in processing...</p>';
            bubble.classList.add('loading');
        } else if (data.status === 'error' || data.status === 'failed') {
            previewHtml = `<img class="bubble-preview-img" src="assets/error_placeholder.png" alt="Processing Error">`;
            statusMessageText = `<p class="status-message-bubble status-error">Error: ${data.message || 'Unknown error.'}</p>`;
            bubble.classList.remove('loading');
        } else {
            previewHtml = `<img class="bubble-preview-img" src="assets/placeholder.png" alt="Status Unknown">`;
            statusMessageText = '<p class="status-message-bubble status-info">Getting status...</p>';
            bubble.classList.add('loading');
        }

        bubble.innerHTML = `
            ${previewHtml}
            <div class="bubble-text-overlay">
                ${filenameText}
                ${statusMessageText}
            </div>
        `;

        if (data.status === 'completed' && data.metadata) {
            bubble.onclick = () => showMetadataModal(data.original_filename || `Task ${taskId}`, data.metadata);
            bubble.style.cursor = 'pointer';
        } else {
            bubble.onclick = null;
            bubble.style.cursor = 'default';
        }
    }

    function showMetadataModal(filename, metadata) {
        if (modalTitle) modalTitle.textContent = `Metadata for: ${filename}`;
        // Check if metadata is an object, if not, convert to string
        if (modalMetadata) modalMetadata.textContent = typeof metadata === 'object' && metadata !== null ? JSON.stringify(metadata, null, 2) : String(metadata);
        if (metadataModal) metadataModal.style.display = 'flex';
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            if (metadataModal) metadataModal.style.display = 'none';
        });
    }

    // Modal close handler for clicks outside the modal
    window.addEventListener('click', (event) => {
        if (metadataModal && event.target == metadataModal) {
            metadataModal.style.display = 'none';
        }
    });

    // Add handler for "Finish Session" button
    const finishSessionBtn = document.getElementById('finishSessionBtn');
    if (finishSessionBtn) {
        // The button should be visible only if there are uploaded videos
        if (JSON.parse(localStorage.getItem('uploadedVideos') || '[]').length > 0) {
            finishSessionBtn.style.display = 'inline-block';
        } else {
            finishSessionBtn.style.display = 'none';
        }

        finishSessionBtn.addEventListener('click', () => {
            // Remove all user data from localStorage
            localStorage.removeItem('hifeUsername');
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('uploadedVideos');
            console.log("Session finished. LocalStorage cleared.");
            // Redirect to the home page or upload page
            window.location.replace('index.html');
        });
    }
});
