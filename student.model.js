const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  name: { type: String, required: true },
  fatherName: { type: String, required: true },
  motherName: { type: String, required: true },
  rollNumber: { type: String, required: true },
  dob: { type: String, required: true }, // Date of Birth
  class: { type: String, required: true }, // e.g., "V-A", "III-A"
  section: { type: String, required: true }, // Explicit section field
  examTerm: { type: String, required: true }, // e.g., "First Term", "Mid-Term", "Final"
  marks: { // Object containing subject marks
    english: { type: Number, default: 0 },
    hindi: { type: Number, default: 0 },
    math: { type: Number, default: 0 },
    science: { type: Number, default: 0 },
    social: { type: Number, default: 0 }, // S.ST in your JSON
    gk: { type: Number, default: 0 },
    computer: { type: Number, default: 0 }
  },
  fullMarks: { type: Number, default: 0 }, // For the overall exam term
  totalMarks: { type: Number, default: 0 },
  percent: { type: Number, default: 0 },
  passFail: { type: String, default: 'Fail' }, // "Pass" or "Fail"
  failedSubjectsCount: { type: Number, default: 0 },
  rank: { type: Number, default: 0 }
});

module.exports = mongoose.model('Student', studentSchema);
