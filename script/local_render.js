// server.js (Обновленный бэкенд для Render: управляет задачами)
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer(); // Используем multer без сохранения на диск для заглушки
const cors = require('cors'); // Для разрешения запросов с фронтенда и воркера

// --- Настройка Express ---
app.use(cors()); // Разрешаем CORS для всех запросов
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Имитация базы данных задач в памяти ---
// В реальной жизни это была бы настоящая база данных (PostgreSQL, MongoDB и т.д.)
const fakeTaskDatabase = {}; // { taskId: { username, status, inputFileName, inputDriveId, outputDriveId, message, metadata } }

// --- Эндпоинт 1: Прием видео от фронтенда на /analyze (создание задачи) ---
// Фронтенд отправляет видео сюда. Мы регистрируем его как новую задачу.
app.post('/analyze', upload.single('file'), (req, res) => { // Изменено на upload.single('file')
    const username = req.body.username || 'unknown_user'; // Имя пользователя из формы
    const file = req.file; // Данные файла, загруженного с фронтенда

    if (!file) {
        return res.status(400).send('No file uploaded.');
    }

    const taskId = 'task_' + Math.random().toString(36).substr(2, 9);
    const fakeDriveId = 'drive_id_' + Math.random().toString(36).substr(2, 9); // Фиктивный ID на Google Drive

    console.log(`\n[RENDER BACKEND] Получен файл "${file.originalname}" от пользователя "${username}" на /analyze.`);
    console.log(`[RENDER BACKEND] Имитация загрузки файла на Google Диск. Фиктивный Drive ID: ${fakeDriveId}`);

    // Сохраняем информацию о задаче в нашей "фиктивной базе данных"
    fakeTaskDatabase[taskId] = {
        username: username,
        status: 'pending_for_worker', // Новый статус: ожидает локального воркера
        inputFileName: file.originalname,
        inputDriveId: fakeDriveId,
        outputDriveId: null,
        message: 'Видео получено, задача добавлена в очередь для обработки воркером.',
        metadata: null // Здесь будут храниться метаданные после обработки воркером
    };

    console.log(`[RENDER BACKEND] Создана фиктивная задача: ${taskId}`);
    // Отправляем ответ фронтенду: задача принята, возвращаем taskId
    res.json({ status: 'task_created', taskId: taskId, message: 'Video received, task created.' });
});

// --- Эндпоинт 2: Воркер на локальном ПК опрашивает новые задачи ---
// Воркер будет обращаться сюда, чтобы узнать, есть ли что-то для обработки.
app.get('/tasks/pending', (req, res) => {
    // Находим задачи, которые ожидают воркера
    const pendingTasks = Object.keys(fakeTaskDatabase)
        .filter(id => fakeTaskDatabase[id].status === 'pending_for_worker')
        .map(id => ({
            taskId: id,
            username: fakeTaskDatabase[id].username,
            inputFileName: fakeTaskDatabase[id].inputFileName,
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
    const { taskId, outputDriveId, status, message, metadata } = req.body; // Добавлено metadata

    if (fakeTaskDatabase[taskId]) {
        // Обновляем статус и ID обработанного файла в нашей "БД"
        fakeTaskDatabase[taskId].status = status;
        fakeTaskDatabase[taskId].outputDriveId = outputDriveId;
        fakeTaskDatabase[taskId].message = message;
        fakeTaskDatabase[taskId].metadata = metadata; // Сохраняем полученные метаданные
        console.log(`[RENDER BACKEND] Задача ${taskId} обновлена: статус "${status}", фиктивный Output Drive ID: ${outputDriveId}`);
        res.json({ success: true, message: `Task ${taskId} updated.` });
    } else {
        console.log(`[RENDER BACKEND] Ошибка: Задача ${taskId} не найдена при обновлении.`);
        res.status(404).json({ success: false, message: `Task ${taskId} not found.` });
    }
});

// --- Эндпоинт 4: Фронтенд запрашивает статус конкретной задачи ---
// Фронтенд на results.html будет периодически запрашивать статус задачи по ее ID.
app.get('/task-status/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    if (fakeTaskDatabase[taskId]) {
        res.json(fakeTaskDatabase[taskId]); // Отдаем полную информацию о задаче, включая метаданные
    } else {
        res.status(404).json({ message: 'Task not found.' });
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Render Backend заглушка запущена на порту ${port}`);
    console.log(`Для доступа с фронтенда (если он на другом порту/домене), убедитесь, что CORS включен.`);
});
