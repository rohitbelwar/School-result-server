// server.js
const express = require('express');
const fs = require('fs');
const cors = require('cors'); // CORS पैकेज आयात करें
const crypto = require('crypto'); // crypto मॉड्यूल को पासवर्ड हैशिंग के लिए आयात करें

const app = express();
const PORT = 3000; // सुनिश्चित करें कि यह पोर्ट आपके फ्रंटएंड में API_URL से मेल खाता हो

// CORS को सक्षम करें - इसे अपने अन्य मिडिलवेयर से पहले जोड़ें
app.use(cors());
// JSON बॉडी पार्स करने के लिए
app.use(express.json());

// Helper function to hash passwords
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper function to calculate student metrics and rank
function calculateStudentMetricsAndRank(students) {
    const subjects = ['math', 'science', 'social', 'hindi', 'english']; // आपके विषयों के अनुसार अनुकूलित करें

    students.forEach(student => {
        let totalMarks = 0;
        let maxMarksPossible = 0;
        let failedSubjects = 0;

        subjects.forEach(subject => {
            if (student.marks && typeof student.marks[subject] === 'number') {
                totalMarks += student.marks[subject];
                maxMarksPossible += 100; // मानकर चल रहे हैं कि प्रत्येक विषय 100 अंकों का है
                if (student.marks[subject] < 33) { // मानकर चल रहे हैं कि पास मार्क 33 है
                    failedSubjects++;
                }
            }
        });

        student.totalMarks = totalMarks;
        student.percent = maxMarksPossible > 0 ? (totalMarks / maxMarksPossible) * 100 : 0;
        student.passFail = failedSubjects === 0 ? 'Pass' : 'Fail';
        student.failedSubjectsCount = failedSubjects;
    });

    // Calculate ranks within each class/section
    const classGroups = {};
    students.forEach(s => {
        // Class-Section combination
        const classKey = `${s.class}-${s.section}`;
        if (!classGroups[classKey]) classGroups[classKey] = [];
        classGroups[classKey].push(s);
    });

    for (const classKey in classGroups) {
        const classStudents = classGroups[classKey];
        classStudents.sort((a, b) => b.percent - a.percent); // Sort by percentage descending

        let currentRank = 1;
        for (let i = 0; i < classStudents.length; i++) {
            if (i > 0 && classStudents[i].percent < classStudents[i - 1].percent) {
                currentRank = i + 1;
            }
            classStudents[i].rank = currentRank;
        }
    }
    return students;
}


// --- Teacher Management Routes ---

// Route to add a new teacher
app.post('/add-teacher', (req, res) => {
    const newTeacher = req.body;
    // आवश्यक फ़ील्ड की जाँच करें
    if (!newTeacher.name || !newTeacher.class || !newTeacher.section || !newTeacher.password) {
        return res.status(400).send({ error: 'Missing required fields: name, class, section, password' });
    }

    fs.readFile('teachers.json', 'utf8', (err, data) => {
        let teachers = [];
        if (!err && data) {
            try {
                teachers = JSON.parse(data);
            } catch (e) {
                console.error("Error parsing teachers.json:", e);
                return res.status(500).send({ error: 'teachers.json is corrupted or not valid JSON.' });
            }
        }

        // शिक्षक के लिए एक अद्वितीय आईडी असाइन करें
        newTeacher.id = Date.now(); // Simple unique ID based on timestamp
        // पासवर्ड को हैश करें
        newTeacher.password = hashPassword(newTeacher.password);
        teachers.push(newTeacher);

        fs.writeFile('teachers.json', JSON.stringify(teachers, null, 2), err => {
            if (err) {
                console.error("Error writing to teachers.json:", err);
                return res.status(500).send({ error: 'Error writing teacher data.' });
            }
            res.status(201).send({ message: 'Teacher added successfully!' });
        });
    });
});

// Route to get all teachers
app.get('/get-teachers', (req, res) => {
    fs.readFile('teachers.json', 'utf8', (err, data) => {
        if (err) {
            // यदि फ़ाइल नहीं मिली, तो एक खाली सरणी लौटाएँ
            if (err.code === 'ENOENT') {
                return res.json([]);
            }
            console.error("Error reading teachers.json:", err);
            return res.status(500).send({ error: 'Error reading teacher data.' });
        }
        try {
            const teachers = JSON.parse(data);
            // सुरक्षा के लिए पासवर्ड हटाएँ (हालांकि आप इसे केवल फ्रंटएंड पर प्रदर्शित नहीं कर रहे हैं)
            const teachersWithoutPasswords = teachers.map(({ password, ...rest }) => rest);
            res.json(teachersWithoutPasswords);
        } catch (e) {
            console.error("Error parsing teachers.json:", e);
            res.status(500).send({ error: 'teachers.json is corrupted or not valid JSON.' });
        }
    });
});

// Route to update a teacher by ID
app.put('/update-teacher/:id', (req, res) => {
    const teacherId = parseInt(req.params.id);
    const updatedTeacherData = req.body;

    fs.readFile('teachers.json', 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading teachers.json for update:", err);
            return res.status(500).send({ error: 'Error reading teacher data.' });
        }
        try {
            let teachers = JSON.parse(data);
            const index = teachers.findIndex(t => t.id === teacherId);

            if (index === -1) {
                return res.status(404).send({ error: 'Teacher not found.' });
            }

            // केवल अनुमत फ़ील्ड अपडेट करें
            const existingTeacher = teachers[index];
            existingTeacher.name = updatedTeacherData.name || existingTeacher.name;
            existingTeacher.class = updatedTeacherData.class || existingTeacher.class;
            existingTeacher.section = updatedTeacherData.section || existingTeacher.section;
            // यदि नया पासवर्ड प्रदान किया गया है, तो उसे हैश करें और अपडेट करें
            if (updatedTeacherData.password) {
                existingTeacher.password = hashPassword(updatedTeacherData.password);
            }
            teachers[index] = existingTeacher;

            fs.writeFile('teachers.json', JSON.stringify(teachers, null, 2), err => {
                if (err) {
                    console.error("Error writing to teachers.json after update:", err);
                    return res.status(500).send({ error: 'Error writing teacher data.' });
                }
                res.send({ message: 'Teacher updated successfully!' });
            });
        } catch (e) {
            console.error("Error processing teachers.json for update:", e);
            res.status(500).send({ error: 'Error processing teacher data.' });
        }
    });
});

// Route to delete a teacher by ID
app.delete('/delete-teacher/:id', (req, res) => {
    const idToDelete = parseInt(req.params.id);

    fs.readFile('teachers.json', 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading teachers.json for deletion:", err);
            return res.status(500).send({ error: 'Error reading teacher data.' });
        }
        try {
            let teachers = JSON.parse(data);
            const initialLength = teachers.length;
            teachers = teachers.filter(teacher => teacher.id !== idToDelete);

            if (teachers.length === initialLength) {
                return res.status(404).send({ error: 'Teacher not found.' });
            }

            fs.writeFile('teachers.json', JSON.stringify(teachers, null, 2), err => {
                if (err) {
                    console.error("Error writing to teachers.json after deletion:", err);
                    return res.status(500).send({ error: 'Error writing teacher data.' });
                }
                res.send({ message: 'Teacher deleted successfully!' });
            });
        } catch (e) {
                console.error("Error processing teachers.json for deletion:", e);
                res.status(500).send({ error: 'Error processing teacher data.' });
        }
    });
});


// --- Student Result Management Routes with Authorization ---

// Route to get all students (Admin can see all, Teacher can see their class)
app.get('/get-students', (req, res) => {
  const { role, teacherClass, teacherSection } = req.query; // Query पैरामीटर से भूमिका और शिक्षक जानकारी प्राप्त करें

  fs.readFile('students.json', 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.json([]); // यदि फ़ाइल नहीं मिली तो एक खाली सरणी लौटाएँ
      }
      console.error("Error reading students.json:", err);
      return res.status(500).send({ error: 'Error reading student data.' });
    }
    try {
      let students = JSON.parse(data);

      // भूमिका के आधार पर फ़िल्टरिंग लागू करें
      if (role === 'teacher' && teacherClass && teacherSection) {
        // शिक्षक केवल अपनी कक्षा के छात्रों को देख सकते हैं
        // सुनिश्चित करें कि छात्र का क्लास और सेक्शन सर्वर-साइड पर combined 'Class-Section' प्रारूप में सहेजा गया है
        const fullClass = `${teacherClass}-${teacherSection}`;
        students = students.filter(s => s.class === fullClass);
      }
      // यदि भूमिका 'admin' है या कोई भूमिका/शिक्षक जानकारी नहीं है, तो सभी छात्रों को भेजें

      // छात्रों के मेट्रिक्स और रैंक की गणना करें
      students = calculateStudentMetricsAndRank(students);

      res.json(students);
    } catch (e) {
      console.error("Error parsing students.json:", e);
      res.status(500).send({ error: 'students.json is corrupted or not valid JSON.' });
    }
  });
});

// Route to save/update student results
app.post('/save-student', (req, res) => {
  let newStudent = req.body;
  const { role, teacherClass, teacherSection } = req.query; // Get role and teacher info from query parameters

  // Basic validation
  if (!newStudent.name || !newStudent.rollNumber || !newStudent.examTerm || !newStudent.class || !newStudent.section || !newStudent.marks) {
    return res.status(400).send({ error: 'Missing required fields: name, rollNumber, examTerm, class, section, marks' });
  }

  // Combine class and section for internal storage consistency
  // यह सुनिश्चित करता है कि 'class' फील्ड में 'V-A' जैसा कुछ स्टोर हो
  newStudent.class = `${newStudent.class}-${newStudent.section}`; // Ensure consistency with student data structure

  // Authorization check for teachers
  if (role === 'teacher' && teacherClass && teacherSection) {
    const authorizedClass = `${teacherClass}-${teacherSection}`;
    if (newStudent.class !== authorizedClass) {
      return res.status(403).send({ error: 'Teachers can only save results for their assigned class.' });
    }
  }

  fs.readFile('students.json', 'utf8', (err, data) => {
    let students = [];
    if (!err && data) {
      try {
        students = JSON.parse(data);
      } catch (e) {
        console.error("Error parsing students.json:", e);
        return res.status(500).send({ error: 'students.json is corrupted or not valid JSON.' });
      }
    }

    let isNewStudent = true;
    let studentIndex = -1;

    // Check if student exists based on ID if provided, otherwise by other unique fields
    if (newStudent.id) { // If an ID is provided, assume it's an update for an existing student
        studentIndex = students.findIndex(s => s.id === newStudent.id);
    } else { // For new students, or if ID isn't passed, find by name, rollNumber, combined class, and examTerm
        studentIndex = students.findIndex(s =>
            s.name.toLowerCase() === newStudent.name.toLowerCase() &&
            s.rollNumber === newStudent.rollNumber &&
            s.class === newStudent.class && // Use combined class for lookup
            s.examTerm === newStudent.examTerm
        );
    }


    if (studentIndex !== -1) {
      // Update existing student
      students[studentIndex] = { ...students[studentIndex], ...newStudent }; // Merge existing with new data
      isNewStudent = false;
    } else {
      // Add new student
      newStudent.id = Date.now(); // Simple unique ID
      students.push(newStudent);
    }

    // Re-calculate ranks for the affected class
    students = calculateStudentMetricsAndRank(students);

    fs.writeFile('students.json', JSON.stringify(students, null, 2), err => {
      if (err) {
        console.error("Error writing to students.json:", err);
        return res.status(500).send({ error: 'Error writing student data.' });
      }
      res.status(isNewStudent ? 201 : 200).send({ message: isNewStudent ? 'Student result added successfully!' : 'Student result updated successfully!', student: newStudent });
    });
  });
});

// Route to get a single student for editing (Teacher restricted to their class)
app.get('/get-student/:id', (req, res) => {
    const studentId = parseInt(req.params.id);
    const { role, teacherClass, teacherSection } = req.query; // Get role and teacher info

    fs.readFile('students.json', 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading students.json:", err);
            return res.status(500).send({ error: 'Error reading student data.' });
        }
        try {
            let students = JSON.parse(data);
            // सुनिश्चित करें कि मेट्रिक्स और रैंक अपडेटेड हैं
            students = calculateStudentMetricsAndRank(students);
            const student = students.find(s => s.id === studentId);

            if (!student) {
                return res.status(404).send({ error: 'Student not found.' });
            }

            // Authorization check for teachers
            if (role === 'teacher' && teacherClass && teacherSection) {
                const authorizedClass = `${teacherClass}-${teacherSection}`;
                if (student.class !== authorizedClass) {
                    return res.status(403).send({ error: 'Teachers can only view/edit students in their assigned class.' });
                }
            }

            res.json(student);
        } catch (e) {
            console.error("Error parsing students.json:", e);
            res.status(500).send({ error: 'students.json is corrupted or not valid JSON.' });
        }
    });
});

// Route to delete a student (Teacher restricted to their class, Admin can delete any)
app.delete('/delete-student/:id', (req, res) => {
  const idToDelete = parseInt(req.params.id);
  const { role, teacherClass, teacherSection } = req.query; // Get role and teacher info

  fs.readFile('students.json', 'utf8', (err, data) => {
    if (err) {
      console.error("Error reading students.json for deletion:", err);
      return res.status(500).send({ error: 'Error reading student data.' });
    }
    try {
      let students = JSON.parse(data);
      const studentIndex = students.findIndex(s => s.id === idToDelete);

      if (studentIndex === -1) {
        return res.status(404).send({ error: 'Student not found.' });
      }

      const studentToDelete = students[studentIndex];

      // Authorization check for teachers
      if (role === 'teacher' && teacherClass && teacherSection) {
        const authorizedClass = `${teacherClass}-${teacherSection}`;
        if (studentToDelete.class !== authorizedClass) {
          return res.status(403).send({ error: 'Teachers can only delete students from their assigned class.' });
        }
      }

      const initialLength = students.length;
      students = students.filter(student => student.id !== idToDelete);

      if (students.length === initialLength) {
        return res.status(404).send({ error: 'Student not found.' });
      }

      // Re-calculate ranks after deletion for all students (or just the affected class)
      // For simplicity, recalculating for all; for large datasets, optimize to only affected class
      students = calculateStudentMetricsAndRank(students);

      fs.writeFile('students.json', JSON.stringify(students, null, 2), err => {
        if (err) {
          console.error("Error writing to students.json after deletion:", err);
          return res.status(500).send({ error: 'Error writing student data.' });
        }
        res.send({ message: 'Student deleted successfully!' });
      });
    } catch (e) {
      console.error("Error processing students.json for deletion:", e);
      res.status(500).send({ error: 'Error processing student data.' });
    }
  });
});


// सर्वर को निर्दिष्ट पोर्ट पर चलाएँ
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
