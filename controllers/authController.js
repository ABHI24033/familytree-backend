import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import { generateAccessToken, generateRefreshToken } from "../utils/tokenGenerate.js";
import { validatePhone, validatePassword, validatePasswordMatch, validateRequiredFields } from "../utils/validation.js";
import { generateOtp, getOtpExpiration, clearOtp } from "../utils/otp.js";
import { setAuthCookies, clearAuthCookies, formatUserResponse, validateUserStatus, validateOtp } from "../utils/authHelpers.js";
import { sendWhatsAppOtp } from "../utils/aisensy.js";
import axios from "axios";

// Helper to get client IP
// Helper to get client IP
const getClientIp = (req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  console.log("Detected IP:", ip);
  return ip;
};

// ------------------- SEND OTP (SET OTP) -------------------
export const sendOtp = async (req, res) => {
  try {
    const { firstname, lastname, country_code, phone, password } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ firstname, lastname, phone, password });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Set default country_code to +91 if not provided
    const countryCode = country_code || "+91";
    const clientIp = getClientIp(req);

    // Encrypt password using bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Check if user already exists with this phone number
    const existingUser = await User.findOne({ phone: phoneValidation.phone, is_deleted: false });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this phone number already exists"
      });
    }

    // Generate OTP and expiration
    const otp = generateOtp();
    const otpExpires = getOtpExpiration(10);

    // If user exists but not verified, update the record
    if (existingUser) {
      existingUser.firstname = firstname.trim();
      existingUser.lastname = lastname.trim();
      existingUser.country_code = countryCode;
      existingUser.password = hashedPassword;
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      existingUser.is_verified = false;
      await existingUser.save();
    } else {
      // Create new user with is_verified = 0
      await User.create({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        country_code: countryCode,
        phone: phoneValidation.phone,
        password: hashedPassword,
        is_verified: false,
        otp: otp,
        otpExpires: otpExpires,
        ipAddress: clientIp, // Capture IP on registration
        lastLoginIp: clientIp
      });
    }

    // Send OTP via WhatsApp
    await sendWhatsAppOtp(phoneValidation.phone, otp);
    console.log(`✅ OTP for ${countryCode}${phoneValidation.phone}: ${otp} (Expires: ${otpExpires.toISOString()})`);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      // In production, don't send OTP in response
      // For development/testing only:
      otp: process.env.NODE_ENV === "development" ? otp : undefined
    });
  } catch (error) {
    console.error("Send OTP Error:", error);

    // Handle duplicate phone error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- VERIFY OTP -------------------
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone, otp });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Find user with OTP fields selected
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Validate OTP
    const otpValidation = await validateOtp(user, otp);
    if (otpValidation) {
      return res.status(otpValidation.status).json({
        success: false,
        message: otpValidation.message
      });
    }

    // OTP verified - update user
    user.is_verified = true;

    // Role bootstrap: first verified registration becomes main Admin.
    const adminExists = await User.exists({ isAdmin: true, is_deleted: false });
    if (!adminExists) {
      user.isAdmin = true;
    }

    await clearOtp(user);

    // Generate JWT tokens
    const accessToken = generateAccessToken(String(user._id));
    const refreshToken = generateRefreshToken(String(user._id));

    // Set tokens in HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      user: formatUserResponse(user),
      accessToken // Also return in response for mobile apps
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- RESEND OTP -------------------
export const resendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Find user
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user is already verified
    if (user.is_verified) {
      return res.status(400).json({
        success: false,
        message: "User is already verified"
      });
    }

    // Generate new OTP
    const otp = generateOtp();
    const otpExpires = getOtpExpiration(10);

    // Update user with new OTP
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP via WhatsApp
    await sendWhatsAppOtp(phoneValidation.phone, otp);
    console.log(`✅ Resent OTP for ${user.country_code}${phoneValidation.phone}: ${otp} (Expires: ${otpExpires.toISOString()})`);

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
      // In production, don't send OTP in response
      // For development/testing only:
      otp: process.env.NODE_ENV === "development" ? otp : undefined
    });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- SET PASSWORD -------------------
export const setPassword = async (req, res) => {
  try {
    const { phone, password, confirm_password } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone, password, confirm_password });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Validate password confirmation
    const passwordMatchValidation = validatePasswordMatch(password, confirm_password);
    if (!passwordMatchValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordMatchValidation.message
      });
    }

    // Find user
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user is verified
    if (!user.is_verified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your phone number first"
      });
    }

    // Check if password already exists
    if (user.password) {
      return res.status(400).json({
        success: false,
        message: "Password already set. Use forgot password to reset."
      });
    }

    // Hash password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user with hashed password
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password set successfully"
    });
  } catch (error) {
    console.error("Set Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- SEND OTP FOR LOGIN -------------------
export const sendOtpForLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone, password });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Find user with password field selected
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    }).select('+password +otp +otpExpires');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password"
      });
    }

    // Check if password exists
    if (!user.password) {
      return res.status(403).json({
        success: false,
        message: "Password not set. Please set your password first."
      });
    }

    // Verify password before sending OTP
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password"
      });
    }

    // Password verified - Generate new OTP for login
    const otp = generateOtp();
    const otpExpires = getOtpExpiration(10);

    // Update user with new OTP
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP via WhatsApp
    await sendWhatsAppOtp(phoneValidation.phone, otp);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully for login",
      // In production, don't send OTP in response
      // For development/testing only:
      otp: process.env.NODE_ENV === "development" ? otp : undefined
    });
  } catch (error) {
    console.error("Send OTP For Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- VERIFY OTP FOR LOGIN -------------------
export const verifyOtpForLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone, otp });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Find user with OTP fields selected
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    }).select('+otp +otpExpires +isFirstLogin');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Validate OTP
    const otpValidation = await validateOtp(user, otp);
    if (otpValidation) {
      return res.status(otpValidation.status).json({
        success: false,
        message: otpValidation.message
      });
    }

    // OTP verified - set is_verified to true, clear OTP and log user in
    user.is_verified = true;
    user.lastLoginIp = getClientIp(req); // Capture IP on login
    user.lastActive = new Date(); // Update last active
    await clearOtp(user);
    await user.save();

    // Generate JWT tokens
    const accessToken = generateAccessToken(String(user._id));
    const refreshToken = generateRefreshToken(String(user._id));

    // Set tokens in HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: formatUserResponse(user),
      accessToken // Also return in response for mobile apps
    });
  } catch (error) {
    console.error("Verify OTP For Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- RESEND OTP FOR LOGIN -------------------
export const resendOtpForLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone, password });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Find user with password field selected
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    }).select('+password +otp +otpExpires');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password"
      });
    }

    // Check if password exists
    if (!user.password) {
      return res.status(403).json({
        success: false,
        message: "Password not set. Please set your password first."
      });
    }

    // Verify password before resending OTP
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password"
      });
    }

    // Password verified - Generate new OTP for login
    const otp = generateOtp();
    const otpExpires = getOtpExpiration(10);

    // Update user with new OTP
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP via WhatsApp
    await sendWhatsAppOtp(phoneValidation.phone, otp);
    console.log(`✅ Resent Login OTP for ${user.country_code}${phoneValidation.phone}: ${otp} (Expires: ${otpExpires.toISOString()})`);

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully for login",
      // In production, don't send OTP in response
      // For development/testing only:
      otp: process.env.NODE_ENV === "development" ? otp : undefined
    });
  } catch (error) {
    console.error("Resend OTP For Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- SEND OTP FOR FORGOT PASSWORD -------------------
export const sendOtpForForgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Find user
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    }).select('+otp +otpExpires +password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please sign up first."
      });
    }

    // Check if password exists (user must have set password before)
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "Password not set. Please set your password first."
      });
    }

    // Generate new OTP for password reset
    const otp = generateOtp();
    const otpExpires = getOtpExpiration(10);

    // Update user with new OTP
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP via WhatsApp
    await sendWhatsAppOtp(phoneValidation.phone, otp);
    console.log(`✅ Forgot Password OTP for ${user.country_code}${phoneValidation.phone}: ${otp} (Expires: ${otpExpires.toISOString()})`);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully for password reset",
      // In production, don't send OTP in response
      // For development/testing only:
      otp: process.env.NODE_ENV === "development" ? otp : undefined
    });
  } catch (error) {
    console.error("Send OTP For Forgot Password Error:", error);
    // res.status(500).json({
    //   success: false,
    //   message: "Server error"
    // });
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
      stack: error.stack
    });
  }
};

// ------------------- VERIFY OTP FOR FORGOT PASSWORD -------------------
export const verifyOtpForForgotPassword = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone, otp });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Find user with OTP fields selected
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please sign up first."
      });
    }

    // Validate OTP
    const otpValidation = await validateOtp(user, otp);
    if (otpValidation) {
      return res.status(otpValidation.status).json({
        success: false,
        message: otpValidation.message
      });
    }

    // OTP verified - mark as verified for password reset
    // The OTP will remain active until password is reset

    // If user is not verified, mark them as verified now
    if (!user.is_verified) {
      user.is_verified = true;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password."
    });
  } catch (error) {
    console.error("Verify OTP For Forgot Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- RESET PASSWORD (FORGOT PASSWORD) -------------------
export const resetPassword = async (req, res) => {
  try {
    const { phone, otp, password, confirm_password } = req.body;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ phone, otp, password, confirm_password });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate phone format
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Validate password confirmation
    const passwordMatchValidation = validatePasswordMatch(password, confirm_password);
    if (!passwordMatchValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordMatchValidation.message
      });
    }

    // Find user with OTP fields selected
    const user = await User.findOne({
      phone: phoneValidation.phone,
      is_deleted: false
    }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Validate user status
    const statusValidation = validateUserStatus(user);
    if (statusValidation) {
      return res.status(statusValidation.status).json({
        success: false,
        message: statusValidation.message
      });
    }

    // Validate OTP
    const otpValidation = await validateOtp(user, otp);
    if (otpValidation) {
      return res.status(otpValidation.status).json({
        success: false,
        message: otpValidation.message
      });
    }

    // OTP verified - Hash new password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user with new password and clear OTP
    user.password = hashedPassword;
    await clearOtp(user);

    // Generate JWT tokens to log the user in automatically
    const accessToken = generateAccessToken(String(user._id));
    const refreshToken = generateRefreshToken(String(user._id));

    // Set tokens in HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
      accessToken
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- REFRESH TOKEN -------------------
export const refreshToken = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No refresh token provided"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // Verify user still exists and is active
    const user = await User.findById(decoded.id);
    if (!user || user.is_deleted || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive"
      });
    }

    const accessToken = generateAccessToken(String(user._id));

    // Use same cookie settings as setAuthCookies for consistency
    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    const sameSiteValue = isProduction ? "None" : "Lax";
    const secureValue = isProduction;

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: secureValue,
      sameSite: sameSiteValue,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      accessToken
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired refresh token"
      });
    }
    console.error("Refresh Token Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- GET CURRENT USER -------------------
export const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    // Get user with password field to check if password is set
    const user = await User.findById(userId).select('+password +isFirstLogin');
    if (!user || user.is_deleted) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if profile exists and get profilePicture, email, treeId, religion, and isCompleted
    const profile = await Profile.findOne({ user: userId }).select('profilePicture email treeId religion isCompleted');

    // Format user response and add profilePicture
    const userResponse = formatUserResponse(user);
    userResponse.profilePicture = profile?.profilePicture || null;
    userResponse.email = profile?.email || null;
    userResponse.treeId = profile?.treeId || null;
    userResponse.religion = profile?.religion || null;

    // Generate a fresh access token for the session 
    // This ensures frontend always has a valid token to calculate expiry from
    const accessToken = generateAccessToken(String(user._id));

    return res.status(200).json({
      success: true,
      data: {
        user: userResponse,
        hasPassword: !!user.password,
        hasProfile: !!profile,
        isProfileCompleted: !!profile?.isCompleted,
        accessToken // Return token so frontend can track expiry
      }
    });
  } catch (error) {
    console.error("Get Current User Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- LOGOUT USER -------------------
export const logoutUser = (req, res) => {
  try {
    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    console.error("Logout Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// ------------------- GET ALL USERS IP (SUPER ADMIN) -------------------
export const getAllUsersIp = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    let query = { is_deleted: false };

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstname: searchRegex },
        { lastname: searchRegex },
        { phone: searchRegex }
      ];
    }

    // Get total count for pagination
    const total = await User.countDocuments(query);

    const users = await User.find(query)
      .select('firstname lastname phone country_code ipAddress lastLoginIp createdAt updatedAt lastActive isAdmin isSuperAdmin')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get current IP for debugging
    const currentIp = getClientIp(req);

    return res.status(200).json({
      success: true,
      data: users,
      currentIp, // Include current IP for debugging
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get All Users IP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching user IPs"
    });
  }
};

// ------------------- GET CLIENT IP (DEBUG) -------------------
export const getIp = (req, res) => {
  const ip = getClientIp(req);
  res.status(200).json({ ip });
};

// ------------------- UPDATE PASSWORD AFTER FIRST LOGIN -------------------
export const updatePasswordAfterFirstLogin = async (req, res) => {
  try {
    const { password, confirm_password } = req.body;
    const userId = req.user?.id || req.user?._id;

    // Validate required fields
    const requiredValidation = validateRequiredFields({ password, confirm_password });
    if (!requiredValidation.valid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Validate password confirmation
    const passwordMatchValidation = validatePasswordMatch(password, confirm_password);
    if (!passwordMatchValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordMatchValidation.message
      });
    }

    // Find user
    const user = await User.findById(userId).select('+isFirstLogin');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Hash password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user: reset password and set isFirstLogin to false
    user.password = hashedPassword;
    user.isFirstLogin = false;
    await user.save();

    // Generate JWT tokens to refresh the session
    const accessToken = generateAccessToken(String(user._id));
    const refreshToken = generateRefreshToken(String(user._id));

    // Set tokens in HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully. Please complete your profile.",
      accessToken
    });
  } catch (error) {
    console.error("Update Password Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
