import express from "express";
import { protect } from "../middleware/authtication.js";
import { upload, multerErrorHandler } from "../middleware/imageupload.js";
import { 
  uploadImage, 
  uploadMultipleImages, 
  deleteImage,
  getUploadInfo
} from "../controllers/uploadController.js";

const router = express.Router();

// Public route - Get upload API info
router.get("/info", getUploadInfo);

// Upload single image
router.post("/image", protect, upload.single('image'), multerErrorHandler, uploadImage);

// Upload multiple images (up to 10 files)
router.post("/images", protect, upload.array('images', 10), multerErrorHandler, uploadMultipleImages);

// Delete image from Cloudinary
router.delete("/image", protect, deleteImage);

export default router;

