require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for face descriptors
app.use(express.static(path.join(__dirname, 'public')));


const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Failed:', err));

// --- NEW SCHEMAS FOR FACE ATTENDANCE ---

const faceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    class: { type: String, required: true },
    section: { type: String, required: true },
    rollNumber: { type: String, required: true },
    descriptors: { type: [[Number]], required: true }
});
// Create a compound index to ensure one face registration per student
faceSchema.index({ class: 1, section: 1, rollNumber: 1 }, { unique: true });
const FaceData = mongoose.model('FaceData', faceSchema);

const attendanceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    class: { type: String, required: true },
    section: { type: String, required: true },
    rollNumber: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, default: 'Present' }
});
const Attendance = mongoose.model('Attendance', attendanceSchema);


// --- EXISTING SCHEMAS (FROM ORIGINAL FILE) ---
const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  class: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  teacherId: { type: Number, unique: true }
});

teacherSchema.pre('save', async function(next) {
  if (this.isNew) {
    const lastTeacher = await this.constructor.findOne({}, {}, { sort: { 'teacherId': -1 } });
    this.teacherId = lastTeacher ? lastTeacher.teacherId + 1 : 1;
  }
  next();
});
const Teacher = mongoose.model('Teacher', teacherSchema);

const studentResultSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  rollNumber: { type: String, required: true, trim: true },
  dob: { type: String, required: true },
  class: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  examTerm: { type: String, required: true, trim: true },
  academicSession: { type: String },
  attendance: { type: String },
  fullMarks: { type: Number, required: true },
  subjects: [{ name: { type: String, required: true }, marks: { type: Number, required: true } }],
  coScholastic: [{ name: { type: String, required: true }, grade: { type: String, required: true } }],
  discipline: { type: String },
  total: { type: Number },
  percent: { type: Number },
  rank: { type: Number }
});

studentResultSchema.pre('save', async function(next) {
  const totalSubjects = this.subjects.length;
  const maxPossibleMarks = this.fullMarks * totalSubjects;
  this.total = this.subjects.reduce((sum, sub) => sum + sub.marks, 0);
  this.percent = maxPossibleMarks > 0 ? (this.total / maxPossibleMarks) * 100 : 0;
  if (this.isNew || this.isModified('total') || this.isModified('percent') || this.isModified('examTerm')) {
    const studentsInSameGroup = await this.constructor.find({ class: this.class, section: this.section, examTerm: this.examTerm }).sort({ percent: -1, total: -1 });
    for (let i = 0; i < studentsInSameGroup.length; i++) {
      studentsInSameGroup[i].rank = i + 1;
      await studentsInSameGroup[i].save({ validateBeforeSave: false });
    }
    const currentStudentRank = studentsInSameGroup.findIndex(s => s._id.equals(this._id));
    if (currentStudentRank !== -1) {
      this.rank = currentStudentRank + 1;
    }
  }
  next();
});
const StudentResult = mongoose.model('StudentResult', studentResultSchema);

const subjectSchema = new mongoose.Schema({
  class: { type: String, required: true },
  section: { type: String, required: true },
  term: { type: String, required: true },
  name: { type: String, required: true },
  fullMarks: { type: Number, required: true },
  passingMarks: { type: Number }
});
const Subject = mongoose.model('Subject', subjectSchema);

const mockTestQuestionSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  class: { type: String, required: true },
  section: { type: String, required: true },
  subject: { type: String, required: true },
  chapter: { type: String, required: true },
  question: { en: { type: String, required: true } },
  options: [{ en: { type: String, required: true } }],
  correctAnswer: { type: Number, required: true }
});
const MockTestQuestion = mongoose.model('MockTestQuestion', mockTestQuestionSchema);

const mockTestSettingsSchema = new mongoose.Schema({
  singleton: { type: Boolean, default: true, unique: true },
  duration: { type: Number, default: 5 },
  correctMark: { type: Number, default: 3 },
  incorrectMark: { type: Number, default: -1 }
});
const MockTestSettings = mongoose.model('MockTestSettings', mockTestSettingsSchema);

const mockTestResultSchema = new mongoose.Schema({
  studentDetails: { type: Object, required: true },
  answers: { type: Array, required: true },
  score: { type: Object, required: true },
  questions: { type: Array, required: true },
  timestamp: { type: Date, default: Date.now }
});
const MockTestResult = mongoose.model('MockTestResult', mockTestResultSchema);


// --- NEW API ROUTES FOR FACE ATTENDANCE ---
app.post('/api/face/register', async (req, res) => {
  const { name, class: studentClass, section, rollNumber, descriptors } = req.body;
  if (!name || !studentClass || !section || !rollNumber || !descriptors || descriptors.length === 0) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  try {
    const filter = { class: studentClass, section, rollNumber };
    const update = { name, descriptors };
    await FaceData.findOneAndUpdate(filter, update, { upsert: true, new: true });
    res.status(200).json({ message: `Face for ${name} saved!` });
  } catch (error) {
    res.status(500).json({ error: 'Server error saving face data.' });
  }
});

app.get('/api/faces', async (req, res) => {
  try {
    const faces = await FaceData.find({}).lean();
    res.status(200).json(faces);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching face data.' });
  }
});

app.post('/api/attendance', async (req, res) => {
    const { name, class: studentClass, section, rollNumber } = req.body;
    if (!name || !studentClass || !section || !rollNumber) {
        return res.status(400).json({ error: 'Missing student details.' });
    }
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const existingRecord = await Attendance.findOne({
            class: studentClass,
            section,
            rollNumber,
            timestamp: { $gte: today, $lt: tomorrow }
        });

        if (existingRecord) {
            return res.status(200).json({ message: 'Attendance already marked for today.' });
        }
        const newRecord = new Attendance({ name, class: studentClass, section, rollNumber });
        await newRecord.save();
        res.status(201).json({ message: 'Attendance marked successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Server error marking attendance.' });
    }
});

// --- FIXED AND NEW ENDPOINTS ---

// **NEW** This endpoint calculates and returns the summary for today's attendance.
// **नया** यह एंडपॉइंट आज की उपस्थिति के लिए सारांश की गणना करता है और लौटाता है।
app.get('/api/attendance/summary/today', async (req, res) => {
    try {
        // We use StudentResult to get the total count of all students in the school.
        // हम स्कूल में सभी छात्रों की कुल संख्या प्राप्त करने के लिए StudentResult का उपयोग करते हैं।
        const totalStudents = await StudentResult.countDocuments();

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow

        // Count students who are marked as 'Present' today.
        // आज 'उपस्थित' के रूप में चिह्नित छात्रों की गणना करें।
        const presentToday = await Attendance.countDocuments({
            timestamp: { $gte: today, $lt: tomorrow },
            status: 'Present'
        });

        const absentToday = totalStudents - presentToday;

        res.status(200).json({
            totalStudents: totalStudents,
            presentToday: presentToday,
            absentToday: absentToday
        });
    } catch (error) {
        console.error('Error fetching attendance summary:', error);
        res.status(500).json({ error: 'Server error fetching attendance summary.' });
    }
});

// **FIXED** This endpoint now correctly handles the "All Classes" filter.
// **ठीक किया गया** यह एंडपॉइंट अब "All Classes" फ़िल्टर को सही ढंग से संभालता है।
app.get('/api/attendance/report', async (req, res) => {
    const { startDate, endDate, studentClass, section } = req.query;
    
    // Only start and end dates are mandatory.
    // केवल प्रारंभ और समाप्ति तिथियां अनिवार्य हैं।
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start date and end date are required.' });
    }

    try {
        const filter = {
            timestamp: {
                $gte: new Date(startDate),
                $lt: new Date(endDate)
            }
        };

        // If a specific class is chosen (not "All Classes"), add it to the filter.
        // यदि कोई विशिष्ट कक्षा चुनी जाती है ("All Classes" नहीं), तो उसे फ़िल्टर में जोड़ें।
        if (studentClass && studentClass !== 'All Classes' && section) {
            filter.class = studentClass;
            filter.section = section;
        }

        const report = await Attendance.find(filter).sort({ timestamp: -1 }).lean();
        res.status(200).json(report);
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching attendance report.' });
    }
});


// --- ALL EXISTING API ROUTES (FROM ORIGINAL FILE) ---

app.get('/api/subjects', async (req, res) => {
  try {
    const subjects = await Subject.find({}).lean();
    res.status(200).json(subjects);
  } catch (err) {
    res.status(500).json({ error: 'Subjects प्राप्त करने में त्रुटि हुई।' });
  }
});

app.post('/api/subjects', async (req, res) => {
  const { class: subjectClass, section, term, name, fullMarks, passingMarks } = req.body;
  if (!subjectClass || !section || !term || !name || fullMarks == null || passingMarks == null) {
    return res.status(400).json({ error: 'सभी फ़ील्ड आवश्यक हैं।' });
  }
  try {
    const existing = await Subject.findOne({ class: subjectClass, section, term, name });
    if (existing) {
      return res.status(400).json({ error: 'यह विषय पहले से मौजूद है।' });
    }
    const subject = new Subject({ class: subjectClass, section, term, name, fullMarks, passingMarks });
    await subject.save();
    res.status(201).json({ message: 'Subject सफलतापूर्वक जोड़ा गया!' });
  } catch (err) {
    res.status(500).json({ error: 'Subject जोड़ने में सर्वर त्रुटि हुई।' });
  }
});

app.put('/api/subjects', async (req, res) => {
  const { original, updated } = req.body;
  try {
    const result = await Subject.updateOne(
      { class: original.class, section: original.section, term: original.term, name: original.name },
      { $set: { class: updated.class, section: updated.section, term: updated.term, name: updated.name, fullMarks: updated.fullMarks, passingMarks: updated.passingMarks } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Subject not found.' });
    }
    res.status(200).json({ message: 'Subject successfully updated.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update subject.' });
  }
});

app.delete('/api/subjects', async (req, res) => {
  const { class: subjectClass, section, term, name } = req.body;
  try {
    const result = await Subject.deleteOne({ class: subjectClass, section, term, name });
    if (result.deletedCount > 0) {
      res.status(200).json({ message: 'Subject successfully deleted!' });
    } else {
      res.status(404).json({ error: 'Subject not found.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subject.' });
  }
});

app.post('/teacher-login', async (req, res) => {
  const { name, class: teacherClass, section, password } = req.body;
  try {
    const teacher = await Teacher.findOne({ name, class: teacherClass, section, password }).lean();
    if (teacher) {
      res.status(200).json({ message: 'Login successful', teacher: { id: teacher.teacherId, name: teacher.name, class: teacher.class, section: teacher.section } });
    } else {
      res.status(401).json({ error: 'Invalid credentials or teacher not found.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error during login.' });
  }
});

app.post('/add-teacher', async (req, res) => {
  const { name, class: teacherClass, section, password } = req.body;
  try {
    const existingTeacher = await Teacher.findOne({ class: teacherClass, section: section });
    if (existingTeacher) {
      return res.status(400).json({ error: 'इस क्लास और सेक्शन के लिए एक शिक्षक पहले से मौजूद है।' });
    }
    const newTeacher = new Teacher({ name, class: teacherClass, section, password });
    await newTeacher.save();
    res.status(201).json({ message: 'शिक्षक सफलतापूर्वक जोड़ा गया!' });
  } catch (error) {
    res.status(500).json({ error: 'शिक्षक को जोड़ते समय सर्वर त्रुटि हुई।' });
  }
});

app.get('/get-teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find({}).lean();
    res.status(200).json(teachers.map(t => ({ id: t.teacherId, name: t.name, class: t.class, section: t.section })));
  } catch (error) {
    res.status(500).json({ error: 'शिक्षकों को प्राप्त करते समय सर्वर त्रुटि हुई।' });
  }
});

app.put('/update-teacher/:id', async (req, res) => {
  const teacherId = req.params.id;
  const { name, class: teacherClass, section, password } = req.body;
  try {
    const teacher = await Teacher.findOne({ teacherId: teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'शिक्षक नहीं मिला।' });
    }
    if ((teacherClass && teacherClass !== teacher.class) || (section && section !== teacher.section)) {
      const existingTeacherInNewClassSection = await Teacher.findOne({ class: teacherClass || teacher.class, section: section || teacher.section, teacherId: { $ne: teacherId } });
      if (existingTeacherInNewClassSection) {
        return res.status(400).json({ error: 'इस क्लास और सेक्शन के लिए एक शिक्षक पहले से मौजूद है।' });
      }
    }
    if (name) teacher.name = name;
    if (teacherClass) teacher.class = teacherClass;
    if (section) teacher.section = section;
    if (password) teacher.password = password;
    await teacher.save();
    res.status(200).json({ message: 'शिक्षक सफलतापूर्वक अपडेट किया गया!' });
  } catch (error) {
    res.status(500).json({ error: 'शिक्षक को अपडेट करते समय सर्वर त्रुटि हुई।' });
  }
});

app.delete('/delete-teacher/:id', async (req, res) => {
  const teacherId = req.params.id;
  try {
    const result = await Teacher.deleteOne({ teacherId: teacherId });
    if (result.deletedCount > 0) {
      res.status(200).json({ message: 'शिक्षक सफलतापूर्वक हटा दिया गया।' });
    } else {
      res.status(404).json({ error: 'शिक्षक नहीं मिला।' });
    }
  } catch (error) {
    res.status(500).json({ error: 'शिक्षक को हटाते समय सर्वर त्रुटि हुई।' });
  }
});

app.post('/save-student', async (req, res) => {
  const { name, fatherName, motherName, rollNumber, dob, class: studentClass, section, examTerm, academicSession, attendance, discipline, subjects, coScholastic, fullMarks, id } = req.body;
  const { role, teacherClass, teacherSection } = req.query;
  if (role === 'teacher' && (studentClass !== teacherClass || section !== teacherSection)) {
    return res.status(403).json({ error: 'आप केवल अपने क्लास के छात्रों के परिणाम सहेज सकते हैं।' });
  }
  try {
    let studentResult;
    if (id) {
      studentResult = await StudentResult.findById(id);
      if (!studentResult) { return res.status(404).json({ error: 'अपडेट करने के लिए छात्र परिणाम नहीं मिला।' }); }
      studentResult.name = name;
      studentResult.fatherName = fatherName;
      studentResult.motherName = motherName;
      studentResult.rollNumber = rollNumber;
      studentResult.dob = dob;
      studentResult.class = studentClass;
      studentResult.section = section;
      studentResult.examTerm = examTerm;
      studentResult.academicSession = academicSession;
      studentResult.attendance = attendance;
      studentResult.discipline = discipline;
      studentResult.subjects = subjects;
      studentResult.coScholastic = coScholastic;
      studentResult.fullMarks = fullMarks;
    } else {
      studentResult = new StudentResult({ name, fatherName, motherName, rollNumber, dob, class: studentClass, section, examTerm, academicSession, attendance, discipline, subjects, coScholastic, fullMarks });
    }
    await studentResult.save();
    res.status(200).json({ message: 'छात्र परिणाम सफलतापूर्वक सहेजा/अपडेट किया गया!' });
  } catch (error) {
    res.status(500).json({ error: 'छात्र परिणाम सहेजते समय सर्वर त्रुटि हुई।' });
  }
});

app.get('/get-students', async (req, res) => {
  const { role, teacherClass, teacherSection, rollNumber, name, dob, studentClass, section, examTerm } = req.query;
  let filter = {};
  if (role === 'teacher' && teacherClass && teacherSection) {
    filter = { class: teacherClass, section: teacherSection };
    if (rollNumber) { filter.rollNumber = rollNumber; }
  } else if (role !== 'teacher') {
    if (name) filter.name = new RegExp(name, 'i');
    if (rollNumber) filter.rollNumber = rollNumber;
    if (dob) filter.dob = dob;
    if (studentClass) filter.class = studentClass;
    if (section) filter.section = section;
    if (examTerm) filter.examTerm = examTerm;
  }
  try {
    const studentResults = await StudentResult.find(filter).sort({ rank: 1 }).lean();
    res.status(200).json(studentResults);
  } catch (error) {
    res.status(500).json({ error: 'छात्र परिणाम प्राप्त करते समय सर्वर त्रुटि हुई।' });
  }
});

app.get('/get-student/:id', async (req, res) => {
  const studentId = req.params.id;
  const { role, teacherClass, teacherSection } = req.query;
  try {
    const student = await StudentResult.findById(studentId).lean();
    if (!student) {
      return res.status(404).json({ error: 'छात्र परिणाम नहीं मिला।' });
    }
    if (role === 'teacher' && (student.class !== teacherClass || student.section !== teacherSection)) {
      return res.status(403).json({ error: 'आप इस छात्र को देखने/संपादित करने के लिए अधिकृत नहीं हैं।' });
    }
    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ error: 'एकल छात्र परिणाम प्राप्त करते समय सर्वर त्रुटि हुई।' });
  }
});

app.delete('/delete-student/:id', async (req, res) => {
  const studentId = req.params.id;
  const { role, teacherClass, teacherSection } = req.query;
  try {
    const studentToDelete = await StudentResult.findById(studentId);
    if (!studentToDelete) {
      return res.status(404).json({ error: 'हटाने के लिए छात्र परिणाम नहीं मिला।' });
    }
    if (role === 'teacher' && (studentToDelete.class !== teacherClass || studentToDelete.section !== teacherSection)) {
      return res.status(403).json({ error: 'आप इस छात्र को हटाने के लिए अधिकृत नहीं हैं।' });
    }
    await StudentResult.deleteOne({ _id: studentId });
    res.status(200).json({ message: 'छात्र परिणाम सफलतापूर्वक हटा दिया गया।' });
  } catch (error) {
    res.status(500).json({ error: 'छात्र परिणाम हटाते समय सर्वर त्रुटि हुई।' });
  }
});

app.get('/api/questions', async (req, res) => {
  try {
    const questions = await MockTestQuestion.find({}).lean();
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching questions', error });
  }
});

app.post('/api/questions', async (req, res) => {
  try {
    const newQuestionData = req.body;
    const lastQuestion = await MockTestQuestion.findOne({}, {}, { sort: { 'id': -1 } });
    const nextId = (lastQuestion && typeof lastQuestion.id === 'number') ? lastQuestion.id + 1 : 1;
    newQuestionData.id = nextId;
    const newQuestion = new MockTestQuestion(newQuestionData);
    await newQuestion.save();
    res.status(201).json(newQuestion);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error: ' + error.message, error: error });
    }
    res.status(500).json({ message: 'Error adding question', error: error.message });
  }
});

app.post('/api/questions/bulk', async (req, res) => {
  try {
    const questionsData = req.body;
    if (!Array.isArray(questionsData) || questionsData.length === 0) {
      return res.status(400).json({ message: 'Request body must be a non-empty array of questions.' });
    }
    const lastQuestion = await MockTestQuestion.findOne({}, {}, { sort: { 'id': -1 } });
    let nextId = (lastQuestion && typeof lastQuestion.id === 'number') ? lastQuestion.id + 1 : 1;
    const questionsToInsert = questionsData.map(q => ({ ...q, id: nextId++ }));
    const insertedQuestions = await MockTestQuestion.insertMany(questionsToInsert);
    res.status(201).json({ message: `Successfully added ${insertedQuestions.length} questions.`, data: insertedQuestions });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error: ' + error.message, error: error });
    }
    res.status(500).json({ message: 'Error adding questions in bulk', error: error.message });
  }
});


app.delete('/api/questions/:id', async (req, res) => {
  try {
    const questionId = parseInt(req.params.id, 10);
    const result = await MockTestQuestion.deleteOne({ id: questionId });
    if (result.deletedCount > 0) {
      res.status(200).json({ message: 'Question deleted successfully' });
    } else {
      res.status(404).json({ message: 'Question not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting question', error });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    let settings = await MockTestSettings.findOne({ singleton: true }).lean();
    if (!settings) {
      settings = await new MockTestSettings({ duration: 5, correctMark: 3, incorrectMark: -1 }).save();
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const newSettings = req.body;
    const updatedSettings = await MockTestSettings.findOneAndUpdate({ singleton: true }, newSettings, { new: true, upsert: true }).lean();
    res.status(200).json(updatedSettings);
  } catch (error) {
    res.status(500).json({ message: 'Error saving settings', error });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const results = await MockTestResult.find({}).sort({ timestamp: -1 }).lean();
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching results', error });
  }
});

app.post('/api/results', async (req, res) => {
  try {
    const newResult = new MockTestResult(req.body);
    await newResult.save();
    res.status(201).json(newResult);
  } catch (error) {
    res.status(500).json({ message: 'Error saving result', error });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});