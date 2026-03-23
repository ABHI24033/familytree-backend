
// Get user ID from request
export const getUserId = (req) => {
  return req.user?.id || req.user?._id;
};

// Convert form-data strings to proper types for Mongoose
export const transformFormData = (data) => {
  const transformed = { ...data };

  // Convert age to number
  if (transformed.age && transformed.age !== '') {
    transformed.age = parseInt(transformed.age, 10);
  }

  // Convert date strings to Date objects
  const dateFields = ['dob', 'marriageDate', 'dateOfDeath'];
  dateFields.forEach(field => {
    if (transformed[field] && transformed[field] !== '') {
      transformed[field] = new Date(transformed[field]);
    }
  });

  // Handle ObjectId fields (father, mother) - remove empty values
  const objectIdFields = ['father', 'mother'];
  objectIdFields.forEach(field => {
    if (transformed[field]) {
      transformed[field] = transformed[field].trim();
      if (transformed[field] === '' || transformed[field] === '[object Object]') {
        delete transformed[field];
      }
    } else if (transformed[field] === '' || transformed[field] === null) {
      delete transformed[field];
    }
  });

  // Convert comma-separated strings to arrays for relationship fields
  const arrayFields = ['brothers', 'sisters', 'sons', 'daughters', 'partner'];
  arrayFields.forEach(field => {
    if (transformed[field] && transformed[field] !== '') {
      if (typeof transformed[field] === 'string') {
        const ids = transformed[field]
          .split(',')
          .map(id => id.trim())
          .filter(id => id && id !== '');

        if (ids.length > 0) {
          transformed[field] = ids;
        } else {
          delete transformed[field];
        }
      }
    } else if (transformed[field] === '') {
      delete transformed[field];
    }
  });

  // Convert educationDetails_yearOfCompletion to number
  if (transformed.educationDetails_yearOfCompletion && transformed.educationDetails_yearOfCompletion !== '') {
    transformed.educationDetails_yearOfCompletion = parseInt(transformed.educationDetails_yearOfCompletion, 10);
  }

  // Parse JSON stringified arrays (education, employmentHistory)
  const jsonFields = ['education', 'employmentHistory'];
  jsonFields.forEach(field => {
    if (transformed[field] && typeof transformed[field] === 'string') {
      try {
        transformed[field] = JSON.parse(transformed[field]);
      } catch (e) {
        console.error(`Failed to parse ${field}:`, e);
        // Fallback or delete? better to delete invalid data than crash
        delete transformed[field];
      }
    }
  });

  // Remove lifeHistoryDocuments from form updates - managed via separate API
  // Documents are uploaded/removed via /profile/upload-document and /profile/remove-document
  delete transformed.lifeHistoryDocuments;

  // Remove empty strings for enum fields to prevent validation errors
  const enumFields = ['prefix', 'marital_status', 'jobCategory', 'gender', 'bloodGroup', 'foodPreference', 'jobStatus', 'jobType', 'religion', 'occupation', 'department', 'designation'];
  enumFields.forEach(field => {
    if (transformed[field] === '' || (typeof transformed[field] === 'string' && transformed[field].trim() === '')) {
      delete transformed[field];
    }
  });

  return transformed;
};

// Validate required profile fields
export const validateRequiredFields = (data, hasFile) => {
  const errors = [];
  const { gender, profilePicture, age } = data;

  // Validate gender
  if (!gender || gender.trim() === '') {
    errors.push("gender is required");
  } else if (!['male', 'female', 'other'].includes(gender)) {
    errors.push("gender must be one of: male, female, other");
  }

  // Validate profilePicture - either file upload or URL string
  // if (!hasFile && (!profilePicture || profilePicture.trim() === '')) {
  //   errors.push("profilePicture is required (either upload a file or provide a URL)");
  // }

  // Validate age
  if (!age || age === '' || isNaN(age) || age < 0 || age > 120) {
    errors.push("age is required and must be a number between 0 and 120");
  }

  return errors;
};

// Validate fields when updating (only if they're being updated)
export const validateUpdateFields = (updates, hasFile) => {
  const errors = [];

  if (updates.gender !== undefined && updates.gender !== null && updates.gender !== '') {
    if (!['male', 'female', 'other'].includes(updates.gender)) {
      errors.push("gender must be one of: male, female, other");
    }
  }

  if (updates.age !== undefined && updates.age !== null && updates.age !== '') {
    const ageNum = typeof updates.age === 'string' ? parseInt(updates.age, 10) : updates.age;
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
      errors.push("age must be a number between 0 and 120");
    }
  }

  return errors;
};

// Populate family relationships in profile query
export const populateFamilyRelations = (query) => {
  const fields = ["father", "mother", "brothers", "sisters", "sons", "daughters", "partner"];
  const selectFields = "firstname lastname phone";

  fields.forEach(field => {
    query.populate(field, selectFields);
  });

  return query;
};

// Handle Mongoose validation errors
export const handleValidationError = (err, res) => {
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      message: "Validation failed",
      errors
    });
  }
  return null;
};