require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Replaces bodyParser.json()

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Failed:', err));

// --- Mongoose Schemas ---

// Teacher Schema
const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  class: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  teacherId: { type: Number, unique: true }
});

// Auto-increment teacherId before saving a new teacher
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
  dob: { type: String, required: true },
  class: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  examTerm: { type: String, required: true, trim: true },
  fullMarks: { type: Number, required: true },
  subjects: [{
    name: { type: String, required: true },
    marks: { type: Number, required: true, min: 0 }
  }],
  total: { type: Number, default: 0 },
  percent: { type: Number, default: 0 },
  rank: { type: Number, default: 0 }
});

// Calculate total and percent before saving
studentResultSchema.pre('save', function(next) {
  if (this.isModified('subjects') || this.isModified('fullMarks')) {
    const totalSubjects = this.subjects.length;
    if (totalSubjects > 0 && this.fullMarks > 0) {
      this.total = this.subjects.reduce((sum, sub) => sum + sub.marks, 0);
      const maxTotalMarks = totalSubjects * this.fullMarks;
      this.percent = (this.total / maxTotalMarks) * 100;
    } else {
      this.total = 0;
      this.percent = 0;
    }
  }
  next();
});

const StudentResult = mongoose.model('StudentResult', studentResultSchema);

// Subject Schema for Exam Setup
const subjectSchema = new mongoose.Schema({
  class: { type: String, required: true },
  section: { type: String, required: true },
  term: { type: String, required: true },
  name: { type: String, required: true },
  fullMarks: { type: Number, required: true }
});

const Subject = mongoose.model('Subject', subjectSchema);


// --- API Endpoints ---

// --- Teacher Management API ---

// Teacher Login
app.post('/teacher-login', async (req, res) => {
  const { name, class: teacherClass, section, password } = req.body;
  try {
    const teacher = await Teacher.findOne({ name, class: teacherClass, section, password });
    if (teacher) {
      res.status(200).json({ message: 'Login successful', teacher: { id: teacher.teacherId, name: teacher.name, class: teacher.class, section: teacher.section } });
    } else {
      res.status(401).json({ error: 'अमान्य क्रेडेंशियल या शिक्षक नहीं मिला।' });
    }
  } catch (error) {
    console.error('Teacher login error:', error);
    res.status(500).json({ error: 'लॉगिन के दौरान सर्वर त्रुटि हुई।' });
  }
});

// Add Teacher
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

// Get All Teachers
app.get('/get-teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find({}, '-password'); // Exclude password from the result
    res.status(200).json(teachers);
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
        const updateData = { name, class: teacherClass, section, password };
        // Remove undefined fields so they don't overwrite existing data
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
        
        await Teacher.updateOne({ teacherId: teacherId }, { $set: updateData });
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

// --- Student Result Management API ---

// Get Student by Roll Number (for marks entry search)
app.get("/get-student-by-roll", async (req, res) => {
  const { rollNumber, class: studentClass, section } = req.query;
  if (!rollNumber || !studentClass || !section) {
    return res.status(400).json({ error: 'Roll Number, Class, and Section are required.' });
  }
  try {
    const student = await StudentResult.findOne({ rollNumber, class: studentClass, section });
    if (student) {
      res.status(200).json(student);
    } else {
      res.status(404).json({ error: 'इस रोल नंबर का कोई छात्र आपकी कक्षा में नहीं मिला।' });
    }
  } catch (error) {
    console.error('Error fetching student by roll number:', error);
    res.status(500).json({ error: 'सर्वर में त्रुटि हुई।' });
  }
});

// Save (Add/Update) Student Result
app.post('/save-student', async (req, res) => {
  const { _id, ...studentData } = req.body; // Use _id for updates
  const { role, teacherClass, teacherSection } = req.query;

  if (role === 'teacher' && (studentData.class !== teacherClass || studentData.section !== teacherSection)) {
    return res.status(403).json({ error: 'आप केवल अपने क्लास के छात्रों के परिणाम सहेज सकते हैं।' });
  }
  try {
    // FindOneAndUpdate will create if not found (_id is null), or update if found.
    // 'new: true' returns the updated document. 'upsert: true' creates it if it doesn't exist.
    const updatedResult = await StudentResult.findOneAndUpdate(
      _id ? { _id } : { rollNumber: studentData.rollNumber, class: studentData.class, section: studentData.section, examTerm: studentData.examTerm },
      studentData,
      { new: true, upsert: true, runValidators: true }
    );
    res.status(200).json({ message: 'छात्र परिणाम सफलतापूर्वक सहेजा गया!', data: updatedResult });
  } catch (error) {
    console.error('Error saving student result:', error);
    res.status(500).json({ error: 'छात्र परिणाम सहेजते समय सर्वर त्रुटि हुई।' });
  }
});

// Get Student Results (with ranking)
app.get('/get-students', async (req, res) => {
    let filter = {};
    const { name, rollNumber, dob, studentClass, section, examTerm } = req.query;
    if (name) filter.name = new RegExp(name, 'i');
    if (rollNumber) filter.rollNumber = rollNumber;
    if (dob) filter.dob = dob;
    if (studentClass) filter.class = studentClass;
    if (section) filter.section = section;
    if (examTerm) filter.examTerm = examTerm;

    try {
        const studentResults = await StudentResult.find(filter).sort({ class: 1, section: 1, percent: -1, total: -1 });

        // Group by class-section-term to calculate rank within each group
        const grouped = studentResults.reduce((acc, student) => {
            const key = `${student.class}-${student.section}-${student.examTerm}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(student);
            return acc;
        }, {});

        // Assign rank
        for (const key in grouped) {
            grouped[key].forEach((student, index) => {
                student.rank = index + 1;
            });
        }
        res.status(200).json(studentResults);
    } catch (error) {
        console.error('Error fetching student results:', error);
        res.status(500).json({ error: 'छात्र परिणाम प्राप्त करते समय सर्वर त्रुटि हुई।' });
    }
});

// Delete Student Result
app.delete('/delete-student/:id', async (req, res) => {
  const studentId = req.params.id;
  try {
    const result = await StudentResult.deleteOne({ _id: studentId });
    if (result.deletedCount > 0) {
      res.status(200).json({ message: 'छात्र परिणाम सफलतापूर्वक हटा दिया गया।' });
    } else {
      res.status(404).json({ error: 'छात्र परिणाम नहीं मिला।' });
    }
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'छात्र परिणाम हटाते समय सर्वर त्रुटि हुई।' });
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
