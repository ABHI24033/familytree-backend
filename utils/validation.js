// Validation helper functions

/**
 * Validates phone number format
 * @param {string|number} phone - Phone number to validate
 * @returns {Object} - { valid: boolean, message?: string, phone?: string }
 */
export const validatePhone = (phone) => {
  const phoneStr = String(phone);
  if (!/^\d+$/.test(phoneStr)) {
    return { valid: false, message: "Phone must be a number" };
  }
  if (phoneStr.length !== 10) {
    return { valid: false, message: "Phone must be exactly 10 characters long" };
  }
  return { valid: true, phone: phoneStr };
};

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @returns {Object} - { valid: boolean, message?: string }
 */
export const validatePassword = (password) => {
  if (password.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters long"
    };
  }

  // Check password strength (at least one letter, one number, and one special character)
  if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one letter and one number"
    };
  }

  // Check for at least one special character
  if (!/(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`])/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one special character"
    };
  }

  return { valid: true };
};

/**
 * Validates password confirmation match
 * @param {string} password - Password
 * @param {string} confirm_password - Confirmation password
 * @returns {Object} - { valid: boolean, message?: string }
 */
export const validatePasswordMatch = (password, confirm_password) => {
  if (password !== confirm_password) {
    return {
      valid: false,
      message: "Password and confirm_password do not match"
    };
  }
  return { valid: true };
};

/**
 * Validates required fields
 * @param {Object} fields - Object with field names as keys and values
 * @returns {Object} - { valid: boolean, message?: string, missingField?: string }
 */
export const validateRequiredFields = (fields) => {
  for (const [fieldName, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") {
      return {
        valid: false,
        message: `${fieldName} is required`,
        missingField: fieldName
      };
    }
    // For string fields, also check if trimmed value is empty
    if (typeof value === 'string' && value.trim() === "") {
      return {
        valid: false,
        message: `${fieldName} is required`,
        missingField: fieldName
      };
    }
  }
  return { valid: true };
};

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - true if valid
 */
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};
