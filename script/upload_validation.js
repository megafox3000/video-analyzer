// script/upload_validation.js

document.addEventListener('DOMContentLoaded', () => {
    const videoFileInput = document.getElementById('videoFileInput');
    const selectFilesButton = document.getElementById('selectFilesButton');
    const finishUploadButton = document.getElementById('finishUploadButton');
    const fileValidationStatusList = document.getElementById('fileValidationStatusList');
    const videoUploadProgressList = document.getElementById('videoUploadProgressList');
    const generalStatusMessage = document.getElementById('generalStatusMessage');
    const instagramInput = document.getElementById('instagramInput'); // Получаем поле Instagram

    let uploadedVideos = []; // Массив для хранения информации о загруженных видео

    // Функция для очистки сообщений об ошибках/статусах
    function clearMessages() {
        generalStatusMessage.textContent = '';
        generalStatusMessage.style.color = '';
        fileValidationStatusList.innerHTML = '';
        videoUploadProgressList.innerHTML = '';
        instagramInput.style.borderColor = ''; // Очищаем красную рамку с Instagram
    }

    // Обработчик кнопки "Upload Video(s)"
    selectFilesButton.addEventListener('click', () => {
        clearMessages(); // Очищаем предыдущие сообщения при новой попытке загрузки
        videoFileInput.click(); // Инициирует клик по скрытому input type="file"
    });

    // Обработчик выбора файлов
    videoFileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        uploadedVideos = []; // Сброс для новой загрузки

        // Получаем значение Instagram username
        const instagramUsername = instagramInput.value.trim();

        // Проверяем, введено ли имя пользователя Instagram
        if (!instagramUsername) {
            generalStatusMessage.textContent = "Пожалуйста, введите ваш Instagram username. Это обязательное поле.";
            generalStatusMessage.style.color = 'red';
            instagramInput.style.borderColor = 'red'; // Визуально показать ошибку
            finishUploadButton.style.display = 'none'; // Скрываем кнопку "Финиш"
            return; // Прекращаем выполнение, если Instagram не заполнен
        } else {
            instagramInput.style.borderColor = ''; // Сбросить цвет границы, если он был красным
            generalStatusMessage.textContent = ''; // Очистить сообщение об ошибке Instagram
        }

        if (files.length === 0) {
            generalStatusMessage.textContent = "Видео не выбрано.";
            generalStatusMessage.style.color = 'orange';
            finishUploadButton.style.display = 'none';
            return;
        }

        generalStatusMessage.textContent = `Выбрано видео: ${files[0].name}${files.length > 1 ? ` и еще ${files.length - 1} файл(а/ов).` : '.'}`;
        generalStatusMessage.style.color = 'lightgreen';
        finishUploadButton.style.display = 'none'; // Скрываем до начала загрузки

        // Создаем элементы для отображения прогресса для каждого файла
        fileValidationStatusList.innerHTML = ''; // Очищаем список валидации
        for (const file of files) {
            const listItem = document.createElement('div');
            listItem.classList.add('video-info-item');
            listItem.id = `video-item-${file.name.replace(/\./g, '_')}`; // Создаем уникальный ID

            listItem.innerHTML = `
                <button class="spoiler-btn">
                    <img src="assets/video-icon.png" alt="Video Icon" class="spoiler-icon">
                    <span>${file.name}</span>
                </button>
                <div class="spoiler-content">
                    <p>Статус: <span id="status-${listItem.id}">Ожидание...</span></p>
                    <div class="progress-bar-container" style="display:none;">
                        <div class="progress-bar" id="progress-${listItem.id}"></div>
                        <span class="progress-text" id="progress-text-${listItem.id}">0%</span>
                    </div>
                </div>
            `;
            fileValidationStatusList.appendChild(listItem);

            // Обработчик спойлера
            const spoilerBtn = listItem.querySelector('.spoiler-btn');
            const spoilerContent = listItem.querySelector('.spoiler-content');
            spoilerBtn.addEventListener('click', () => {
                spoilerContent.classList.toggle('visible');
            });
        }

        // Запускаем загрузку файлов
        await uploadFiles(files, instagramUsername);
    });

    async function uploadFiles(files, instagramUsername) {
        let allUploadsSuccessful = true;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const listItemId = `video-item-${file.name.replace(/\./g, '_')}`;
            const statusSpan = document.getElementById(`status-${listItemId}`);
            const progressBarContainer = document.getElementById(`progress-${listItemId}`).parentNode;
            const progressBar = document.getElementById(`progress-${listItemId}`);
            const progressText = document.getElementById(`progress-text-${listItemId}`);
            const spoilerBtn = document.getElementById(listItemId).querySelector('.spoiler-btn');

            statusSpan.textContent = 'Загрузка...';
            statusSpan.classList.remove('status-error', 'status-completed', 'status-info');
            statusSpan.classList.add('status-pending');
            progressBarContainer.style.display = 'flex'; // Показываем прогресс-бар

            const formData = new FormData();
            formData.append('video', file); // Имя поля должно быть 'video' как на сервере
            formData.append('instagram_username', instagramUsername); // Отправляем имя пользователя

            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'https://video-meta-api.onrender.com/upload_video', true); // ЗАМЕНИТЕ НА АДРЕС ВАШЕГО СЕРВЕРА
                
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percent = (e.loaded / e.total) * 100;
                        progressBar.style.width = `${percent}%`;
                        progressText.textContent = `${Math.round(percent)}%`;
                        // Обновление золотого цвета для кнопки спойлера
                        spoilerBtn.style.setProperty('--upload-progress', `${percent}%`);
                    }
                });

                await new Promise((resolve, reject) => {
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            const response = JSON.parse(xhr.responseText);
                            statusSpan.textContent = 'Загружено. Ожидание анализа...';
                            statusSpan.classList.remove('status-pending');
                            statusSpan.classList.add('status-info');
                            progressBar.style.width = '100%'; // Убедимся, что полоса заполнена
                            progressText.textContent = '100%';
                            spoilerBtn.classList.add('loaded-spoiler-btn'); // Добавляем класс для золотого стиля кнопки
                            spoilerBtn.style.setProperty('--upload-progress', '100%'); // Гарантируем полную заливку

                            // Сохраняем информацию о загруженном видео, включая полные метаданные
                            uploadedVideos.push({
                                id: response.taskId, // taskId является public_id
                                url: response.cloudinary_url,
                                original_filename: response.original_filename,
                                metadata: response.metadata // Сохраняем полные метаданные
                            });
                            resolve(response);
                        } else {
                            const errorData = JSON.parse(xhr.responseText);
                            statusSpan.textContent = `Ошибка: ${errorData.error || 'Загрузка не удалась.'}`;
                            statusSpan.classList.remove('status-pending', 'status-info');
                            statusSpan.classList.add('status-error');
                            allUploadsSuccessful = false;
                            reject(new Error(errorData.error || 'Upload failed'));
                        }
                    };

                    xhr.onerror = () => {
                        statusSpan.textContent = 'Ошибка сети или сервера.';
                        statusSpan.classList.remove('status-pending', 'status-info');
                        statusSpan.classList.add('status-error');
                        allUploadsSuccessful = false;
                        reject(new Error('Network error or server unreachable.'));
                    };

                    xhr.send(formData);
                });

            } catch (error) {
                console.error('Ошибка загрузки файла:', file.name, error);
                statusSpan.textContent = `Ошибка: ${error.message || 'Неизвестная ошибка'}`;
                statusSpan.classList.remove('status-pending', 'status-info');
                statusSpan.classList.add('status-error');
                allUploadsSuccessful = false;
            }
        }

        if (allUploadsSuccessful && uploadedVideos.length > 0) {
            generalStatusMessage.textContent = "Все видео успешно загружены и готовы к анализу!";
            generalStatusMessage.style.color = 'green';
            finishUploadButton.style.display = 'block'; // Показываем кнопку "Финиш"
            
            // Сохраняем uploadedVideos в localStorage для следующей страницы
            localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos));

        } else if (uploadedVideos.length > 0) {
             generalStatusMessage.textContent = "Некоторые видео загружены, но были ошибки. Проверьте статусы.";
             generalStatusMessage.style.color = 'orange';
             finishUploadButton.style.display = 'block'; // Показываем кнопку "Финиш"
             localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos)); // Сохраняем то, что удалось
        }
        else {
            generalStatusMessage.textContent = "Ни одно видео не было загружено успешно. Пожалуйста, попробуйте снова.";
            generalStatusMessage.style.color = 'red';
            finishUploadButton.style.display = 'none'; // Скрываем кнопку "Финиш"
        }
    }

    // Обработчик кнопки "Финиш"
    finishUploadButton.addEventListener('click', () => {
        if (uploadedVideos.length > 0) {
            // Перенаправляем на страницу результатов (results.html)
            window.location.href = 'results.html';
        } else {
            generalStatusMessage.textContent = "Нет загруженных видео для отображения результатов.";
            generalStatusMessage.style.color = 'orange';
        }
    });
});
