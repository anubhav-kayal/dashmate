// --- routes/auth.js ---

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// @route   POST /api/auth/register
// @desc    Register a user (and send OTP)
router.post('/register', authController.register);

// @route   POST /api/auth/verify-otp
// @desc    Verify user's phone with OTP
router.post('/verify-otp', authController.verifyOtp);

// @route   POST /api/auth/login
// @desc    Log in a user (with reg no. and password)
router.post('/login', authController.login);

// @route   POST /api/auth/resend-otp
// @desc    Resend an OTP
router.post('/resend-otp', authController.resendOtp);


module.exports = router;
