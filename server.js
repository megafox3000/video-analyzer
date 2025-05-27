// server.js (заглушка бэкенда для Render)
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser');
const multer = require('multer'); // Для обработки загрузки файлов
const upload = multer(); // Используем multer без сохранения на диск для заглушки
const cors = require('cors'); // Для разрешения запросов с фронтенда

// --- Настройка Express ---
app.use(cors()); // Разрешаем CORS, чтобы фронтенд мог обращаться к бэкенду
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Имитация базы данных задач в памяти ---
// В реальной жизни это была бы настоящая база данных (PostgreSQL, MongoDB и т.д.)
const fakeTaskDatabase = {}; // { taskId: { username, status, inputFileName, inputDriveId, outputDriveId, message } }

// --- Эндпоинт 1: Прием видео от фронтенда (заглушка загрузки на Google Диск) ---
// Фронтенд отправляет видео сюда. Мы имитируем загрузку на Google Диск.
app.post('/upload-video', upload.single('videoFile'), (req, res) => {
    const username = req.body.username; // Имя пользователя из формы
    const file = req.file; // Данные файла, загруженного с фронтенда

    if (!username || !file) {
        return res.status(400).send('Username and file are required.');
    }

    const taskId = 'task_' + Math.random().toString(36).substr(2, 9); // Генерируем уникальный ID для задачи
    const fakeDriveId = 'drive_id_' + Math.random().toString(36).substr(2, 9); // Фиктивный ID на Google Drive

    // Имитируем запись в логи: что произошло на бэкенде
    console.log(`\n[RENDER BACKEND] Получен файл "${file.originalname}" от пользователя "${username}".`);
    console.log(`[RENDER BACKEND] Имитация загрузки файла на Google Диск. Фиктивный Drive ID: ${fakeDriveId}`);

    // Сохраняем информацию о задаче в нашей "фиктивной базе данных"
    fakeTaskDatabase[taskId] = {
        username: username,
        status: 'received_uploading_to_drive', // Исходный статус
        inputFileName: file.originalname,
        inputDriveId: fakeDriveId,
        outputDriveId: null,
        message: 'Видео получено и загружается на Google Диск (фиктивно).'
    };

    console.log(`[RENDER BACKEND] Создана фиктивная задача: ${taskId}`);
    // Отправляем ответ фронтенду: задача принята
    res.json({ status: 'accepted', taskId: taskId, message: 'Video received and being uploaded to Google Drive (fake).' });
});

// --- Эндпоинт 2: Воркер на локальном ПК опрашивает новые задачи ---
// Воркер будет обращаться сюда, чтобы узнать, есть ли что-то для обработки.
app.get('/tasks/pending', (req, res) => {
    // Находим задачи, которые еще не обработаны или находятся в процессе
    const pendingTasks = Object.keys(fakeTaskDatabase)
        .filter(id => 
            fakeTaskDatabase[id].status === 'received_uploading_to_drive' || 
            fakeTaskDatabase[id].status === 'processing_started'
        )
        .map(id => ({
            taskId: id,
            username: fakeTaskDatabase[id].username,
            inputDriveId: fakeTaskDatabase[id].inputDriveId,
            status: fakeTaskDatabase[id].status,
            message: fakeTaskDatabase[id].message
        }));
    
    if (pendingTasks.length > 0) {
        console.log(`[RENDER BACKEND] Worker запросил задачи. Отдаем ${pendingTasks.length} фиктивных задач.`);
    } else {
        console.log(`[RENDER BACKEND] Worker запросил задачи. Задач нет.`);
    }

    res.json(pendingTasks); // Отдаем список задач воркеру
});

// --- Эндпоинт 3: Воркер на локальном ПК сообщает о завершении обработки ---
// Воркер будет обращаться сюда, чтобы обновить статус задачи после обработки.
app.post('/tasks/completed', (req, res) => {
    const { taskId, outputDriveId, status, message } = req.body;

    if (fakeTaskDatabase[taskId]) {
        // Обновляем статус и ID обработанного файла в нашей "БД"
        fakeTaskDatabase[taskId].status = status;
        fakeTaskDatabase[taskId].outputDriveId = outputDriveId;
        fakeTaskDatabase[taskId].message = message;
        console.log(`[RENDER BACKEND] Задача ${taskId} обновлена: статус "${status}", фиктивный Output Drive ID: ${outputDriveId}`);
        res.json({ success: true, message: `Task ${taskId} updated.` });
    } else {
        console.log(`[RENDER BACKEND] Ошибка: Задача ${taskId} не найдена.`);
        res.status(404).json({ success: false, message: `Task ${taskId} not found.` });
    }
});

// --- Эндпоинт 4: Фронтенд запрашивает статус конкретной задачи ---
// Фронтенд на results.html будет периодически запрашивать статус задачи по ее ID.
app.get('/task-status/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    if (fakeTaskDatabase[taskId]) {
        res.json(fakeTaskDatabase[taskId]); // Отдаем полную информацию о задаче
    } else {
        res.status(404).json({ message: 'Task not found.' });
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Render Backend заглушка запущена на порту ${port}`);
    console.log(`Для доступа с фронтенда (если он на другом порту/домене), убедитесь, что CORS включен.`);
});
