import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

/**
 * Upload image buffer to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer from multer
 * @param {string} folder - Optional folder name in Cloudinary (default: 'familytree/profiles')
 * @returns {Promise<{url: string, public_id: string}>} - The uploaded image URL and public_id
 */
export const uploadImageToCloudinary = async (fileBuffer, folder = 'familytree/profiles') => {
  return new Promise((resolve, reject) => {
    // Create a readable stream from the buffer
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);

    // Upload stream to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'image',
        transformation: [
          { width: 500, height: 500, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            public_id: result.public_id
          });
        }
      }
    );

    // Pipe the buffer stream to Cloudinary upload stream
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Upload image buffer to Cloudinary at original size (no transformations)
 * @param {Buffer} fileBuffer - The file buffer from multer
 * @param {string} folder - Optional folder name in Cloudinary (default: 'familytree/general')
 * @returns {Promise<{url: string, public_id: string, width: number, height: number, format: string, size: number}>} - The uploaded image details
 */
export const uploadImageOriginalSize = async (fileBuffer, folder = 'familytree/general') => {
  return new Promise((resolve, reject) => {
    // Create a readable stream from the buffer
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);

    // Upload stream to Cloudinary without transformations
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'image',
        quality: 'auto', // Auto quality optimization
        fetch_format: 'auto' // Auto format optimization (e.g., WebP for supported browsers)
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            size: result.bytes
          });
        }
      }
    );

    // Pipe the buffer stream to Cloudinary upload stream
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - The public_id of the image to delete
 * @returns {Promise<void>}
 */
export const deleteImageFromCloudinary = async (publicId) => {
  try {
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    // Don't throw error - deletion failure shouldn't break the flow
  }
};

/**
 * Extract public_id from Cloudinary URL
 * @param {string} url - The Cloudinary URL
 * @returns {string|null} - The public_id or null if not a Cloudinary URL
 */
export const extractPublicIdFromUrl = (url) => {
  if (!url) return null;
  
  // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.{format}
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  return match ? match[1] : null;
};

/**
 * Upload PDF file to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer from multer
 * @param {string} originalName - Original filename for context
 * @param {string} folder - Optional folder name in Cloudinary (default: 'familytree/documents')
 * @returns {Promise<{url: string, public_id: string, name: string}>} - The uploaded file URL and public_id
 */
export const uploadPDFToCloudinary = async (fileBuffer, originalName, folder = 'familytree/documents') => {
  return new Promise((resolve, reject) => {
    // Create a readable stream from the buffer
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);

    // Upload stream to Cloudinary as raw file
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'raw',
        format: 'pdf',
        public_id: originalName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50)
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            name: originalName
          });
        }
      }
    );

    // Pipe the buffer stream to Cloudinary upload stream
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Delete raw file (PDF) from Cloudinary
 * @param {string} publicId - The public_id of the file to delete
 * @returns {Promise<void>}
 */
export const deleteRawFileFromCloudinary = async (publicId) => {
  try {
    if (publicId) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    }
  } catch (error) {
    console.error('Error deleting raw file from Cloudinary:', error);
    // Don't throw error - deletion failure shouldn't break the flow
  }
};

