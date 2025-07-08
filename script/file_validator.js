// file_validator.js
"""
This module is responsible for all client-side file validation.
It checks files against predefined rules like size, duration, and type.
It is designed to be used by the main upload orchestrator script.
"""

// --- Validation Constants ---
// Exported so they can be used elsewhere in the app if needed (e.g., for displaying limits in the UI).
export const MAX_VIDEO_SIZE_MB = 100;
export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 minutes
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

/**
 * Gets the duration of a video file by loading its metadata.
 * This function is "promisified" to allow for easy use with async/await.
 * @param {File} file - The video file to check.
 * @returns {Promise<number>} A promise that resolves with the video's duration in seconds.
 */
function getVideoDuration(file) {
    return new Promise((resolve, reject) => {
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';
        
        // Event handler for when the browser has loaded enough data to read metadata.
        videoElement.onloadedmetadata = () => {
            URL.revokeObjectURL(videoElement.src); // Clean up the object URL to free memory.
            resolve(videoElement.duration);
        };
        
        // Event handler for errors (e.g., corrupted file).
        videoElement.onerror = () => {
            URL.revokeObjectURL(videoElement.src); // Clean up on error as well.
            reject(new Error(`Could not read metadata for file: ${file.name}`));
        };
        
        // Create a temporary URL for the file to load it into the video element.
        videoElement.src = URL.createObjectURL(file);
    });
}

/**
 * Performs a complete validation of a single file (type, size, duration).
 * @param {File} file - The file to validate.
 * @returns {Promise<{isValid: boolean, reason?: string}>} A promise that resolves with the validation result.
 */
export async function validateFile(file) {
    // 1. Check file type
    if (!file.type.startsWith('video/')) {
        return { isValid: false, reason: 'Неверный тип файла.' };
    }

    // 2. Check file size
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
        return { isValid: false, reason: `Слишком большой (макс. ${MAX_VIDEO_SIZE_MB} MB).` };
    }

    // 3. Asynchronously check video duration
    try {
        const duration = await getVideoDuration(file);
        if (duration > MAX_VIDEO_DURATION_SECONDS) {
            return { isValid: false, reason: `Слишком длинный (макс. ${Math.floor(MAX_VIDEO_DURATION_SECONDS / 60)} мин).` };
        }
    } catch (error) {
        console.error(error);
        return { isValid: false, reason: 'Файл поврежден или не читается.' };
    }

    // If all checks pass, the file is valid.
    return { isValid: true };
}
