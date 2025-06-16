// script/qr_scanner.js
console.log("DEBUG: qr_scanner.js loaded and executing.");

// DOM-элементы для QR-сканера
const video = document.getElementById('video');
const qrCanvas = document.getElementById('qrCanvas');
const loadingMessage = document.getElementById('loadingMessage');
const outputData = document.getElementById('outputData');
const outputMessage = document.getElementById('outputMessage');
const startScanButton = document.getElementById('startScanButton');
const stopScanButton = document.getElementById('stopScanButton');

let videoStream = null; // Для хранения потока камеры
let scanInterval = null; // Для интервала сканирования

// Получаем контекст канваса только если qrCanvas существует
const qrCanvasContext = qrCanvas ? qrCanvas.getContext('2d') : null;

/**
 * Инициализирует и запускает QR-сканер.
 */
async function startScanner() {
    if (videoStream) {
        console.log("Scanner is already running.");
        return;
    }

    // Сбрасываем и скрываем все сообщения
    if (outputMessage) {
        outputMessage.textContent = '';
        outputMessage.style.display = 'none';
    }
    if (outputData) {
        outputData.textContent = '';
        outputData.style.display = 'none';
    }

    // Скрываем/показываем нужные элементы UI
    if (loadingMessage) loadingMessage.style.display = 'block';
    // output - это контейнер для video и qrCanvas
    const outputContainer = document.getElementById('output');
    if (outputContainer) outputContainer.style.display = 'none'; 
    if (startScanButton) startScanButton.style.display = 'none';
    if (stopScanButton) stopScanButton.style.display = 'inline-block'; // Показываем кнопку остановки

    console.log("Attempting to start QR scanner...");

    try {
        // Запрашиваем доступ к камере, предпочитая заднюю камеру на мобильных
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        videoStream = stream; // Сохраняем поток для последующей остановки

        // Как только видео метаданные загружены, можно начать воспроизведение и сканирование
        video.onloadedmetadata = () => {
            video.play();
            if (loadingMessage) loadingMessage.style.display = 'none';
            if (outputContainer) outputContainer.style.display = 'block'; // Показываем видео
            requestAnimationFrame(tick); // Начинаем цикл сканирования
            console.log("Camera stream started. Scanning for QR codes...");
        };
    } catch (err) {
        console.error("Error accessing camera: ", err);
        if (loadingMessage) loadingMessage.style.display = 'none';
        if (outputMessage) {
            outputMessage.textContent = "Не удалось получить доступ к камере. Убедитесь, что у вас есть камера и вы предоставили доступ.";
            outputMessage.style.display = 'block';
        }
        if (startScanButton) startScanButton.style.display = 'inline-block';
        if (stopScanButton) stopScanButton.style.display = 'none';
        // Очищаем поток, если была ошибка
        videoStream = null;
    }
}

/**
 * Останавливает QR-сканер.
 */
function stopScanner() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop()); // Останавливаем все треки в потоке
        videoStream = null;
        video.srcObject = null;
        console.log("QR scanner stopped.");
    }
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }

    // Скрываем/показываем нужные элементы UI
    const outputContainer = document.getElementById('output');
    if (outputContainer) outputContainer.style.display = 'none';
    if (loadingMessage) loadingMessage.style.display = 'none';
    if (outputMessage) {
        outputMessage.textContent = ''; // Очищаем сообщение
        outputMessage.style.display = 'none';
    }
    if (outputData) {
        outputData.textContent = '';     // Очищаем данные
        outputData.style.display = 'none';
    }
    if (startScanButton) startScanButton.style.display = 'inline-block';
    if (stopScanButton) stopScanButton.style.display = 'none';
}

/**
 * Цикл обработки видеопотока для поиска QR-кодов.
 */
function tick() {
    if (!videoStream || video.readyState !== video.HAVE_ENOUGH_DATA || !qrCanvasContext) {
        // Если видеопоток неактивен, или данные не готовы, или контекст канваса отсутствует,
        // просто продолжаем цикл или выходим.
        if (videoStream) requestAnimationFrame(tick);
        return;
    }

    // Устанавливаем размеры канваса равными размерам видео
    qrCanvas.height = video.videoHeight;
    qrCanvas.width = video.videoWidth;
    qrCanvasContext.drawImage(video, 0, 0, qrCanvas.width, qrCanvas.height);
    
    // Получаем данные изображения с канваса
    const imageData = qrCanvasContext.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
    
    // Декодируем QR-код с помощью jsQR
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert", // Попробуйте "attemptBoth" или "invertFirst" если сканирование не работает
    });

    if (code) {
        // QR-код найден!
        // Рисуем границы QR-кода ПЕРЕД обработкой результата, чтобы они были видны на последнем кадре
        drawQrCodeBounds(code); 
        handleScanResult(code.data); // Обрабатываем найденные данные
        stopScanner(); // Останавливаем сканер после успешного сканирования
        return; // Выходим из цикла
    } else {
        // QR-код не найден
        // Отображаем сообщение только если оно еще не было установлено (например, об успешном сканировании)
        if (outputMessage && outputMessage.textContent === '') {
            outputMessage.textContent = "QR-код не найден.";
            outputMessage.style.display = 'block';
        }
        if (outputData) outputData.style.display = 'none';
    }
    // Продолжаем цикл сканирования, если сканер активен
    if (videoStream) { // Проверяем, что поток камеры всё ещё активен
        requestAnimationFrame(tick);
    }
}

/**
 * Рисует границы найденного QR-кода на канвасе.
 * @param {object} code Объект QR-кода, возвращаемый jsQR.
 */
function drawQrCodeBounds(code) {
    if (!qrCanvasContext) return;
    function drawLine(begin, end) {
        qrCanvasContext.beginPath();
        qrCanvasContext.moveTo(begin.x, begin.y);
        qrCanvasContext.lineTo(end.x, end.y);
        qrCanvasContext.lineWidth = 4;
        qrCanvasContext.strokeStyle = "#FF3B58"; // Красный цвет
        qrCanvasContext.stroke();
    }
    drawLine(code.location.topLeftCorner, code.location.topRightCorner);
    drawLine(code.location.topRightCorner, code.location.bottomRightCorner);
    drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner);
    drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner);
}

/**
 * Обрабатывает декодированные данные QR-кода.
 * @param {string} qrData Данные, извлеченные из QR-кода.
 */
function handleScanResult(qrData) {
    console.log("QR Code detected: ", qrData);
    if (outputMessage) {
        outputMessage.textContent = "QR-код успешно отсканирован!";
        outputMessage.style.display = 'block';
    }
    if (outputData) {
        outputData.textContent = qrData; // Отображаем декодированные данные
        outputData.style.display = 'block';
    }

    // Логика обработки данных QR-кода
    try {
        const url = new URL(qrData);
        // Если это действительный URL, автоматически перенаправляем пользователя
        if (outputMessage) {
            outputMessage.textContent = `QR-код содержит ссылку: ${qrData}. Перенаправление...`;
        }
        setTimeout(() => {
            window.location.href = url.toString();
        }, 1000); // Небольшая задержка перед перенаправлением
    } catch (e) {
        console.log("QR data is not a valid URL or other specific action is needed.");
        // Если это не URL, можно добавить другую логику:
        // Например, распарсить как JSON, если ожидаются структурированные данные.
        // Или просто оставить отображение текста для пользователя.
    }
}

// Экспортируем функции, которые будут использоваться извне
export { startScanner, stopScanner };
