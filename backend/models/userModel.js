// --- models/userModel.js ---

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  registerNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true // We'll hash this
  },
  roomNumber: {
    type: String
  },
  hostelBlock: {
    type: String
  },
  pointsBalance: {
    type: Number,
    default: 0
  },
  // --- Auth-Specific Fields ---
  isVerified: {
    type: Boolean,
    default: false // They can't log in until this is true
  },
  otp: {
    type: String,
    default: null
  },
  otpExpires: {
    type: Date,
    default: null
  },
  // We'll add Google ID later
  googleId: {
    type: String,
    default: null
  }
}, { 
  // This automatically adds `createdAt` and `updatedAt` fields
  timestamps: true 
});

const User = mongoose.model('User', userSchema);
module.exports = User;