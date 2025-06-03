document.addEventListener('DOMContentLoaded', () => {
    // Specify the actual URL of your backend on Render.com here
    const backendUrl = "https://video-meta-api.onrender.com"; // REPLACE WITH YOUR ACTUAL URL

    // Get DOM elements (existing and NEW)
    const usernameDisplay = document.getElementById('usernameDisplay');
    const resultsHeader = document.getElementById('resultsHeader');
    const bubblesContainer = document.getElementById('bubblesContainer');
    const uploadNewBtn = document.getElementById('uploadNewBtn');
    const finishSessionBtn = document.getElementById('finishSessionBtn');
    const videoFileInput = document.getElementById('videoFileInput'); // For new upload from results.html
    const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const metadataModal = document.getElementById('metadataModal');
    const closeButton = document.querySelector('.modal-content .close-button');
    const modalTitle = document.getElementById('modalTitle');
    const modalMetadata = document.getElementById('modalMetadata');

    // NEW ELEMENTS FOR CONCATENATION
    const connectVideosCheckbox = document.getElementById('connectVideosCheckbox');
    const concatenationStatusDiv = document.getElementById('concatenationStatusDiv');

    // Variables for tracking state
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos')) || [];
    let pollingIntervals = {}; // For tracking status polling intervals
    const selectedVideoPublicIds = new Set(); // NEW: For tracking selected videos for concatenation

    // NEW: Function to update concatenation status in UI
    function updateConcatenationStatus() {
        const count = selectedVideoPublicIds.size;
        if (connectVideosCheckbox.checked) {
            if (count < 2) {
                concatenationStatusDiv.textContent = 'Select at least 2 videos to concatenate.';
                concatenationStatusDiv.className = 'concatenation-status info';
            } else {
                concatenationStatusDiv.textContent = `Videos selected: ${count}. Click to concatenate.`;
                concatenationStatusDiv.className = 'concatenation-status pending'; // Can change to 'info' if process not started
            }
        } else {
            selectedVideoPublicIds.clear(); // Clear selection when checkbox is unchecked
            // Remove all 'selected' classes
            document.querySelectorAll('.media-bubble.selected').forEach(bubble => {
                bubble.classList.remove('selected');
                const checkbox = bubble.querySelector('.video-selection-checkbox');
                if (checkbox) checkbox.checked = false;
            });
            concatenationStatusDiv.textContent = 'Select 2 or more videos to concatenate.';
            concatenationStatusDiv.className = 'concatenation-status info';
        }
    }

    // NEW: Function to toggle video selection
    function toggleVideoSelection(publicId, bubbleElement, checkboxElement) {
        if (!publicId) {
            console.warn('Attempted to select a video without a publicId.');
            checkboxElement.checked = false; // Uncheck if publicId is missing
            return;
        }

        if (connectVideosCheckbox.checked) {
            if (selectedVideoPublicIds.has(publicId)) {
                selectedVideoPublicIds.delete(publicId);
                bubbleElement.classList.remove('selected');
                checkboxElement.checked = false;
            } else {
                selectedVideoPublicIds.add(publicId);
                bubbleElement.classList.add('selected');
                checkboxElement.checked = true;
            }
            updateConcatenationStatus();
        } else {
            // If "Concatenate" checkbox is inactive, prevent selection
            checkboxElement.checked = false;
            bubbleElement.classList.remove('selected');
            selectedVideoPublicIds.delete(publicId); // Just in case
            updateConcatenationStatus();
        }
    }


    // Existing function: fetchAndDisplayVideos, now with added checkboxes and public_id
    async function fetchAndDisplayVideos() {
        const username = localStorage.getItem('hifeUsername') || 'Guest';
        usernameDisplay.textContent = `User: ${username}`;
        resultsHeader.textContent = `Your Videos (${username})`;
        bubblesContainer.innerHTML = ''; // Clear before displaying

        if (uploadedVideos.length === 0) {
            bubblesContainer.innerHTML = '<p class="status-message info">No videos found. Please upload videos on the previous page.</p>';
            return;
        }

        for (const videoData of uploadedVideos) {
            const taskId = videoData.taskId;
            // CRITICAL FIX: Defensive check for missing taskId
            if (!taskId) {
                console.warn('Skipping video entry due to missing taskId:', videoData);
                continue; // Skip this entry and move to the next
            }
            // END FIX

            // Corrected: Use originalFilename for consistency
            const originalFilename = videoData.originalFilename || 'video'; 
            const cloudinaryUrl = videoData.cloudinary_url; // Get URL from localStorage

            let status = videoData.status || 'pending'; // Default to 'pending' if no status
            let displayUrl = cloudinaryUrl;
            let metadata = videoData.metadata || {}; // Store metadata

            // Request actual status from backend
            if (status === 'uploaded' || status === 'pending' || status === 'processing') {
                try {
                    // Corrected: Explicitly specify backendUrl
                    const response = await fetch(`${backendUrl}/task-status/${taskId}`); 
                    const data = await response.json();
                    if (response.ok) {
                        status = data.status;
                        displayUrl = data.cloudinary_url || displayUrl; // Update URL if new one arrived
                        metadata = data.metadata || metadata; // Corrected: Update metadata
                        // Corrected: Update originalFilename if it came from the backend
                        if (data.originalFilename) {
                            videoData.originalFilename = data.originalFilename;
                        }
                    } else {
                        console.error(`Error fetching status for ${taskId}:`, data.error);
                        status = 'error';
                    }
                } catch (error) {
                    console.error(`Network error fetching status for ${taskId}:`, error);
                    status = 'error';
                }
            }

            // Update uploadedVideos in localStorage with current data
            const index = uploadedVideos.findIndex(v => v.taskId === taskId);
            if (index !== -1) {
                uploadedVideos[index] = { 
                    ...uploadedVideos[index], 
                    status, 
                    cloudinary_url: displayUrl, 
                    metadata: metadata, 
                    originalFilename: videoData.originalFilename // Corrected: Save originalFilename
                }; 
            }
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));


            const bubble = document.createElement('div');
            bubble.className = 'media-bubble';
            bubble.dataset.taskId = taskId;
            bubble.dataset.publicId = taskId; // Add public_id for concatenation

            let statusClass = '';
            let statusText = '';
            let thumbnailUrl = ''; // For video
            let videoElementHTML = ''; // For video

            if (status === 'uploaded') {
                statusClass = 'status-info';
                statusText = 'Uploaded, awaiting processing';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD"; // Cloudinary thumb
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
            } else if (status === 'processing') {
                statusClass = 'status-pending';
                statusText = 'Analyzing...';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                startPolling(taskId); // Start polling only for 'processing'
            } else if (status === 'completed') {
                statusClass = 'status-completed';
                statusText = 'Analysis complete!';
                if (displayUrl) {
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            } else if (status === 'error') {
                statusClass = 'status-error';
                statusText = 'Analysis error';
                if (displayUrl) { // Try to display if URL exists even on error
                    thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                    videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            } else if (status === 'concatenated') { // NEW STATUS
                statusClass = 'status-completed';
                statusText = 'Video concatenated!';
                if (displayUrl) {
                     thumbnailUrl = displayUrl.replace(/\.mp4$/, '.jpg') + "?_a=DAJHADAD";
                     videoElementHTML = `<video controls preload="metadata" muted playsinline style="width:100%; height:auto; display:block;"><source src="${displayUrl}" type="video/mp4"></video>`;
                }
                stopPolling(taskId);
            }
            else {
                statusClass = 'status-info';
                statusText = 'Status unknown';
            }

            // NEW: Add checkbox for video selection
            const checkboxHTML = `
                <input type="checkbox" class="video-selection-checkbox" data-public-id="${taskId}" ${status === 'completed' || status === 'concatenated' ? '' : 'disabled'}>
            `;
            // Important: public_id in data-public-id should match taskId
            // Disable checkbox if video is not processed or has an error

            bubble.innerHTML = `
                <div class="video-thumbnail">
                    ${videoElementHTML ? videoElementHTML : `<img src="${thumbnailUrl || 'assets/placeholder.png'}" alt="Video Thumbnail">`}
                    ${checkboxHTML}
                </div>
                <div class="video-info">
                    <p class="file-name" title="${originalFilename}">${originalFilename}</p>
                    <p class="status ${statusClass}">${statusText}</p>
                    <button class="view-metadata-btn gold-button" data-task-id="${taskId}" ${Object.keys(metadata).length === 0 ? 'disabled' : ''}>Metadata</button>
                </div>
            `;
            bubblesContainer.appendChild(bubble);

            // Handler for metadata button
            const viewMetadataBtn = bubble.querySelector('.view-metadata-btn');
            if (viewMetadataBtn) {
                viewMetadataBtn.addEventListener('click', () => {
                    displayMetadata(taskId, metadata);
                });
            }

            // NEW: Handler for video selection checkbox
            const videoSelectionCheckbox = bubble.querySelector('.video-selection-checkbox');
            if (videoSelectionCheckbox) {
                videoSelectionCheckbox.addEventListener('change', () => {
                    toggleVideoSelection(taskId, bubble, videoSelectionCheckbox);
                });
                // Restore selection state on page reload
                if (selectedVideoPublicIds.has(taskId)) {
                    videoSelectionCheckbox.checked = true;
                    bubble.classList.add('selected');
                }
            }
        }
        updateConcatenationStatus(); // Update status after all videos are loaded
    }

    // Existing function: startPolling (no changes)
    function startPolling(taskId) {
        if (!pollingIntervals[taskId]) {
            pollingIntervals[taskId] = setInterval(async () => {
                try {
                    // Corrected: Explicitly specify backendUrl
                    const response = await fetch(`${backendUrl}/task-status/${taskId}`); 
                    const data = await response.json();
                    if (response.ok) {
                        const task = uploadedVideos.find(v => v.taskId === taskId);
                        if (task && task.status !== data.status) {
                            console.log(`Task ${taskId} status changed to: ${data.status}`);
                            await fetchAndDisplayVideos(); // Redraw all videos
                            if (data.status === 'completed' || data.status === 'error' || data.status === 'concatenated') {
                                stopPolling(taskId);
                            }
                        }
                    } else {
                        console.error(`Polling error for ${taskId}:`, data.error);
                        stopPolling(taskId);
                        await fetchAndDisplayVideos();
                    }
                } catch (error) {
                    console.error(`Polling network error for ${taskId}:`, error);
                    stopPolling(taskId);
                    await fetchAndDisplayVideos();
                }
            }, 5000); // Poll every 5 seconds
        }
    }

    // Existing function: stopPolling (no changes)
    function stopPolling(taskId) {
        if (pollingIntervals[taskId]) {
            clearInterval(pollingIntervals[taskId]);
            delete pollingIntervals[taskId];
            console.log(`Stopped polling for task ${taskId}`);
        }
    }

    // Existing function: displayMetadata (no changes)
    function displayMetadata(taskId, metadata) {
        modalTitle.textContent = `Video Metadata ${taskId}`;
        modalMetadata.textContent = JSON.stringify(metadata, null, 2);
        metadataModal.style.display = 'block';
    }

    // Existing function: close modal (no changes)
    closeButton.addEventListener('click', () => {
        metadataModal.style.display = 'none';
    });

    // Existing function: close modal on outside click (no changes)
    window.addEventListener('click', (event) => {
        if (event.target === metadataModal) {
            metadataModal.style.display = 'none';
        }
    });

    // Existing function: uploadVideoFromResults (now using FormData)
    uploadNewBtn.addEventListener('click', () => {
        videoFileInput.click();
    });

    videoFileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (files.length === 0) {
            uploadStatusText.textContent = 'Select a video to upload.';
            uploadStatusText.className = 'status-message info';
            dynamicUploadStatusContainer.classList.remove('hidden');
            return;
        }

        dynamicUploadStatusContainer.classList.remove('hidden');
        uploadStatusText.textContent = `Starting upload of ${files.length} video(s)...`;
        uploadStatusText.className = 'status-message info';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        document.querySelector('.progress-bar-container').style.display = 'block';

        const totalFiles = files.length;
        let uploadedCount = 0;

        for (const file of files) {
            const formData = new FormData();
            formData.append('video', file);
            formData.append('instagram_username', localStorage.getItem('hifeUsername') || 'unknown');
            formData.append('email', localStorage.getItem('hifeEmail') || 'unknown@example.com');
            formData.append('linkedin_profile', localStorage.getItem('hifeLinkedin') || 'N/A');

            try {
                uploadStatusText.textContent = `Uploading: ${file.name}`;
                // Corrected: Explicitly specify backendUrl
                const response = await fetch(`${backendUrl}/upload_video`, { 
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    uploadedCount++;
                    const progress = Math.round((uploadedCount / totalFiles) * 100);
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `${progress}%`;
                    uploadStatusText.textContent = `Successfully uploaded: ${file.name}. Awaiting processing...`;
                    uploadStatusText.className = 'status-message info';

                    // Add new video to localStorage if it's not there
                    const existingVideoIndex = uploadedVideos.findIndex(v => v.taskId === data.taskId);
                    if (existingVideoIndex === -1) {
                           uploadedVideos.push({
                                taskId: data.taskId,
                                originalFilename: data.originalFilename || file.name, // Corrected: Get from backend response if available
                                status: 'uploaded', // Initial status after upload
                                cloudinary_url: data.cloudinary_url,
                                metadata: data.metadata || {} // Corrected: Save metadata
                            });
                    } else {
                        // Update existing entry if video was already in localStorage (e.g., on re-upload)
                        uploadedVideos[existingVideoIndex] = {
                            ...uploadedVideos[existingVideoIndex],
                            status: 'uploaded',
                            cloudinary_url: data.cloudinary_url,
                            originalFilename: data.originalFilename || file.name, // Corrected: Update filename and metadata
                            metadata: data.metadata || {}
                        };
                    }
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                    await fetchAndDisplayVideos(); // Update video list on page
                    startPolling(data.taskId); // Start polling status for the new video
                } else {
                    uploadStatusText.textContent = `Upload error for ${file.name}: ${data.error || 'Unknown error'}`;
                    uploadStatusText.className = 'status-message error';
                    console.error('Upload error:', data);
                    // Do not stop the process so other files can upload
                }
            } catch (error) {
                uploadStatusText.textContent = `Network error during upload for ${file.name}: ${error.message}`;
                uploadStatusText.className = 'status-message error';
                console.error('Network error during upload:', error);
            }
        }
        // After all uploads are complete, hide progress bar and clear status
        setTimeout(() => {
            document.querySelector('.progress-bar-container').style.display = 'none';
            uploadStatusText.textContent = 'Ready to upload a new video.';
            uploadStatusText.className = 'status-message info';
        }, 3000); // Leave message for 3 seconds
    });

    // Existing function: finishSessionBtn
    finishSessionBtn.addEventListener('click', () => {
        // Here we could redirect to finish.html
        // But if concatenation is in progress, redirection happens from there
        // If no concatenation, just go to finish.html
        window.location.replace('finish.html');
    });


    // NEW: Handler for "Concatenate videos" checkbox
    connectVideosCheckbox.addEventListener('change', async () => {
        if (connectVideosCheckbox.checked) {
            // Concatenation option activated
            const count = selectedVideoPublicIds.size;
            if (count < 2) {
                concatenationStatusDiv.textContent = 'Select at least 2 videos to start concatenation.';
                concatenationStatusDiv.className = 'concatenation-status info';
                // connectVideosCheckbox.checked = false; // Can reset if no selection, but better to allow user to select
                return;
            }

            // Preserve the order of selected videos
            const orderedPublicIds = Array.from(bubblesContainer.children)
                .filter(bubble => bubble.classList.contains('selected'))
                .map(bubble => bubble.dataset.publicId)
                .filter(id => selectedVideoPublicIds.has(id)); // Ensure these are truly selected IDs

            console.log('Attempting to concatenate videos with public_ids (ordered):', orderedPublicIds);
            concatenationStatusDiv.textContent = 'Starting video concatenation... This may take some time.';
            concatenationStatusDiv.className = 'concatenation-status pending';

            try {
                // Corrected: Explicitly specify backendUrl
                const response = await fetch(`${backendUrl}/concatenate_videos`, { 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ public_ids: orderedPublicIds })
                });

                const data = await response.json();

                if (response.ok) {
                    concatenationStatusDiv.textContent = 'Videos successfully concatenated!';
                    concatenationStatusDiv.className = 'concatenation-status completed';
                    console.log('Concatenation successful:', data);

                    // Add concatenated video to localStorage and update UI
                    const newConcatenatedVideo = {
                        taskId: data.new_public_id,
                        originalFilename: `concatenated_video_${data.new_public_id.substring(0, 8)}.mp4`,
                        status: 'concatenated',
                        cloudinary_url: data.new_video_url,
                        metadata: {
                            description: "This video was concatenated from multiple videos."
                        }
                    };
                    uploadedVideos.push(newConcatenatedVideo);
                    localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                    await fetchAndDisplayVideos(); // Redraw all videos, including the new one

                    // Redirect user to finish.html with the URL of the concatenated video
                    window.location.replace(`finish.html?videoUrl=${encodeURIComponent(data.new_video_url)}`);

                } else {
                    concatenationStatusDiv.textContent = `Concatenation error: ${data.error || 'Unknown error'}`;
                    concatenationStatusDiv.className = 'concatenation-status error';
                    console.error('Concatenation error:', data);
                    connectVideosCheckbox.checked = false; // Reset checkbox
                    updateConcatenationStatus(); // Update status
                }
            } catch (error) {
                concatenationStatusDiv.textContent = `Network error during concatenation: ${error.message}`;
                concatenationStatusDiv.className = 'concatenation-status error';
                console.error('Network error during concatenation:', error);
                connectVideosCheckbox.checked = false; // Reset checkbox
                updateConcatenationStatus(); // Update status
            }
        } else {
            // Concatenation option deactivated
            updateConcatenationStatus(); // Clear selection and update status
        }
    });

    // Initialization on page load
    fetchAndDisplayVideos();
    updateConcatenationStatus(); // Initialize status on load
});
