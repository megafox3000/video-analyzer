// file_validator.js

// Экспортируем константы, чтобы они были в одном месте
export const MAX_VIDEO_SIZE_MB = 100;
export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 минут
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

/**
 * Получает длительность видео. Возвращает Promise.
 * @param {File} file - Файл для проверки.
 * @returns {Promise<number>} Длительность видео в секундах.
 */
function getVideoDuration(file) {
    return new Promise((resolve, reject) => {
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';
        
        videoElement.onloadedmetadata = () => {
            URL.revokeObjectURL(videoElement.src);
            resolve(videoElement.duration);
        };
        
        videoElement.onerror = () => {
            URL.revokeObjectURL(videoElement.src);
            reject(new Error(`Не удалось прочитать метаданные файла: ${file.name}`));
        };
        
        videoElement.src = URL.createObjectURL(file);
    });
}

/**
 * Полностью валидирует один файл (тип, размер, длительность).
 * @param {File} file - Файл для валидации.
 * @returns {Promise<{isValid: boolean, reason?: string}>} Результат валидации.
 */
export async function validateFile(file) {
    if (!file.type.startsWith('video/')) {
        return { isValid: false, reason: 'Неверный тип файла.' };
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
        return { isValid: false, reason: `Слишком большой (макс. ${MAX_VIDEO_SIZE_MB} MB).` };
    }
    try {
        const duration = await getVideoDuration(file);
        if (duration > MAX_VIDEO_DURATION_SECONDS) {
            return { isValid: false, reason: `Слишком длинный (макс. ${MAX_VIDEO_DURATION_SECONDS / 60} мин).` };
        }
    } catch (error) {
        console.error(error);
        return { isValid: false, reason: 'Файл поврежден или не читается.' };
    }

    return { isValid: true };
}
