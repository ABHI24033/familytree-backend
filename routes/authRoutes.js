import express from "express";
import {
  sendOtp,
  verifyOtp,
  resendOtp,
  setPassword,
  sendOtpForLogin,
  verifyOtpForLogin,
  resendOtpForLogin,
  sendOtpForForgotPassword,
  verifyOtpForForgotPassword,
  resetPassword,
  logoutUser,
  refreshToken,
  getCurrentUser,
  getAllUsersIp,
  getIp,
  updatePasswordAfterFirstLogin
} from "../controllers/authController.js";
import { protect, superAdminOnly } from "../middleware/authtication.js";

const router = express.Router();

// -------- Registration Flow --------
router.post("/send-otp", sendOtp);        // Step 1: Send OTP
router.post("/verify-otp", verifyOtp);   // Step 2: Verify OTP (sets is_verified=1, generates JWT)
router.post("/resend-otp", resendOtp);   // Resend OTP if needed
router.post("/set-password", setPassword); // Step 3: Set password after OTP verification

// -------- Login --------
router.post("/login/send-otp", sendOtpForLogin); // Send OTP for login (requires phone and password)
router.post("/login/verify-otp", verifyOtpForLogin); // Verify OTP and login
router.post("/login/resend-otp", resendOtpForLogin); // Resend OTP for login (requires phone and password)

// -------- Forgot Password Flow --------
router.post("/forgot-password/send-otp", sendOtpForForgotPassword); // Send OTP for password reset
router.post("/forgot-password/verify-otp", verifyOtpForForgotPassword); // Verify OTP for password reset
router.post("/forgot-password/reset", resetPassword); // Reset password after OTP verification

// -------- Session Management --------
router.get("/me", protect, getCurrentUser); // Get current user info
router.post("/update-first-password", protect, updatePasswordAfterFirstLogin);
router.post("/refresh", refreshToken);
router.post("/logout", logoutUser);

// -------- Super Admin Routes --------
router.get("/ip", getIp); // Debug IP
router.get("/admin/users-ip", protect, superAdminOnly, getAllUsersIp);

export default router;
