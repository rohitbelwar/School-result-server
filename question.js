const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001; // एक अलग पोर्ट ताकि यह server.js के साथ न टकराए

app.use(cors());
app.use(express.json());

// JSON फ़ाइलों के लिए पथ (Path)
const QUESTIONS_PATH = path.join(__dirname, 'questions.json');
const RESULTS_PATH = path.join(__dirname, 'results.json');
const SETTINGS_PATH = path.join(__dirname, 'settings.json');

// Helper function to read a JSON file
const readJSONFile = (filePath, defaultData = []) => {
    try {
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath);
            return JSON.parse(fileData);
        }
        return defaultData;
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return defaultData;
    }
};

// Helper function to write to a JSON file
const writeJSONFile = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing to ${filePath}:`, error);
    }
};

// --- API Routes ---

// Questions API
app.get('/api/questions', (req, res) => {
    const questions = readJSONFile(QUESTIONS_PATH, []);
    res.json(questions);
});

app.post('/api/questions', (req, res) => {
    const questions = readJSONFile(QUESTIONS_PATH, []);
    const newQuestion = req.body;
    newQuestion.id = Date.now(); // एक यूनिक आईडी सुनिश्चित करें
    questions.push(newQuestion);
    writeJSONFile(QUESTIONS_PATH, questions);
    res.status(201).json(newQuestion);
});

app.delete('/api/questions/:id', (req, res) => {
    let questions = readJSONFile(QUESTIONS_PATH, []);
    const questionId = parseInt(req.params.id, 10);
    const initialLength = questions.length;
    questions = questions.filter(q => q.id !== questionId);

    if (questions.length < initialLength) {
        writeJSONFile(QUESTIONS_PATH, questions);
        res.status(200).json({ message: 'Question deleted successfully' });
    } else {
        res.status(404).json({ message: 'Question not found' });
    }
});

// Settings API
app.get('/api/settings', (req, res) => {
    const settings = readJSONFile(SETTINGS_PATH, { duration: 5, correctMark: 3, incorrectMark: -1 });
    res.json(settings);
});

app.post('/api/settings', (req, res) => {
    const newSettings = req.body;
    writeJSONFile(SETTINGS_PATH, newSettings);
    res.status(200).json(newSettings);
});

// Results API
app.get('/api/results', (req, res) => {
    const results = readJSONFile(RESULTS_PATH, []);
    res.json(results);
});

app.post('/api/results', (req, res) => {
    const results = readJSONFile(RESULTS_PATH, []);
    const newResult = req.body;
    newResult.timestamp = new Date().toISOString();
    results.push(newResult);
    writeJSONFile(RESULTS_PATH, results);
    res.status(201).json(newResult);
});


app.listen(PORT, () => {
    console.log(`🚀 Mock Test server running on http://localhost:${PORT}`);
});