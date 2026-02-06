// OTP utility functions

/**
 * Generates a 4-digit OTP
 * @returns {string} - 4-digit OTP string
 */
export const generateOtp = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/**
 * Calculates OTP expiration time (default: 10 minutes from now)
 * @param {number} minutes - Minutes until expiration (default: 10)
 * @returns {Date} - Expiration date
 */
export const getOtpExpiration = (minutes = 10) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Checks if OTP is expired
 * @param {Date} otpExpires - OTP expiration date
 * @returns {boolean} - True if expired, false otherwise
 */
export const isOtpExpired = (otpExpires) => {
  return new Date() > otpExpires;
};

/**
 * Clears OTP from user object
 * @param {Object} user - User document
 * @returns {Promise} - Save promise
 */
export const clearOtp = async (user) => {
  user.otp = undefined;
  user.otpExpires = undefined;
  return await user.save();
};

