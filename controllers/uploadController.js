import { uploadImageToCloudinary, uploadImageOriginalSize, deleteImageFromCloudinary, extractPublicIdFromUrl } from "../utils/cloudinaryUpload.js";

// Upload single image to Cloudinary at original size
export const uploadImage = async (req, res, next) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided"
      });
    }

    // Optional: Get folder from query params or use default
    const folder = req.query.folder || 'familytree/general';

    // Upload to Cloudinary at original size (no transformations)
    const result = await uploadImageOriginalSize(req.file.buffer, folder);

    return res.status(200).json({
      success: true,
      message: "Image uploaded successfully at original size",
      data: {
        url: result.url,
        publicId: result.public_id,
        folder: folder,
        dimensions: {
          width: result.width,
          height: result.height
        },
        format: result.format,
        size: result.size
      }
    });
  } catch (err) {
    console.error("Upload Image Error:", err);

    if (err.http_code === 400) {
      return res.status(400).json({
        success: false,
        message: "Invalid image file",
        error: err.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to upload image to Cloudinary",
      error: err.message
    });
  }
};

// Upload multiple images to Cloudinary at original size
export const uploadMultipleImages = async (req, res, next) => {
  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No image files provided"
      });
    }

    // Optional: Get folder from query params or use default
    const folder = req.query.folder || 'familytree/general';

    // Upload all images to Cloudinary at original size
    const uploadPromises = req.files.map(file =>
      uploadImageOriginalSize(file.buffer, folder)
    );

    const results = await Promise.all(uploadPromises);

    // Format response
    const uploadedImages = results.map(result => ({
      url: result.url,
      publicId: result.public_id,
      dimensions: {
        width: result.width,
        height: result.height
      },
      format: result.format,
      size: result.size
    }));

    return res.status(200).json({
      success: true,
      message: `${results.length} image(s) uploaded successfully at original size`,
      data: {
        images: uploadedImages,
        count: uploadedImages.length,
        folder: folder
      }
    });
  } catch (err) {
    console.error("Upload Multiple Images Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to upload images to Cloudinary",
      error: err.message
    });
  }
};

// Delete image from Cloudinary
export const deleteImage = async (req, res, next) => {
  try {
    const { publicId, url } = req.body;

    if (!publicId && !url) {
      return res.status(400).json({
        success: false,
        message: "Please provide either publicId or url"
      });
    }

    // Extract publicId from URL if only URL is provided
    const imagePublicId = publicId || extractPublicIdFromUrl(url);

    if (!imagePublicId) {
      return res.status(400).json({
        success: false,
        message: "Could not extract publicId from URL"
      });
    }

    // Delete from Cloudinary
    await deleteImageFromCloudinary(imagePublicId);

    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      data: {
        publicId: imagePublicId
      }
    });
  } catch (err) {
    console.error("Delete Image Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to delete image from Cloudinary",
      error: err.message
    });
  }
};

// Get upload information (for testing)
export const getUploadInfo = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Image Upload API is running",
    data: {
      endpoints: {
        uploadSingle: "POST /api/upload/image",
        uploadMultiple: "POST /api/upload/images",
        deleteImage: "DELETE /api/upload/image"
      },
      features: {
        originalSize: true,
        autoOptimization: true,
        formatConversion: true,
        description: "Images are uploaded at their original size with quality and format optimization"
      },
      limits: {
        maxFileSize: "5MB",
        allowedFormats: ["jpg", "jpeg", "png", "gif", "webp"]
      },
      folders: {
        profiles: "familytree/profiles",
        posts: "familytree/posts",
        events: "familytree/events",
        documents: "familytree/documents",
        general: "familytree/general"
      }
    }
  });
};

