require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000; // Render.com या किसी भी होस्टिंग के लिए PORT पर्यावरण वेरिएबल का उपयोग करें

// Middleware
app.use(cors()); // CORS सक्षम करें ताकि आपका फ्रंटएंड कनेक्ट हो सके
app.use(bodyParser.json());
app.use(express.json()); // express.json() भी JSON पार्सिंग के लिए है

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI; // .env फाइल से URI का उपयोग करें
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- Mongoose Schemas ---

// Teacher Schema
const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  class: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  teacherId: { type: Number, unique: true } // Auto-incrementing ID for teachers
});

// Pre-save hook to generate auto-incrementing teacherId
teacherSchema.pre('save', async function(next) {
  if (this.isNew) {
    const lastTeacher = await this.constructor.findOne({}, {}, { sort: { 'teacherId': -1 } });
    this.teacherId = lastTeacher ? lastTeacher.teacherId + 1 : 1;
  }
  next();
});

const Teacher = mongoose.model('Teacher', teacherSchema);

// Student Result Schema
const studentResultSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  rollNumber: { type: String, required: true, trim: true },
  dob: { type: String, required: true }, // YYYY-MM-DD format
  class: { type: String, required: true, trim: true }, // e.g., "III-A"
  section: { type: String, required: true, trim: true },
  examTerm: { type: String, required: true, trim: true },
  fullMarks: { type: Number, required: true }, // Max marks per subject
  subjects: [{
    name: { type: String, required: true },
    marks: { type: Number, required: true }
  }],
  total: { type: Number },
  percent: { type: Number },
  rank: { type: Number }
});

// Pre-save hook to calculate total, percent and assign rank
studentResultSchema.pre('save', async function(next) {
  const totalSubjects = this.subjects.length;
  this.total = this.subjects.reduce((sum, sub) => sum + sub.marks, 0);
  this.percent = (this.total / (totalSubjects * this.fullMarks)) * 100;

  // Recalculate ranks for the specific class and exam term
  if (this.isNew || this.isModified('total') || this.isModified('percent')) {
    const studentsInSameGroup = await this.constructor.find({
      class: this.class,
      section: this.section,
      examTerm: this.examTerm
    }).sort({ percent: -1, total: -1 }); // Sort by percentage, then total

    // Assign ranks
    for (let i = 0; i < studentsInSameGroup.length; i++) {
      studentsInSameGroup[i].rank = i + 1;
      await studentsInSameGroup[i].save({ validateBeforeSave: false }); // Save without triggering pre-save hook again
    }
    // Set rank for the current student being saved (if it's new)
    if (this.isNew) {
        const currentStudentRank = studentsInSameGroup.findIndex(s =>
            s.name === this.name && s.rollNumber === this.rollNumber
        );
        if (currentStudentRank !== -1) {
            this.rank = currentStudentRank + 1;
        }
    }
  }
  next();
});

const StudentResult = mongoose.model('StudentResult', studentResultSchema);

// --- API Endpoints ---

// Teacher Login
app.post('/teacher-login', async (req, res) => {
  const { name, class: teacherClass, section, password } = req.body;
  try {
    const teacher = await Teacher.findOne({ name, class: teacherClass, section, password }); // In a real app, hash password
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

// Add Teacher
app.post('/add-teacher', async (req, res) => {
  const { name, class: teacherClass, section, password } = req.body;
  try {
    // Check if teacher with same class and section already exists
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

// Get All Teachers
app.get('/get-teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find({});
    res.status(200).json(teachers.map(t => ({ id: t.teacherId, name: t.name, class: t.class, section: t.section })));
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: 'शिक्षकों को प्राप्त करते समय सर्वर त्रुटि हुई।' });
  }
});

// Update Teacher
app.put('/update-teacher/:id', async (req, res) => {
    const teacherId = req.params.id;
    const { name, class: teacherClass, section, password } = req.body;

    try {
        const teacher = await Teacher.findOne({ teacherId: teacherId });
        if (!teacher) {
            return res.status(404).json({ error: 'शिक्षक नहीं मिला।' });
        }

        // Check if updating class/section would conflict with another existing teacher
        if ((teacherClass && teacherClass !== teacher.class) || (section && section !== teacher.section)) {
            const existingTeacherInNewClassSection = await Teacher.findOne({
                class: teacherClass || teacher.class,
                section: section || teacher.section,
                teacherId: { $ne: teacherId } // Exclude current teacher
            });
            if (existingTeacherInNewClassSection) {
                return res.status(400).json({ error: 'इस क्लास और सेक्शन के लिए एक शिक्षक पहले से मौजूद है।' });
            }
        }

        if (name) teacher.name = name;
        if (teacherClass) teacher.class = teacherClass;
        if (section) teacher.section = section;
        if (password) teacher.password = password; // In a real app, hash password here

        await teacher.save();
        res.status(200).json({ message: 'शिक्षक सफलतापूर्वक अपडेट किया गया!' });
    } catch (error) {
        console.error('Error updating teacher:', error);
        res.status(500).json({ error: 'शिक्षक को अपडेट करते समय सर्वर त्रुटि हुई।' });
    }
});


// Delete Teacher
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


// Save (Add/Update) Student Result
app.post('/save-student', async (req, res) => {
  const { name, fatherName, motherName, rollNumber, dob, class: studentClass, section, examTerm, subjects, fullMarks, id } = req.body;
  const { role, teacherClass, teacherSection } = req.query; // Query params from teacher dashboard

  // Server-side validation for teacher's class
  if (role === 'teacher' && (studentClass !== teacherClass || section !== teacherSection)) {
      return res.status(403).json({ error: 'आप केवल अपने क्लास के छात्रों के परिणाम सहेज सकते हैं।' });
  }

  try {
    let studentResult;
    if (id) { // If ID is provided, try to update
      studentResult = await StudentResult.findById(id);
      if (!studentResult) {
        return res.status(404).json({ error: 'अपडेट करने के लिए छात्र परिणाम नहीं मिला।' });
      }

      // Update fields
      studentResult.name = name;
      studentResult.fatherName = fatherName;
      studentResult.motherName = motherName;
      studentResult.rollNumber = rollNumber;
      studentResult.dob = dob;
      studentResult.class = studentClass; // Can change if class/section change is allowed (teacher side logic needs to match)
      studentResult.section = section;
      studentResult.examTerm = examTerm;
      studentResult.subjects = subjects;
      studentResult.fullMarks = fullMarks;

    } else { // Otherwise, create new
      studentResult = new StudentResult({
        name, fatherName, motherName, rollNumber, dob, class: studentClass, section, examTerm, subjects, fullMarks
      });
    }

    await studentResult.save();
    res.status(200).json({ message: 'छात्र परिणाम सफलतापूर्वक सहेजा/अपडेट किया गया!' });
  } catch (error) {
    console.error('Error saving student result:', error);
    res.status(500).json({ error: 'छात्र परिणाम सहेजते समय सर्वर त्रुटि हुई।' });
  }
});

// Get Student Results (filtered by teacher's class if role=teacher, or all for public)
app.get('/get-students', async (req, res) => {
    const { role, teacherClass, teacherSection } = req.query; // Query parameters
    let filter = {};

    if (role === 'teacher' && teacherClass && teacherSection) {
        filter = { class: teacherClass, section: teacherSection };
    } else if (role !== 'teacher') {
        // For public access (result.html), allow fetching all or by specific criteria if provided in query
        const { name, rollNumber, dob, studentClass, section, examTerm } = req.query;
        if (name) filter.name = new RegExp(name, 'i'); // Case-insensitive search
        if (rollNumber) filter.rollNumber = rollNumber;
        if (dob) filter.dob = dob;
        if (studentClass) filter.class = studentClass;
        if (section) filter.section = section;
        if (examTerm) filter.examTerm = examTerm;
    }

    try {
        const studentResults = await StudentResult.find(filter).sort({ class: 1, section: 1, examTerm: 1, percent: -1, total: -1 });

        // Recalculate and update ranks for each group (class, section, examTerm)
        const groupedResults = studentResults.reduce((acc, student) => {
            const key = `${student.class}-${student.section}-${student.examTerm}`;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(student);
            return acc;
        }, {});

        for (const key in groupedResults) {
            groupedResults[key].sort((a, b) => {
                if (b.percent !== a.percent) return b.percent - a.percent;
                return b.total - a.total;
            });
            for (let i = 0; i < groupedResults[key].length; i++) {
                groupedResults[key][i].rank = i + 1;
                await groupedResults[key][i].save({ validateBeforeSave: false }); // Update rank in DB
            }
        }

        res.status(200).json(studentResults); // Return the updated list
    } catch (error) {
        console.error('Error fetching student results:', error);
        res.status(500).json({ error: 'छात्र परिणाम प्राप्त करते समय सर्वर त्रुटि हुई।' });
    }
});


// Get Single Student Result by ID (for edit operations on teacher dashboard)
app.get('/get-student/:id', async (req, res) => {
  const studentId = req.params.id;
  const { role, teacherClass, teacherSection } = req.query; // Query params for teacher auth

  try {
    const student = await StudentResult.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'छात्र परिणाम नहीं मिला।' });
    }

    // Server-side authorization check: ensure teacher can only view/edit their class's students
    if (role === 'teacher' && (student.class !== teacherClass || student.section !== teacherSection)) {
        return res.status(403).json({ error: 'आप इस छात्र को देखने/संपादित करने के लिए अधिकृत नहीं हैं।' });
    }

    res.status(200).json(student);
  } catch (error) {
    console.error('Error fetching single student result:', error);
    res.status(500).json({ error: 'एकल छात्र परिणाम प्राप्त करते समय सर्वर त्रुटि हुई।' });
  }
});


// Delete Student Result
app.delete('/delete-student/:id', async (req, res) => {
  const studentId = req.params.id;
  const { role, teacherClass, teacherSection } = req.query; // Query params for teacher auth

  try {
    const studentToDelete = await StudentResult.findById(studentId);

    if (!studentToDelete) {
        return res.status(404).json({ error: 'हटाने के लिए छात्र परिणाम नहीं मिला।' });
    }

    // Server-side authorization check: ensure teacher can only delete their class's students
    if (role === 'teacher' && (studentToDelete.class !== teacherClass || studentToDelete.section !== teacherSection)) {
        return res.status(403).json({ error: 'आप इस छात्र को हटाने के लिए अधिकृत नहीं हैं।' });
    }

    const result = await StudentResult.deleteOne({ _id: studentId });
    if (result.deletedCount > 0) {
      res.status(200).json({ message: 'छात्र परिणाम सफलतापूर्वक हटा दिया गया।' });
      // Ranks for the affected class/term should be recalculated implicitly when `get-students` is called after deletion
    } else {
      res.status(404).json({ error: 'छात्र परिणाम नहीं मिला।' });
    }
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'छात्र परिणाम हटाते समय सर्वर त्रुटि हुई।' });
  }
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
