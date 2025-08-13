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
  fullMarks: { type: Number, required: true },
  subjects: [{
    name: { type: String, required: true },
    marks: { type: Number, required: true }
  }],
  total: { type: Number },
  percent: { type: Number },
  rank: { type: Number }
});

studentResultSchema.pre('save', async function(next) {
  const totalSubjects = this.subjects.length;
  this.total = this.subjects.reduce((sum, sub) => sum + sub.marks, 0);
  this.percent = (this.total / (totalSubjects * this.fullMarks)) * 100;

  if (this.isNew || this.isModified('total') || this.isModified('percent')) {
    const studentsInSameGroup = await this.constructor.find({
      class: this.class,
      section: this.section,
      examTerm: this.examTerm
    }).sort({ percent: -1, total: -1 });

    for (let i = 0; i < studentsInSameGroup.length; i++) {
      studentsInSameGroup[i].rank = i + 1;
      await studentsInSameGroup[i].save({ validateBeforeSave: false });
    }
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

const subjectSchema = new mongoose.Schema({
  class: { type: String, required: true },
  section: { type: String, required: true },
  term: { type: String, required: true },
  name: { type: String, required: true },
  fullMarks: { type: Number, required: true }
});

const Subject = mongoose.model('Subject', subjectSchema);

// --- NEW/MODIFIED API Endpoints for Subject Setup ---

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
  const { class: subjectClass, section, term, name, fullMarks } = req.body;

  if (!subjectClass || !section || !term || !name || !fullMarks) {
    return res.status(400).json({ error: 'सभी फ़ील्ड आवश्यक हैं।' });
  }

  try {
    const existing = await Subject.findOne({ class: subjectClass, section, term, name });
    if (existing) {
      return res.status(400).json({ error: 'यह विषय पहले से मौजूद है।' });
    }

    const subject = new Subject({ class: subjectClass, section, term, name, fullMarks });
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
        $set: { 
          class: updated.class, 
          section: updated.section, 
          term: updated.term, 
          name: updated.name, 
          fullMarks: updated.fullMarks 
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

// The remaining routes from the original server.js file...
// Teacher Login
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
      studentResult.subjects = subjects;
      studentResult.fullMarks = fullMarks;

    } else {
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
    const { role, teacherClass, teacherSection } = req.query;
    let filter = {};

    if (role === 'teacher' && teacherClass && teacherSection) {
        filter = { class: teacherClass, section: teacherSection };
    } else if (role !== 'teacher') {
        const { name, rollNumber, dob, studentClass, section, examTerm } = req.query;
        if (name) filter.name = new RegExp(name, 'i');
        if (rollNumber) filter.rollNumber = rollNumber;
        if (dob) filter.dob = dob;
        if (studentClass) filter.class = studentClass;
        if (section) filter.section = section;
        if (examTerm) filter.examTerm = examTerm;
    }

    try {
        const studentResults = await StudentResult.find(filter).sort({ class: 1, section: 1, examTerm: 1, percent: -1, total: -1 });

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
                await groupedResults[key][i].save({ validateBeforeSave: false });
            }
        }

        res.status(200).json(studentResults);
    } catch (error) {
        console.error('Error fetching student results:', error);
        res.status(500).json({ error: 'छात्र परिणाम प्राप्त करते समय सर्वर त्रुटि हुई।' });
    }
});


// Get Single Student Result by ID (for edit operations on teacher dashboard)
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


// Delete Student Result
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

// The following routes related to JSON file handling should be removed for consistency.
// The primary data storage is MongoDB. These routes create a conflicting data layer.
// However, since they were in your provided file, I am keeping them but they are not recommended.

app.post('/add-student-details', (req, res) => {
  const newStudent = req.body;

  if (!newStudent.name || !newStudent.rollNumber || !newStudent.class || !newStudent.section || !newStudent.dob) {
    return res.status(400).send({ error: 'Missing required fields: name, rollNumber, class, section, or dob.' });
  }

  fs.readFile('students.json', 'utf8', (err, data) => {
    let students = [];
    if (!err && data) {
      try {
        students = JSON.parse(data);
      } catch {
        return res.status(500).send({ error: 'Invalid students.json format.' });
      }
    }

    const duplicate = students.find(s =>
      s.rollNumber === newStudent.rollNumber &&
      s.class === newStudent.class &&
      s.section === newStudent.section
    );

    if (duplicate) {
      return res.status(400).send({ error: 'Student with same Roll Number already exists in this class-section.' });
    }

    const id = Date.now();
    students.push({ ...newStudent, id });

    fs.writeFile('students.json', JSON.stringify(students, null, 2), err => {
      if (err) {
        return res.status(500).send({ error: 'Error writing to students.json file.' });
      }
      res.status(201).send({ message: 'Student added successfully!', id });
    });
  });
});

app.get('/get-all-students', (req, res) => {
    fs.readFile('students.json', 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                return res.status(200).json([]);
            }
            return res.status(500).send({ error: 'Error reading students file.' });
        }
        try {
            const students = JSON.parse(data);
            res.status(200).json(students);
        } catch (e) {
            res.status(500).send({ error: 'Invalid students.json format.' });
        }
    });
});

app.get('/get-student-details/:id', (req, res) => {
    const studentId = parseInt(req.params.id);
    fs.readFile('students.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send({ error: 'Error reading students file.' });
        }
        try {
            const students = JSON.parse(data);
            const student = students.find(s => s.id === studentId);
            if (student) {
                res.status(200).json(student);
            } else {
                res.status(404).send({ error: 'Student not found.' });
            }
        } catch (e) {
            res.status(500).send({ error: 'Invalid students.json format.' });
        }
    });
});

app.put('/update-student-details/:id', (req, res) => {
    const studentId = parseInt(req.params.id);
    const updatedStudent = req.body;
    fs.readFile('students.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send({ error: 'Error reading students file.' });
        }
        try {
            let students = JSON.parse(data);
            const studentIndex = students.findIndex(s => s.id === studentId);
            if (studentIndex === -1) {
                return res.status(404).send({ error: 'Student not found.' });
            }
            
            const duplicate = students.find((s, index) =>
                index !== studentIndex &&
                s.rollNumber === updatedStudent.rollNumber &&
                s.class === updatedStudent.class &&
                s.section === updatedStudent.section
            );

            if (duplicate) {
                return res.status(400).send({ error: 'Student with same Roll No. already exists in the class-section.' });
            }

            students[studentIndex] = { ...updatedStudent, id: studentId };

            fs.writeFile('students.json', JSON.stringify(students, null, 2), err => {
                if (err) {
                    return res.status(500).send({ error: 'Error saving student.' });
                }
                res.status(200).send({ message: 'Student updated successfully!' });
            });
        } catch (e) {
            res.status(500).send({ error: 'Invalid students.json format.' });
        }
    });
});

app.delete('/delete-student-details/:id', (req, res) => {
    const studentId = parseInt(req.params.id);
    fs.readFile('students.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send({ error: 'Error reading students file.' });
        }
        try {
            let students = JSON.parse(data);
            const originalLength = students.length;
            students = students.filter(s => s.id !== studentId);

            if (students.length === originalLength) {
                return res.status(404).send({ error: 'Student not found.' });
            }

            fs.writeFile('students.json', JSON.stringify(students, null, 2), err => {
                if (err) {
                    return res.status(500).send({ error: 'Error deleting student.' });
                }
                res.status(200).send({ message: 'Student deleted successfully!' });
            });
        } catch (e) {
            res.status(500).send({ error: 'Invalid students.json format.' });
        }
    });
});

app.get("/get-student-by-roll", (req, res) => {
  const { rollNumber, class: studentClass, section } = req.query;

  fs.readFile('students.json', 'utf8', (err, data) => {
    if (err) return res.status(500).send({ error: 'Error reading student data' });

    try {
      const students = JSON.parse(data);
      const found = students.find(s =>
        s.rollNumber === rollNumber &&
        s.class === studentClass &&
        s.section === section
      );

      if (!found) return res.status(404).send({ error: 'Student not found.' });
      res.send(found);
    } catch (e) {
      return res.status(500).send({ error: 'Invalid JSON data.' });
    }
  });
});

app.post("/add-student-result/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const resultData = req.body;

  fs.readFile('students.json', 'utf8', (err, data) => {
    if (err) return res.status(500).send({ error: 'Error reading student data' });

    try {
      let students = JSON.parse(data);
      const studentIndex = students.findIndex(s => s.id === id);

      if (studentIndex === -1) return res.status(404).send({ error: 'Student not found.' });

      students[studentIndex].subjects = resultData.subjects;
      students[studentIndex].examTerm = resultData.examTerm;
      students[studentIndex].total = resultData.total;
      students[studentIndex].percent = resultData.percent;

      const group = students.filter(s =>
        s.class === students[studentIndex].class &&
        s.section === students[studentIndex].section &&
        s.examTerm === students[studentIndex].examTerm
      );

      group.sort((a, b) => b.percent - a.percent);
      group.forEach((stu, i) => {
        stu.rank = i + 1;
      });

      fs.writeFile('students.json', JSON.stringify(students, null, 2), err => {
        if (err) return res.status(500).send({ error: 'Error saving student data.' });
        res.send({ message: 'Result saved successfully!' });
      });
    } catch (e) {
      return res.status(500).send({ error: 'Invalid student data format.' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
