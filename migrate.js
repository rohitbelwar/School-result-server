// migrate.js

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

// आपके server.js से StudentResult का Schema कॉपी करें
const studentResultSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  fatherName: { type: String, trim: true },
  motherName: { type: String, trim: true },
  rollNumber: { type: String, required: true, trim: true },
  dob: { type: String, required: true },
  class: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  examTerm: { type: String, trim: true },
  fullMarks: { type: Number },
  subjects: [{
    name: { type: String, required: true },
    marks: { type: Number, required: true }
  }],
  total: { type: Number },
  percent: { type: Number },
  rank: { type: Number }
});

const StudentResult = mongoose.model('StudentResult', studentResultSchema);

const MONGODB_URI = process.env.MONGODB_URI;

async function migrateData() {
  try {
    // MongoDB से कनेक्ट करें
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB से सफलतापूर्वक कनेक्ट हो गया।');

    // students.json फ़ाइल पढ़ें
    const jsonData = fs.readFileSync('students.json', 'utf-8');
    const students = JSON.parse(jsonData);
    console.log(`JSON फ़ाइल में ${students.length} छात्र मिले।`);

    let newStudentsAdded = 0;

    // हर छात्र के डेटा को MongoDB में डालें
    for (const student of students) {
      // पहले जांचें कि छात्र पहले से मौजूद है या नहीं
      const existingStudent = await StudentResult.findOne({
        rollNumber: student.rollNumber,
        class: student.class,
        section: student.section
      });

      if (!existingStudent) {
        const newStudent = new StudentResult({
          name: student.name,
          fatherName: student.fatherName,
          motherName: student.motherName,
          rollNumber: student.rollNumber,
          dob: student.dob,
          class: student.class,
          section: student.section,
          // बाकी फ़ील्ड्स अभी खाली रहेंगे, उन्हें बाद में अपडेट किया जा सकता है
          subjects: student.subjects || [],
          examTerm: student.examTerm || '',
          total: student.total || 0,
          percent: student.percent || 0
        });
        await newStudent.save();
        newStudentsAdded++;
        console.log(`नया छात्र जोड़ा गया: ${student.name} (रोल नंबर: ${student.rollNumber}, क्लास: ${student.class})`);
      } else {
        console.log(`छात्र पहले से मौजूद है, इसलिए छोड़ा जा रहा है: ${student.name}`);
      }
    }

    console.log(`\n🎉 माइग्रेशन पूरा हुआ! ${newStudentsAdded} नए छात्र MongoDB में जोड़े गए।`);

  } catch (error) {
    console.error('❌ माइग्रेशन के दौरान त्रुटि हुई:', error);
  } finally {
    // कनेक्शन बंद करें
    await mongoose.disconnect();
    console.log('MongoDB कनेक्शन बंद कर दिया गया।');
  }
}

// स्क्रिप्ट चलाएँ
migrateData();
