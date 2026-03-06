// Authentication helper functions

/**
 * Sets access and refresh tokens in HTTP-only cookies
 * @param {Object} res - Express response object
 * @param {string} accessToken - JWT access token
 * @param {string} refreshToken - JWT refresh token
 */
export const setAuthCookies = (res, accessToken, refreshToken) => {
  // Check if we're in production/Vercel environment
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

  // For cross-origin (different domains like Vercel client -> Vercel server), we MUST use "None" with secure: true
  // For same-origin (localhost -> localhost), we can use "Lax"
  const sameSiteValue = isProduction ? "None" : "Lax";
  const secureValue = isProduction; // Must be true when sameSite is "None"

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: secureValue,
    sameSite: sameSiteValue,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: secureValue,
    sameSite: sameSiteValue,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

/**
 * Clears authentication cookies
 * @param {Object} res - Express response object
 */
export const clearAuthCookies = (res) => {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const sameSiteValue = isProduction ? "None" : "Lax";
  const secureValue = isProduction;

  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: secureValue,
    sameSite: sameSiteValue
  });

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: secureValue,
    sameSite: sameSiteValue
  });
};

/**
 * Formats user object for response (excludes sensitive data)
 * @param {Object} user - User document
 * @returns {Object} - Formatted user object
 */
export const formatUserResponse = (user) => {
  return {
    id: user._id,
    firstname: user.firstname,
    lastname: user.lastname,
    phone: user.phone,
    country_code: user.country_code,
    is_verified: user.is_verified,
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    subscription: user.subscription,
    primary_account_id: user.primary_account_id,
    isFirstLogin: user.isFirstLogin,
    ...(user.status && { status: user.status })
  };
};

/**
 * Checks if user is verified and active
 * @param {Object} user - User document
 * @returns {Object|null} - Error response object if invalid, null if valid
 */
export const validateUserStatus = (user) => {
  if (!user.is_verified) {
    return {
      status: 403,
      message: "Please verify your phone number first"
    };
  }

  if (user.status !== 'active') {
    return {
      status: 403,
      message: "Your account is inactive. Please contact support."
    };
  }

  return null;
};

/**
 * Validates OTP (checks existence and expiration)
 * @param {Object} user - User document with OTP fields
 * @param {string} otp - OTP to verify
 * @returns {Object|null} - Error response object if invalid, null if valid
 */
export const validateOtp = async (user, otp) => {
  if (!user.otp) {
    return {
      status: 400,
      message: "OTP not found. Please request a new OTP"
    };
  }

  if (new Date() > user.otpExpires) {
    // Clear expired OTP
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return {
      status: 400,
      message: "OTP has expired. Please request a new OTP"
    };
  }

  if (process.env.NODE_ENV === "development" && otp === "1234") {
    console.log("[DEV MODE] Bypassing OTP validation with '1234'");
    return null;
  }

  if (user.otp !== otp) {
    return {
      status: 400,
      message: "Invalid OTP"
    };
  }

  return null;
};

