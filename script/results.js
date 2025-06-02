document.addEventListener('DOMContentLoaded', async () => {
    const resultsHeader = document.getElementById('resultsHeader');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const uploadNewBtn = document.getElementById('uploadNewBtn');
    const finishSessionBtn = document.getElementById('finishSessionBtn');
    const bubblesContainer = document.getElementById('bubblesContainer');
    const videoFileInput = document.getElementById('videoFileInput');
    const dynamicUploadStatusContainer = document.getElementById('dynamicUploadStatusContainer');
    const uploadStatusText = document.getElementById('uploadStatusText');
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const metadataModal = document.getElementById('metadataModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMetadata = document.getElementById('modalMetadata');
    const closeModalButton = document.querySelector('.modal .close-button');

    // NEW: Elements for concatenation
    const connectVideosCheckbox = document.getElementById('connectVideosCheckbox');
    const concatenationStatusDiv = document.getElementById('concatenationStatus');

    const RENDER_BACKEND_URL = 'https://video-meta-api.onrender.com'; // Ваш URL бэкенда

    let hifeUsername = localStorage.getItem('hifeUsername') || '';
    let uploadedVideos = JSON.parse(localStorage.getItem('uploadedVideos') || '[]');

    // NEW: Array to store selected video public_ids for concatenation
    // We'll maintain the order based on how they appear in the DOM initially
    let selectedVideoPublicIds = new Set(); // Using Set to avoid duplicates, convert to array for order

    // Display username
    if (hifeUsername) {
        usernameDisplay.textContent = `Добро пожаловать, ${hifeUsername}!`;
        resultsHeader.textContent = `Ваши Видео для ${hifeUsername}`;
    } else {
        usernameDisplay.textContent = 'Пожалуйста, введите свое имя пользователя на предыдущей странице.';
        resultsHeader.textContent = 'Ваши Видео';
    }

    // Function to fetch video status and update bubbles
    async function fetchAndDisplayVideos() {
        if (uploadedVideos.length === 0) {
            bubblesContainer.innerHTML = '<p>Пока нет загруженных видео для отображения.</p>';
            finishSessionBtn.style.display = 'none';
            return;
        }

        bubblesContainer.innerHTML = ''; // Clear existing bubbles

        // Fetch status for all videos concurrently
        const fetchPromises = uploadedVideos.map(async (video) => {
            if (video.status === 'pending') {
                try {
                    const response = await fetch(`${RENDER_BACKEND_URL}/status/${video.id}`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const statusData = await response.json();
                    video.status = statusData.status; // Update status
                    video.metadata = statusData.metadata; // Update metadata
                    // NEW: Update public_id if not present (assuming backend returns it with status)
                    if (statusData.public_id && !video.public_id) {
                        video.public_id = statusData.public_id;
                    }
                    if (statusData.cloudinary_url && !video.cloudinary_url) {
                         video.cloudinary_url = statusData.cloudinary_url;
                    }
                } catch (error) {
                    console.error('Error fetching status for video ID', video.id, ':', error);
                    video.status = 'error';
                    video.error_message = 'Не удалось получить статус.';
                }
            }
            return video;
        });

        // Wait for all status updates
        uploadedVideos = await Promise.all(fetchPromises);
        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos)); // Save updated statuses

        // Render bubbles
        uploadedVideos.forEach(video => {
            const bubble = document.createElement('div');
            bubble.className = 'media-bubble fade-in-bubble';
            bubble.setAttribute('data-task-id', video.id);
            bubble.setAttribute('data-original-filename', video.original_filename);

            // NEW: Add click listener to bubble for selection
            bubble.addEventListener('click', () => toggleVideoSelection(bubble, video.public_id));

            // Check if this video was previously selected (if refreshing state)
            if (selectedVideoPublicIds.has(video.public_id)) {
                bubble.classList.add('selected');
            }

            // Create video element for preview or status overlay
            if (video.status === 'completed' && video.cloudinary_url) {
                const videoElement = document.createElement('video');
                videoElement.src = video.cloudinary_url;
                videoElement.autoplay = true;
                videoElement.loop = true;
                videoElement.muted = true;
                videoElement.playsinline = true;
                videoElement.preload = 'metadata'; // Load metadata to get duration/dimensions if needed
                bubble.appendChild(videoElement);

                // Add click listener for metadata modal (only for completed videos)
                videoElement.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent bubble selection on video click
                    displayMetadata(video.original_filename, video.metadata);
                });

            } else {
                // Display status overlay for pending/error videos
                const statusOverlay = document.createElement('div');
                statusOverlay.className = 'status-overlay';
                let statusMessage = '';
                let statusClass = '';

                switch (video.status) {
                    case 'pending':
                        statusMessage = 'Анализ...';
                        statusClass = 'pending';
                        statusOverlay.innerHTML = `${statusMessage}<div class="spinner"></div>`;
                        break;
                    case 'error':
                        statusMessage = video.error_message || 'Ошибка анализа';
                        statusClass = 'error';
                        statusOverlay.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>${statusMessage}</p>`;
                        break;
                    default:
                        statusMessage = 'Неизвестный статус';
                        statusClass = 'info';
                        statusOverlay.innerHTML = `<p>${statusMessage}</p>`;
                        break;
                }
                statusOverlay.classList.add(statusClass);
                bubble.appendChild(statusOverlay);
            }

            // File name overlay (always present)
            const fileNameOverlay = document.createElement('div');
            fileNameOverlay.className = 'file-name-overlay';
            fileNameOverlay.textContent = video.original_filename;
            bubble.appendChild(fileNameOverlay);

            bubblesContainer.appendChild(bubble);
        });

        finishSessionBtn.style.display = 'block'; // Show finish session button if there are videos
    }

    // NEW: Function to toggle video selection
    function toggleVideoSelection(bubbleElement, publicId) {
        if (!publicId) { // Only allow selection if public_id is available (i.e., video is processed)
            alert('Видео еще не обработано или имеет ошибку. Его нельзя выбрать для конкатенации.');
            return;
        }

        if (bubbleElement.classList.contains('selected')) {
            bubbleElement.classList.remove('selected');
            selectedVideoPublicIds.delete(publicId);
        } else {
            bubbleElement.classList.add('selected');
            selectedVideoPublicIds.add(publicId);
        }
        updateConcatenationStatus();
    }

    // NEW: Update concatenation status message
    function updateConcatenationStatus() {
        if (selectedVideoPublicIds.size > 0) {
            concatenationStatusDiv.textContent = `Выбрано видео для объединения: ${selectedVideoPublicIds.size}.`;
            concatenationStatusDiv.classList.remove('hidden');
            concatenationStatusDiv.classList.remove('error', 'completed');
            concatenationStatusDiv.classList.add('info');
        } else {
            concatenationStatusDiv.textContent = '';
            concatenationStatusDiv.classList.add('hidden');
        }
    }

    // NEW: Handle Connect Videos Checkbox change
    connectVideosCheckbox.addEventListener('change', async () => {
        if (connectVideosCheckbox.checked) {
            if (selectedVideoPublicIds.size < 2) {
                alert('Пожалуйста, выберите как минимум два видео для объединения.');
                connectVideosCheckbox.checked = false; // Uncheck if not enough videos selected
                return;
            }

            concatenationStatusDiv.textContent = 'Начало объединения видео...';
            concatenationStatusDiv.classList.remove('hidden', 'error', 'completed');
            concatenationStatusDiv.classList.add('pending');

            // Order the selected public IDs based on their display order in the DOM
            // This assumes initial uploadedVideos order is the desired concatenation order
            const orderedPublicIds = uploadedVideos
                .filter(video => selectedVideoPublicIds.has(video.public_id))
                .map(video => video.public_id);

            try {
                const response = await fetch(`${RENDER_BACKEND_URL}/concatenate_videos`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ public_ids: orderedPublicIds })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                concatenationStatusDiv.textContent = 'Видео успешно объединены!';
                concatenationStatusDiv.classList.remove('pending', 'error');
                concatenationStatusDiv.classList.add('completed');

                // Redirect to finish.html with the new video URL
                window.location.href = `finish.html?videoUrl=${encodeURIComponent(result.new_video_url)}`;

            } catch (error) {
                console.error('Ошибка объединения видео:', error);
                concatenationStatusDiv.textContent = `Ошибка объединения: ${error.message}`;
                concatenationStatusDiv.classList.remove('pending', 'completed');
                concatenationStatusDiv.classList.add('error');
                connectVideosCheckbox.checked = false; // Uncheck on error
            }
        } else {
            // Checkbox unchecked, clear selections
            selectedVideoPublicIds.clear();
            document.querySelectorAll('.media-bubble.selected').forEach(bubble => {
                bubble.classList.remove('selected');
            });
            updateConcatenationStatus();
        }
    });

    // Handle upload new button click (for file input)
    uploadNewBtn.addEventListener('click', () => {
        videoFileInput.click();
    });

    // Handle file input change (for new uploads from results page)
    videoFileInput.addEventListener('change', async () => {
        const filesToUpload = Array.from(videoFileInput.files);
        if (filesToUpload.length === 0) {
            uploadStatusText.textContent = 'Готов к загрузке нового видео.';
            dynamicUploadStatusContainer.classList.add('hidden');
            return;
        }

        dynamicUploadStatusContainer.classList.remove('hidden');
        progressBarContainer.style.display = 'flex';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        let currentFileIndex = 0;
        let successfulUploads = 0;

        async function uploadNextFileInQueue() {
            if (currentFileIndex < filesToUpload.length) {
                const file = filesToUpload[currentFileIndex];
                uploadStatusText.textContent = `Загрузка видео ${currentFileIndex + 1} из ${filesToUpload.length}: ${file.name}...`;
                uploadStatusText.classList.remove('error', 'completed');
                uploadStatusText.classList.add('info');

                const formData = new FormData();
                formData.append('video', file);
                formData.append('instagram_username', localStorage.getItem('hifeUsername') || '');
                formData.append('email', localStorage.getItem('hifeEmail') || '');
                formData.append('linkedin_profile', localStorage.getItem('hifeLinkedin') || '');

                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${RENDER_BACKEND_URL}/upload_video`, true);

                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percent = (event.loaded / event.total) * 100;
                        progressBar.style.width = `${percent.toFixed(0)}%`;
                        progressText.textContent = `${percent.toFixed(0)}%`;
                        uploadStatusText.textContent = `Загрузка видео ${currentFileIndex + 1} из ${filesToUpload.length}: ${file.name} (${percent.toFixed(0)}%)`;
                    }
                });

                xhr.onload = async function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const response = JSON.parse(xhr.responseText);
                        const taskId = response.taskId;
                        const newPublicId = response.public_id; // Get public_id from upload response
                        const newCloudinaryUrl = response.cloudinary_url;

                        const newVideoEntry = {
                            id: taskId,
                            public_id: newPublicId, // Store public_id
                            original_filename: file.name,
                            status: 'pending',
                            timestamp: new Date().toISOString(),
                            cloudinary_url: newCloudinaryUrl
                        };
                        uploadedVideos.push(newVideoEntry);
                        localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));
                        successfulUploads++;
                        currentFileIndex++;
                        await uploadNextFileInQueue(); // Continue with next file
                    } else {
                        const error = JSON.parse(xhr.responseText);
                        uploadStatusText.textContent = `Ошибка загрузки "${file.name}": ${error.error || 'Неизвестная ошибка'}`;
                        uploadStatusText.classList.remove('info', 'completed');
                        uploadStatusText.classList.add('error');
                        progressBarContainer.style.display = 'none';
                        // Stop processing further files on error
                        console.error('Upload error:', error);
                    }
                };

                xhr.onerror = function() {
                    uploadStatusText.textContent = `Ошибка сети при загрузке "${file.name}".`;
                    uploadStatusText.classList.remove('info', 'completed');
                    uploadStatusText.classList.add('error');
                    progressBarContainer.style.display = 'none';
                    console.error('Network error during upload.');
                };

                xhr.send(formData);
            } else {
                // All files in this batch uploaded
                if (successfulUploads > 0) {
                    uploadStatusText.textContent = `Загружено ${successfulUploads} видео. Обновление статусов...`;
                    uploadStatusText.classList.remove('error', 'info');
                    uploadStatusText.classList.add('completed');
                    progressBarContainer.style.display = 'none';
                    await fetchAndDisplayVideos(); // Refresh the list of videos
                } else {
                    uploadStatusText.textContent = 'Загрузка отменена или произошла ошибка.';
                    uploadStatusText.classList.remove('info', 'completed');
                    uploadStatusText.classList.add('error');
                    progressBarContainer.style.display = 'none';
                }
            }
        }
        await uploadNextFileInQueue(); // Start the upload queue
    });

    // Handle Finish Session button
    finishSessionBtn.addEventListener('click', () => {
        const confirmClear = confirm('Вы уверены, что хотите завершить сессию? Все загруженные видео будут удалены из вашего списка.');
        if (confirmClear) {
            localStorage.removeItem('hifeUsername');
            localStorage.removeItem('hifeEmail');
            localStorage.removeItem('hifeLinkedin');
            localStorage.removeItem('uploadedVideos');
            // Clear selected video IDs for concatenation as well
            selectedVideoPublicIds.clear();
            alert('Сессия завершена. Все данные удалены.');
            window.location.replace('index.html'); // Redirect to start page
        }
    });

    // Modal functionality
    function displayMetadata(filename, metadata) {
        modalTitle.textContent = `Метаданные для: ${filename}`;
        modalMetadata.textContent = JSON.stringify(metadata, null, 2);
        metadataModal.style.display = 'flex'; // Use flex to center
    }

    closeModalButton.addEventListener('click', () => {
        metadataModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === metadataModal) {
            metadataModal.style.display = 'none';
        }
    });

    // Initial fetch and display of videos
    fetchAndDisplayVideos();
});
