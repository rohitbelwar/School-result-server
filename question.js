// --- आवश्यक पैकेजेज ---
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// --- सर्वर सेटअप ---
const app = express();
const PORT = 3001; // यह एक अलग पोर्ट पर चलेगा (जैसे 3001)

// --- Middleware ---
app.use(cors()); // अलग-अलग ऑरिजिन से आने वाले अनुरोधों (requests) को अनुमति देने के लिए
app.use(express.json()); // JSON अनुरोधों को समझने के लिए

// --- JSON फ़ाइलों के लिए पथ (Path) ---
// यह सुनिश्चित करता है कि फाइलें सही जगह पर खोजी जाएं
const QUESTIONS_PATH = path.join(__dirname, 'questions.json');
const RESULTS_PATH = path.join(__dirname, 'results.json');
const SETTINGS_PATH = path.join(__dirname, 'settings.json');

// --- हेल्पर फंक्शन: JSON फ़ाइल को पढ़ना ---
const readJSONFile = (filePath, defaultData = []) => {
    try {
        // अगर फ़ाइल मौजूद है, तो उसे पढ़ें और पार्स करें
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath, 'utf-8');
            // अगर फ़ाइल खाली है, तो डिफ़ॉल्ट डेटा लौटाएं
            return fileData ? JSON.parse(fileData) : defaultData;
        }
        // अगर फ़ाइल मौजूद नहीं है, तो डिफ़ॉल्ट डेटा लौटाएं
        return defaultData;
    } catch (error) {
        console.error(`Error reading or parsing ${path.basename(filePath)}:`, error);
        return defaultData; // किसी भी त्रुटि पर डिफ़ॉल्ट डेटा लौटाएं
    }
};

// --- हेल्पर फंक्शन: JSON फ़ाइल में लिखना ---
const writeJSONFile = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error(`Error writing to ${path.basename(filePath)}:`, error);
    }
};


// ===================================================
// --- API Routes (सर्वर के एंडपॉइंट्स) ---
// ===================================================

// 1. प्रश्नों (Questions) के लिए API
app.get('/api/questions', (req, res) => {
    console.log('Received request: GET /api/questions'); // लॉगिंग
    const questions = readJSONFile(QUESTIONS_PATH, []);
    res.json(questions);
});

app.post('/api/questions', (req, res) => {
    console.log('Received request: POST /api/questions'); // लॉगिंग
    const questions = readJSONFile(QUESTIONS_PATH, []);
    const newQuestion = req.body;
    newQuestion.id = Date.now(); // एक यूनिक आईडी बनाएं
    questions.push(newQuestion);
    writeJSONFile(QUESTIONS_PATH, questions);
    res.status(201).json(newQuestion);
});

app.delete('/api/questions/:id', (req, res) => {
    const questionId = parseInt(req.params.id, 10);
    console.log(`Received request: DELETE /api/questions/${questionId}`); // लॉगिंग
    let questions = readJSONFile(QUESTIONS_PATH, []);
    const initialLength = questions.length;
    questions = questions.filter(q => q.id !== questionId);

    if (questions.length < initialLength) {
        writeJSONFile(QUESTIONS_PATH, questions);
        res.status(200).json({ message: 'Question deleted successfully' });
    } else {
        res.status(404).json({ message: 'Question not found' });
    }
});

// 2. सेटिंग्स (Settings) के लिए API
app.get('/api/settings', (req, res) => {
    console.log('Received request: GET /api/settings'); // लॉगिंग
    const settings = readJSONFile(SETTINGS_PATH, { duration: 5, correctMark: 3, incorrectMark: -1 });
    res.json(settings);
});

app.post('/api/settings', (req, res) => {
    console.log('Received request: POST /api/settings'); // लॉगिंग
    const newSettings = req.body;
    writeJSONFile(SETTINGS_PATH, newSettings);
    res.status(200).json(newSettings);
});

// 3. परिणामों (Results) के लिए API
app.get('/api/results', (req, res) => {
    console.log('Received request: GET /api/results'); // लॉगिंग
    const results = readJSONFile(RESULTS_PATH, []);
    res.json(results);
});

app.post('/api/results', (req, res) => {
    console.log('Received request: POST /api/results'); // लॉगिंग
    const results = readJSONFile(RESULTS_PATH, []);
    const newResult = req.body;
    newResult.timestamp = new Date().toISOString(); // परिणाम का समय जोड़ें
    results.push(newResult);
    writeJSONFile(RESULTS_PATH, results);
    res.status(201).json(newResult);
});


// --- सर्वर को शुरू करना ---
app.listen(PORT, () => {
    console.log(`🚀 Mock Test server is running successfully on http://localhost:${PORT}`);
    console.log("Waiting for requests from Mock_test.html and exam_control.html...");
});