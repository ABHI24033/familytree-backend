import cloudinary from "../config/cloudinary.js";
import { Readable } from "stream";

/**
 * Upload PDF buffer to Cloudinary
 * @param {Buffer} fileBuffer - PDF file buffer from multer
 * @param {string} folder - Optional folder name (default: 'familytree/rituals')
 * @returns {Promise<{url: string, public_id: string, size: number, format: string}>}
 */


// export const uploadPdfToCloudinary = async (fileBuffer) => {
//   return new Promise((resolve, reject) => {
//     const stream = new Readable();
//     stream.push(fileBuffer);
//     stream.push(null);

//     const upload = cloudinary.uploader.upload_stream(
//       {
//         folder: "familytree/rituals",
//         resource_type: "raw",
//         format: "pdf",

//         // 🔥 CRITICAL FIXES
//         access_mode: "public",
//         type: "upload",
//         content_type: "application/pdf",
//         flags: "attachment:false",

//         use_filename: true,
//         unique_filename: true
//       },
//       (err, result) => {
//         if (err) reject(err);
//         else {
//           resolve({
//             url: result.secure_url,
//             public_id: result.public_id
//           });
//         }
//       }
//     );

//     stream.pipe(upload);
//   });
// };


export const uploadPdfToCloudinary = async (fileBuffer) => {
  if (!fileBuffer || !fileBuffer.length) {
    throw new Error("PDF buffer is empty");
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "familytree/notices",
        resource_type: "raw", // Allows PDF previewing and page manipulation
        format: "pdf",
        access_mode: "public",
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(error);

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    Readable.from(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Delete PDF from Cloudinary
 * @param {string} publicId
 */
export const deletePdfFromCloudinary = async (publicId) => {
  try {
    if (publicId) {
      // Must use resource_type 'image' since it was uploaded as 'image'
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "image"
      });
    }
  } catch (error) {
    console.error("Error deleting PDF from Cloudinary:", error);
  }
};
