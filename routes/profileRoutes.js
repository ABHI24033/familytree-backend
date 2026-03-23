import express from "express";
import { protect } from "../middleware/authtication.js";
import { createProfile, getProfile, getUserProfileById, updateProfile, updateUserProfileById, getUpcomingBirthdaysAndAnniversaries, uploadLifeHistoryDocument, removeLifeHistoryDocument } from "../controllers/profileController.js";
import multer from "multer";

const router = express.Router();



// Multer configuration for profile picture only
export const upload = multer({
  storage: multer.memoryStorage(), // Store file in memory as buffer
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files for profilePicture
    if (file.fieldname === 'profilePicture' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (file.fieldname === 'lifeHistoryDocuments' && file.mimetype === 'application/pdf') {
      // Accept PDF files for lifeHistoryDocuments
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type for ${file.fieldname}`), false);
    }
  },
}).fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'lifeHistoryDocuments', maxCount: 3 }
]);

// Multer configuration for PDF uploads
export const uploadPDF = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
}).single('document');

// Multer error handler middleware
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: "File too large",
        error: "File must be less than 5MB"
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

// Upload life history document (max 3)
router.post("/upload-document", protect, uploadPDF, handleMulterError, uploadLifeHistoryDocument);

// Remove life history document
router.delete("/remove-document/:documentId", protect, removeLifeHistoryDocument);

// Get upcoming birthdays and anniversaries
router.get("/birthdays-anniversaries", protect, getUpcomingBirthdaysAndAnniversaries);

//get user by id
router.get("/:id", protect, getUserProfileById);


export default router;


