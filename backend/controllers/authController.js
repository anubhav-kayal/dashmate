// --- controllers/authController.js ---

const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otpGenerator = require('otp-generator');

// --- FAKE SMS Service (for testing) ---
// We will replace this later with Twilio or MSG91
const sendSms = async (phone, otp) => {
  console.log(`--- FAKE SMS ---`);
  console.log(`Sending OTP: ${otp} to phone number: ${phone}`);
  console.log(`----------------`);
  // Simulating a successful SMS send
  return true; 
};
// -------------------------------------

// A helper function to create a login token
const createToken = (userId) => {
  const payload = {
    user: {
      id: userId,
    },
  };
  // Sign the token with your secret
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '1d', // Token expires in 1 day
  });
};


// --- 1. REGISTER ---
exports.register = async (req, res) => {
  try {
    const { registerNumber, phone, name, password, roomNumber, hostelBlock } = req.body;

    // --- Validation ---
    if (!registerNumber || !phone || !name || !password) {
      return res.status(400).json({ message: 'Please fill all required fields.' });
    }

    // Check if user already exists (by phone or reg number)
    let user = await User.findOne({ $or: [{ phone }, { registerNumber }] });

    if (user && user.isVerified) {
      // User is fully registered and verified
      return res.status(400).json({ message: 'User already exists.' });
    }

    // --- Generate OTP ---
    const otp = otpGenerator.generate(6, { 
      upperCaseAlphabets: false, 
      specialChars: false,
      lowerCaseAlphabets: false
    });
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    // --- Hash Password ---
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (user && !user.isVerified) {
      // User signed up but never verified. Update their info and OTP.
      user.registerNumber = registerNumber;
      user.name = name;
      user.password = hashedPassword;
      user.roomNumber = roomNumber;
      user.hostelBlock = hostelBlock;
      user.otp = otp;
      user.otpExpires = otpExpires;
      await user.save();
    } else {
      // This is a completely new user
      user = new User({
        registerNumber,
        phone,
        name,
        password: hashedPassword,
        roomNumber,
        hostelBlock,
        otp,
        otpExpires,
        isVerified: false
      });
      await user.save();
    }

    // --- Send the OTP ---
    const smsSent = await sendSms(phone, otp);

    if (!smsSent) {
      return res.status(500).json({ message: 'Error sending OTP.' });
    }

    res.status(201).json({ 
      success: true, 
      message: 'User registered. OTP sent to your phone.' 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// --- 2. VERIFY OTP ---
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // --- Validation ---
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required.' });
    }

    // Find the user
    const user = await User.findOne({ phone: phone });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    
    // Check if already verified
    if (user.isVerified) {
      return res.status(400).json({ message: 'User is already verified.' });
    }

    // Check if OTP is correct
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    // Check if OTP is expired
    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ message: 'OTP has expired. Please register again.' });
    }

    // --- SUCCESS ---
    // Update user to be verified
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Create a login token for them
    const token = createToken(user.id);

    // Send token and user info back to frontend
    res.status(200).json({
      success: true,
      message: 'Phone verified successfully!',
      token,
      user: {
        id: user.id,
        name: user.name,
        registerNumber: user.registerNumber
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// --- 3. LOGIN ---
exports.login = async (req, res) => {
  try {
    const { registerNumber, password } = req.body;

    // --- Validation ---
    if (!registerNumber || !password) {
      return res.status(400).json({ message: 'Register Number and Password are required.' });
    }

    // Find user
    const user = await User.findOne({ registerNumber: registerNumber });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    // --- CRITICAL CHECK ---
    // Check if they are verified
    if (!user.isVerified) {
      // You could resend an OTP here if you want
      return res.status(401).json({ 
        success: false,
        message: 'Account not verified. Please verify your phone number.'
      });
    }

    // --- SUCCESS ---
    // User is valid, verified, and password is correct.
    // Create and send them a token.
    const token = createToken(user.id);

    res.status(200).json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: {
        id: user.id,
        name: user.name,
        registerNumber: user.registerNumber
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// --- 4. RESEND OTP ---
exports.resendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required.' });
    }

    const user = await User.findOne({ phone: phone });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'User is already verified.' });
    }

    // Generate new OTP
    const otp = otpGenerator.generate(6, { 
      upperCaseAlphabets: false, 
      specialChars: false,
      lowerCaseAlphabets: false
    });
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send new OTP
    await sendSms(phone, otp);

    res.status(200).json({ success: true, message: 'New OTP sent to your phone.' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};