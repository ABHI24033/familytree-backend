import multer from "multer";

const storage = multer.memoryStorage();

export const pdfUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

export const pdfMulterErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "PDF too large. Max 10MB allowed.",
      });
    }
    return res.status(400).json({
      success: false,
      message: "PDF upload error",
      error: err.message,
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: "PDF upload failed",
      error: err.message,
    });
  }

  next();
};
