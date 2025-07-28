// server.js (Updated for MongoDB)
const express = require('express');
const cors = require('cors');
const crypto = require('crypto'); // crypto मॉड्यूल को पासवर्ड हैशिंग के लिए आयात करें
const mongoose = require('mongoose'); // Mongoose आयात करें
require('dotenv').config(); // dotenv को कॉन्फ़िगर करें

const app = express();
const PORT = process.env.PORT |

| 3000; // पोर्ट को पर्यावरण चर से लें या 3000 पर डिफ़ॉल्ट करें

// CORS को सक्षम करें - इसे अपने अन्य मिडिलवेयर से पहले जोड़ें
app.use(cors());
// JSON बॉडी पार्स करने के लिए
app.use(express.json());

// MongoDB कनेक्शन
mongoose.connect(process.env.MONGODB_URI)
 .then(() => console.log('MongoDB Connected...'))
 .catch(err => console.error('MongoDB connection error:', err));

// Mongoose Models आयात करें
const Teacher = require('./teacher.model');
const Student = require('./student.model');

// Helper function to hash passwords
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper function to calculate student metrics and rank (MongoDB objects के साथ काम करने के लिए अनुकूलित)
function calculateStudentMetricsAndRank(students) {
    const subjects = ['english', 'hindi', 'math', 'science', 'social', 'gk', 'computer']; // आपके student.model.js से मेल खाता है

    students.forEach(student => {
        let totalMarks = 0;
        let fullMarksPossible = 0; // Each subject is 100 marks
        let failedSubjects = 0;

        subjects.forEach(subject => {
            if (student.marks && typeof student.marks[subject] === 'number') {
                totalMarks += student.marks[subject];
                fullMarksPossible += 100; // Assuming each subject is out of 100
                if (student.marks[subject] < 33) { // Assuming pass mark is 33
                    failedSubjects++;
                }
            }
        });

        student.totalMarks = totalMarks;
        student.fullMarks = fullMarksPossible;
        student.percent = fullMarksPossible > 0? (totalMarks / fullMarksPossible) * 100 : 0;
        student.passFail = failedSubjects === 0? 'Pass' : 'Fail';
        student.failedSubjectsCount = failedSubjects;
    });

    // Calculate ranks within each class for students who passed
    const classGroups = {};
    students.forEach(s => {
      // Group by combined class and exam term for ranking
      const groupKey = `${s.class}-${s.examTerm}`;
      if (!classGroups[groupKey]) classGroups[groupKey] =;
      classGroups[groupKey].push(s);
    });

    for (const groupKey in classGroups) {
      const classStudents = classGroups[groupKey];
      // Sort by percentage in descending order for ranking (only for passing students for rank calculation)
      const passingStudents = classStudents.filter(s => s.passFail === 'Pass');
      passingStudents.sort((a, b) => b.percent - a.percent);

      let currentRank = 1;
      for (let i = 0; i < passingStudents.length; i++) {
        if (i > 0 && passingStudents[i].percent < passingStudents[i - 1].percent) {
          currentRank = i + 1;
        }
        passingStudents[i].rank = currentRank;
      }

      // Assign rank 0 (or null) to failing students for clarity
      classStudents.forEach(s => {
        if (s.passFail === 'Fail') {
          s.rank = 0; // Or null, depending on how you want to represent it
        }
      });
    }

    return students;
}


// --- Teacher Management Routes ---

// Route to add a new teacher
app.post('/add-teacher', async (req, res) => {
  try {
    const newTeacherData = req.body;
    if (!newTeacherData.name ||!newTeacherData.class ||!newTeacherData.section ||!newTeacherData.password) {
      return res.status(400).send({ error: 'Missing required fields: name, class, section, password' });
    }

    // Check if teacher with same class/section already exists
    const existingTeacher = await Teacher.findOne({ class: newTeacherData.class, section: newTeacherData.section });
    if (existingTeacher) {
      return res.status(409).send({ error: `Teacher already assigned to Class ${newTeacherData.class}, Section ${newTeacherData.section}.` });
    }

    const hashedPassword = hashPassword(newTeacherData.password);
    const teacherId = Date.now(); // Simple unique ID

    const newTeacher = new Teacher({
      id: teacherId,
      name: newTeacherData.name,
      class: newTeacherData.class,
      section: newTeacherData.section,
      password: hashedPassword
    });

    await newTeacher.save();
    res.status(201).send({ message: 'Teacher added successfully!' });
  } catch (error) {
    console.error("Error adding teacher:", error);
    res.status(500).send({ error: 'Error adding teacher.' });
  }
});

// Route to get all teachers
app.get('/get-teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find({}, { password: 0 }); // पासवर्ड को छोड़कर सभी शिक्षक प्राप्त करें
    res.json(teachers);
  } catch (e) {
    console.error("Error fetching teachers:", e);
    res.status(500).send({ error: 'Error reading teacher data from database.' });
  }
});

// Route to update a teacher
app.put('/update-teacher/:id', async (req, res) => {
  const teacherId = parseInt(req.params.id);
  const updatedTeacherData = req.body;

  try {
    const existingTeacher = await Teacher.findOne({ id: teacherId });

    if (!existingTeacher) {
      return res.status(404).send({ error: 'Teacher not found.' });
    }

    // Update fields if provided
    if (updatedTeacherData.name) existingTeacher.name = updatedTeacherData.name;
    if (updatedTeacherData.class) existingTeacher.class = updatedTeacherData.class;
    if (updatedTeacherData.section) existingTeacher.section = updatedTeacherData.section;

    // Only update password if a new one is provided
    if (updatedTeacherData.password && updatedTeacherData.password!== '') {
      existingTeacher.password = hashPassword(updatedTeacherData.password);
    }

    await existingTeacher.save();
    res.send({ message: 'Teacher updated successfully!' });
  } catch (e) {
    console.error("Error updating teacher:", e);
    res.status(500).send({ error: 'Error updating teacher data.' });
  }
});

// Route to delete a teacher
app.delete('/delete-teacher/:id', async (req, res) => {
  const idToDelete = parseInt(req.params.id);
  try {
    const result = await Teacher.deleteOne({ id: idToDelete });

    if (result.deletedCount === 0) {
      return res.status(404).send({ error: 'Teacher not found.' });
    }
    res.send({ message: 'Teacher deleted successfully!' });
  } catch (e) {
    console.error("Error deleting teacher:", e);
    res.status(500).send({ error: 'Error deleting teacher data.' });
  }
});

// Route for teacher login
app.post('/teacher-login', async (req, res) => {
  const { name, class: teacherClass, section, password } = req.body;

  if (!name ||!teacherClass ||!section ||!password) {
    return res.status(400).send({ error: 'Missing required credentials.' });
  }

  try {
    const hashedPassword = hashPassword(password);
    const foundTeacher = await Teacher.findOne({
      name: new RegExp(`^${name}$`, 'i'), // Case-insensitive name match
      class: teacherClass,
      section: section,
      password: hashedPassword
    });

    if (foundTeacher) {
      const { password,...teacherInfo } = foundTeacher._doc; // _doc to get plain JS object
      res.send({ message: 'Login successful!', teacher: teacherInfo });
    } else {
      res.status(401).send({ error: 'Invalid teacher credentials.' });
    }
  } catch (e) {
    console.error("Error during teacher login:", e);
    res.status(500).send({ error: 'Error during login.' });
  }
});


// --- Student Result Management Routes with Authorization ---

// Route to get all students (Admin can see all, Teacher can see their class)
app.get('/get-students', async (req, res) => {
  const { role, teacherClass, teacherSection } = req.query; // Get role and teacher info from query parameters

  try {
    let students;
    if (role === 'teacher' && teacherClass && teacherSection) {
      students = await Student.find({ class: teacherClass, section: teacherSection });
    } else {
      students = await Student.find({}); // Admin or no role/teacher info, get all students
    }
    res.json(students);
  } catch (e) {
    console.error("Error fetching students:", e);
    res.status(500).send({ error: 'Error reading student data.' });
  }
});

// Route to add/update student result
app.post('/save-student', async (req, res) => {
  const studentData = req.body;
  const { role, teacherClass, teacherSection } = req.query; // For authorization

  // Authorization check for teachers
  if (role === 'teacher' && teacherClass && teacherSection) {
    if (studentData.class!== teacherClass |

| studentData.section!== teacherSection) {
      return res.status(403).send({ error: 'Teachers can only save/update students from their assigned class.' });
    }
  } else if (role!== 'admin') {
      return res.status(403).send({ error: 'Unauthorized access.' });
  }

  // Basic validation
  if (!studentData.name ||!studentData.rollNumber ||!studentData.class ||!studentData.examTerm) {
    return res.status(400).send({ error: 'Missing required student fields.' });
  }

  try {
    let studentToSave;
    let isNewStudent = true;

    if (studentData.id) {
      // Update existing student
      studentToSave = await Student.findOne({ id: studentData.id });
      if (!studentToSave) {
        return res.status(404).send({ error: 'Student not found for update.' });
      }
      Object.assign(studentToSave, studentData); // Update fields
      isNewStudent = false;
    } else {
      // Add new student
      // Check if student with same roll number, class, and exam term already exists
      const existingStudent = await Student.findOne({
          rollNumber: studentData.rollNumber,
          class: studentData.class,
          examTerm: studentData.examTerm
      });
      if (existingStudent) {
          return res.status(409).send({ error: `Student with Roll No. ${studentData.rollNumber} in Class ${studentData.class} for ${studentData.examTerm} already exists.` });
      }

      studentData.id = Date.now(); // Generate new ID for new student
      studentToSave = new Student(studentData);
    }

    // Calculate metrics and rank for all students in the same class/term
    // This is crucial because a new student or updated score changes ranks of others.
    let studentsInClassAndTerm = await Student.find({ class: studentToSave.class, examTerm: studentToSave.examTerm });
    
    // If it's a new student, add them to the list for calculation
    if (isNewStudent) {
        studentsInClassAndTerm.push(studentToSave);
    } else {
        // If it's an update, replace the old version with the updated one in the list
        studentsInClassAndTerm = studentsInClassAndTerm.map(s => s.id === studentToSave.id? studentToSave : s);
    }

    calculateStudentMetricsAndRank(studentsInClassAndTerm); // This will update metrics and rank for all relevant students

    // Save the current student with updated metrics and rank
    await studentToSave.save(); 

    // Update ranks for other students in the same class/term
    for (const s of studentsInClassAndTerm) {
        if (s.id!== studentToSave.id) { // Don't update the current student again
            await Student.updateOne({ id: s.id }, { $set: { rank: s.rank, passFail: s.passFail, totalMarks: s.totalMarks, percent: s.percent, failedSubjectsCount: s.failedSubjectsCount } });
        }
    }

    res.status(200).send({ message: 'Student data saved successfully!' });

  } catch (e) {
    console.error("Error saving student:", e);
    res.status(500).send({ error: 'Error saving student data.' });
  }
});


// Route to delete a student
app.delete('/delete-student/:id', async (req, res) => {
  const idToDelete = parseInt(req.params.id);
  const { role, teacherClass, teacherSection } = req.query; // For authorization

  try {
    const studentToDelete = await Student.findOne({ id: idToDelete });

    if (!studentToDelete) {
      return res.status(404).send({ error: 'Student not found.' });
    }

    // Authorization check for teachers
    if (role === 'teacher' && teacherClass && teacherSection) {
      if (studentToDelete.class!== teacherClass |

| studentToDelete.section!== teacherSection) {
        return res.status(403).send({ error: 'Teachers can only delete students from their assigned class.' });
      }
    } else if (role!== 'admin') {
      return res.status(403).send({ error: 'Unauthorized access.' });
    }

    const classOfDeletedStudent = studentToDelete.class;
    const examTermOfDeletedStudent = studentToDelete.examTerm;

    const result = await Student.deleteOne({ id: idToDelete });

    if (result.deletedCount === 0) {
      return res.status(404).send({ error: 'Student not found.' });
    }

    // After deletion, re-calculate and update ranks for remaining students in that class/term
    let remainingStudentsInClass = await Student.find({ class: classOfDeletedStudent, examTerm: examTermOfDeletedStudent });
    if (remainingStudentsInClass.length > 0) {
      calculateStudentMetricsAndRank(remainingStudentsInClass);
      for (const s of remainingStudentsInClass) {
          await Student.updateOne({ id: s.id }, { $set: { rank: s.rank, passFail: s.passFail, totalMarks: s.totalMarks, percent: s.percent, failedSubjectsCount: s.failedSubjectsCount } });
      }
    }

    res.send({ message: 'Student deleted successfully!' });
  } catch (e) {
    console.error("Error deleting student:", e);
    res.status(500).send({ error: 'Error deleting student data.' });
  }
});


// Route for student login and result search
app.post('/student-result', async (req, res) => {
    const { name, rollNumber, dob, sclass, examTerm } = req.body; // sclass is the class from student input form

    if (!name ||!rollNumber ||!dob ||!sclass ||!examTerm) {
        return res.status(400).send({ error: 'All fields are required.' });
    }

    try {
        const foundStudent = await Student.findOne({
            name: new RegExp(`^${name}$`, 'i'), // Case-insensitive name match
            rollNumber: rollNumber,
            dob: dob,
            class: sclass,
            examTerm: examTerm
        });

        if (foundStudent) {
            // Exclude sensitive fields if any, or just send the relevant info
            res.json(foundStudent);
        } else {
            res.status(404).send({ error: 'Student not found or credentials do not match for the selected exam term.' });
        }
    } catch (e) {
        console.error("Error during student result search:", e);
        res.status(500).send({ error: 'Error searching for student result.' });
    }
});


// सर्वर को निर्दिष्ट पोर्ट पर चलाएँ
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
