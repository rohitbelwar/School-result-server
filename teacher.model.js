const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  name: { type: String, required: true },
  class: { type: String, required: true },
  section: { type: String, required: true },
  password: { type: String, required: true } // Hashed password
});

module.exports = mongoose.model('Teacher', teacherSchema);
