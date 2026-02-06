import multer from "multer";

const storage = multer.memoryStorage();

// Common multer instance for images only
export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB
  },
  fileFilter: (req, file, cb) => {
    // Allow only images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  }
});

// Multer instance for files (images and PDFs)
export const uploadFile = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB for PDFs
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only image and PDF files are allowed"), false);
    }
  }
});


export const multerErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Built-in multer errors
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Max 10MB allowed."
      });
    }

    return res.status(400).json({
      success: false,
      message: "Multer error",
      error: err.message
    });
  }

  if (err) {
    // Custom errors (wrong file type, etc.)
    return res.status(400).json({
      success: false,
      message: "File upload failed",
      error: err.message
    });
  }

  next();
};

