
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

// Server.js वाला schema और hook
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
const MONGODB_URI = process.env.MONGODB_URI;

async function migrateData() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI नहीं मिली।');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ MongoDB connected.');

    const students = JSON.parse(fs.readFileSync('students.json', 'utf-8'));
    console.log(`JSON में ${students.length} छात्र मिले।`);

    let added = 0;

    for (const student of students) {
      const exists = await StudentResult.findOne({
        rollNumber: student.rollNumber,
        class: student.class,
        section: student.section
      });

      if (!exists) {
        const newStudent = new StudentResult({
          name: student.name,
          fatherName: student.fatherName,
          motherName: student.motherName,
          rollNumber: student.rollNumber,
          dob: student.dob,
          class: student.class,
          section: student.section,
          examTerm: student.examTerm?.trim() || 'Not Available',
          fullMarks: Number(student.fullMarks) || 100,
          subjects: student.subjects.length > 0
            ? student.subjects
            : [{ name: 'N/A', marks: 0 }]
        });

        await newStudent.save();
        added++;
        console.log(`✅ नया छात्र जोड़ा: ${student.name} (${student.class}-${student.section})`);
      } else {
        console.log(`⚠ पहले से मौजूद: ${student.name}`);
      }
    }

    console.log(`🎉 Migration पूरा! ${added} नए छात्र जोड़े गए।`);
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

migrateData();
