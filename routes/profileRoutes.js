import express from "express";
import { protect } from "../middleware/authtication.js";
import { createProfile, getProfile, getUserProfileById, updateProfile, updateUserProfileById, getUpcomingBirthdaysAndAnniversaries } from "../controllers/profileController.js";
import multer from "multer";

const router = express.Router();



// Also accepts other form fields
export const upload = multer({
  storage: multer.memoryStorage(), // Store file in memory as buffer
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
}).single('profilePicture');

// Multer error handler middleware
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: "File too large",
        error: "Profile picture must be less than 5MB"
      });
    }
    return res.status(400).json({
      message: "File upload error",
      error: err.message
    });
  }
  if (err) {
    return res.status(400).json({
      message: "File upload error",
      error: err.message
    });
  }
  next();
};

// Create profile (with validation)
router.post("/create", protect, upload, handleMulterError, createProfile);

// Get profile
router.get("/me", protect, getProfile);

// Update profile
router.put("/update", protect, upload, handleMulterError, updateProfile);

// Update a specific user's profile (Admin/Self)
router.put("/update/:id", protect, upload, handleMulterError, updateUserProfileById);

// Get upcoming birthdays and anniversaries
router.get("/birthdays-anniversaries", protect, getUpcomingBirthdaysAndAnniversaries);

//get user by id
router.get("/:id", protect, getUserProfileById);


export default router;


