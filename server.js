require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Failed:', err));

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
  academicSession: { type: String }, // ✅ जोड़ा गया: एकेडमिक सेशन
  attendance: { type: String },      // ✅ जोड़ा गया: अटेंडेंस
  fullMarks: { type: Number, required: true },
  subjects: [{
    name: { type: String, required: true },
    marks: { type: Number, required: true }
  }],
  coScholastic: [{                    // ✅ जोड़ा गया: को-स्कॉलैस्टिक एरिया
    name: { type: String, required: true },
    grade: { type: String, required: true }
  }],
  total: { type: Number },
  percent: { type: Number },
  rank: { type: Number }
});

studentResultSchema.pre('save', async function(next) {
  // यदि कोई विषय नहीं हैं, तो कुल और प्रतिशत 0 होंगे
  const totalSubjects = this.subjects.length;
  // सुनिश्चित करें कि fullMarks मौजूद है ताकि गणना त्रुटि न हो
  const maxPossibleMarks = this.subjects.reduce((sum, sub) => sum + this.fullMarks, 0); 
  
  this.total = this.subjects.reduce((sum, sub) => sum + sub.marks, 0);
  this.percent = maxPossibleMarks > 0 ? (this.total / maxPossibleMarks) * 100 : 0;


  if (this.isNew || this.isModified('total') || this.isModified('percent') || this.isModified('examTerm')) {
    const studentsInSameGroup = await this.constructor.find({
      class: this.class,
      section: this.section,
      examTerm: this.examTerm
    }).sort({ percent: -1, total: -1 });

    // रैंक अपडेट करें
    for (let i = 0; i < studentsInSameGroup.length; i++) {
      studentsInSameGroup[i].rank = i + 1;
      await studentsInSameGroup[i].save({ validateBeforeSave: false });
    }
    
    // वर्तमान छात्र की रैंक सेट करें यदि वह नया है
    if (this.isNew) {
        const currentStudentRank = studentsInSameGroup.findIndex(s =>
            s._id.equals(this._id)
        );
        if (currentStudentRank !== -1) {
            this.rank = currentStudentRank + 1;
        }
    } else {
        // यदि मौजूदा छात्र को अपडेट किया जा रहा है, तो उसकी रैंक फिर से गणना करें
        const updatedStudentInGroup = studentsInSameGroup.find(s => s._id.equals(this._id));
        if (updatedStudentInGroup) {
            this.rank = updatedStudentInGroup.rank;
        }
    }
  }
  next();
});

const StudentResult = mongoose.model('StudentResult', studentResultSchema);

// --- FIX #1: Added `passingMarks` to the Schema ---
const subjectSchema = new mongoose.Schema({
  class: { type: String, required: true },
  section: { type: String, required: true },
  term: { type: String, required: true },
  name: { type: String, required: true },
  fullMarks: { type: Number, required: true },
  passingMarks: { type: Number } // This field was added
});

const Subject = mongoose.model('Subject', subjectSchema);

// --- API Endpoints for Subject Setup ---

app.get('/api/subjects', async (req, res) => {
  try {
    const subjects = await Subject.find({});
    res.status(200).json(subjects);
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).json({ error: 'Subjects प्राप्त करने में त्रुटि हुई।' });
  }
});

app.post('/api/subjects', async (req, res) => {
  // --- FIX #2: Receiving and saving `passingMarks` when a subject is created ---
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
    console.error('Error adding subject:', err);
    res.status(500).json({ error: 'Subject जोड़ने में सर्वर त्रुटि हुई।' });
  }
});

app.put('/api/subjects', async (req, res) => {
  const { original, updated } = req.body;
  
  try {
    const result = await Subject.updateOne(
      { 
        class: original.class, 
        section: original.section, 
        term: original.term, 
        name: original.name 
      },
      { 
        // --- FIX #3: Updating `passingMarks` when a subject is edited ---
        $set: { 
          class: updated.class, 
          section: updated.section, 
          term: updated.term, 
          name: updated.name, 
          fullMarks: updated.fullMarks,
          passingMarks: updated.passingMarks // This field was added for update
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Subject not found.' });
    }
    res.status(200).json({ message: 'Subject successfully updated.' });

  } catch (error) {
    console.error('Error updating subject:', error);
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
    console.error('Error deleting subject:', error);
    res.status(500).json({ error: 'Failed to delete subject.' });
  }
});

// --- Teacher Routes ---

app.post('/teacher-login', async (req, res) => {
  const { name, class: teacherClass, section, password } = req.body;
  try {
    const teacher = await Teacher.findOne({ name, class: teacherClass, section, password });
    if (teacher) {
      res.status(200).json({ message: 'Login successful', teacher: { id: teacher.teacherId, name: teacher.name, class: teacher.class, section: teacher.section } });
    } else {
      res.status(401).json({ error: 'Invalid credentials or teacher not found.' });
    }
  } catch (error) {
    console.error('Teacher login error:', error);
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
    console.error('Error adding teacher:', error);
    res.status(500).json({ error: 'शिक्षक को जोड़ते समय सर्वर त्रुटि हुई।' });
  }
});

app.get('/get-teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find({});
    res.status(200).json(teachers.map(t => ({ id: t.teacherId, name: t.name, class: t.class, section: t.section })));
  } catch (error) {
    console.error('Error fetching teachers:', error);
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
            const existingTeacherInNewClassSection = await Teacher.findOne({
                class: teacherClass || teacher.class,
                section: section || teacher.section,
                teacherId: { $ne: teacherId }
            });
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
        console.error('Error updating teacher:', error);
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
    console.error('Error deleting teacher:', error);
    res.status(500).json({ error: 'शिक्षक को हटाते समय सर्वर त्रुटि हुई।' });
  }
});

// --- Student Result Routes ---

// ✅ FIXED: Save (Add/Update) Student Result
app.post('/save-student', async (req, res) => {
  const { 
    name, fatherName, motherName, rollNumber, dob, 
    class: studentClass, section, examTerm, academicSession, attendance, // ✅ जोड़ा गया
    subjects, coScholastic, fullMarks, id // ✅ जोड़ा गया coScholastic
  } = req.body;
  const { role, teacherClass, teacherSection } = req.query; 

  if (role === 'teacher' && (studentClass !== teacherClass || section !== teacherSection)) {
      return res.status(403).json({ error: 'आप केवल अपने क्लास के छात्रों के परिणाम सहेज सकते हैं।' });
  }

  try {
    let studentResult;
    if (id) {
      studentResult = await StudentResult.findById(id);
      if (!studentResult) {
        return res.status(404).json({ error: 'अपडेट करने के लिए छात्र परिणाम नहीं मिला।' });
      }
      studentResult.name = name;
      studentResult.fatherName = fatherName;
      studentResult.motherName = motherName;
      studentResult.rollNumber = rollNumber;
      studentResult.dob = dob;
      studentResult.class = studentClass;
      studentResult.section = section;
      studentResult.examTerm = examTerm;
      studentResult.academicSession = academicSession; // ✅ अपडेट किया गया
      studentResult.attendance = attendance;           // ✅ अपडेट किया गया
      studentResult.subjects = subjects;
      studentResult.coScholastic = coScholastic;       // ✅ अपडेट किया गया
      studentResult.fullMarks = fullMarks;
    } else {
      studentResult = new StudentResult({
        name, fatherName, motherName, rollNumber, dob, 
        class: studentClass, section, examTerm, academicSession, attendance, // ✅ जोड़ा गया
        subjects, coScholastic, fullMarks // ✅ जोड़ा गया coScholastic
      });
    }

    await studentResult.save();
    res.status(200).json({ message: 'छात्र परिणाम सफलतापूर्वक सहेजा/अपडेट किया गया!' });
  } catch (error) {
    console.error('Error saving student result:', error);
    res.status(500).json({ error: 'छात्र परिणाम सहेजते समय सर्वर त्रुटि हुई।' });
  }
});

// ✅ FIXED: Get Student Results
app.get('/get-students', async (req, res) => {
    const { role, teacherClass, teacherSection, rollNumber, name, dob, studentClass, section, examTerm } = req.query;
    let filter = {};

    if (role === 'teacher' && teacherClass && teacherSection) {
        filter = { class: teacherClass, section: teacherSection };
        if (rollNumber) {
            filter.rollNumber = rollNumber;
        }
    } else if (role !== 'teacher') {
        if (name) filter.name = new RegExp(name, 'i');
        if (rollNumber) filter.rollNumber = rollNumber;
        if (dob) filter.dob = dob;
        if (studentClass) filter.class = studentClass;
        if (section) filter.section = section;
        if (examTerm) filter.examTerm = examTerm;
    }

    try {
        const studentResults = await StudentResult.find(filter).sort({ rank: 1 });
        res.status(200).json(studentResults);
    } catch (error) {
        console.error('Error fetching student results:', error);
        res.status(500).json({ error: 'छात्र परिणाम प्राप्त करते समय सर्वर त्रुटि हुई।' });
    }
});

app.get('/get-student/:id', async (req, res) => {
  const studentId = req.params.id;
  const { role, teacherClass, teacherSection } = req.query;

  try {
    const student = await StudentResult.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'छात्र परिणाम नहीं मिला।' });
    }

    if (role === 'teacher' && (student.class !== teacherClass || student.section !== teacherSection)) {
        return res.status(403).json({ error: 'आप इस छात्र को देखने/संपादित करने के लिए अधिकृत नहीं हैं।' });
    }

    res.status(200).json(student);
  } catch (error) {
    console.error('Error fetching single student result:', error);
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
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'छात्र परिणाम हटाते समय सर्वर त्रुटि हुई।' });
  }
});

// --- Legacy JSON file routes (Not recommended for use with MongoDB) ---
// These are kept for reference but should ideally be removed to avoid confusion.

app.post('/add-student-details', (req, res) => {
    // ... (Your original JSON file handling code)
});
app.get('/get-all-students', (req, res) => {
    // ... (Your original JSON file handling code)
});
app.get('/get-student-details/:id', (req, res) => {
    // ... (Your original JSON file handling code)
});
app.put('/update-student-details/:id', (req, res) => {
    // ... (Your original JSON file handling code)
});
app.delete('/delete-student-details/:id', (req, res) => {
    // ... (Your original JSON file handling code)
});
app.get("/get-student-by-roll", (req, res) => {
    // ... (Your original JSON file handling code)
});
app.post("/add-student-result/:id", (req, res) => {
    // ... (Your original JSON file handling code)
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});