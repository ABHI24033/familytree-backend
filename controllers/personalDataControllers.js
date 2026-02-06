
import PersonalData from "../models/PersonalData.js";
import SystemSetting from "../models/SystemSetting.js";
import { uploadImageToCloudinary } from "../utils/cloudinaryUpload.js";
import { uploadPdfToCloudinary } from "../utils/PdfUploadToCloudaniry.js";

/**
 * USER: Get personal data for logged-in user
 */
export const getMyPersonalData = async (req, res) => {
    try {
        const userId = req.user.id;
        const personalData = await PersonalData.find({
            createdBy: userId,
            isActive: true
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            personalData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * USER: Create personal data with file upload
 */
export const createPersonalData = async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, description, category, videoUrl } = req.body;

        if (!title || !category) {
            return res.status(400).json({
                success: false,
                message: "Title and category are required",
            });
        }

        let fileUrl = "";
        let determinedType = videoUrl ? "video" : "none";

        if (req.file) {
            const isPdf = req.file.mimetype === "application/pdf";
            const settingKey = isPdf ? "maxPdfSize" : "maxImageSize";
            const setting = await SystemSetting.findOne({ key: settingKey });
            const maxSizeMB = setting ? setting.value : (isPdf ? 5 : 2);
            const maxSizeBytes = maxSizeMB * 1024 * 1024;

            if (req.file.size > maxSizeBytes) {
                return res.status(400).json({
                    success: false,
                    message: `File size exceeds limit of ${maxSizeMB}MB`,
                });
            }

            if (isPdf) {
                const result = await uploadPdfToCloudinary(req.file.buffer, "familytree/personal/pdfs");
                fileUrl = result.url;
                determinedType = "pdf";
            } else if (req.file.mimetype.startsWith("image/")) {
                const result = await uploadImageToCloudinary(req.file.buffer, "familytree/personal/images");
                fileUrl = result.url;
                determinedType = "image";
            }
        }

        const personalData = await PersonalData.create({
            title,
            description: description || "",
            category,
            type: determinedType,
            fileUrl,
            videoUrl: videoUrl || "",
            createdBy: userId,
        });

        res.status(201).json({
            success: true,
            message: "Personal data saved successfully",
            data: personalData,
        });

    } catch (error) {
        console.error("createPersonalData error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * USER: Get single personal data by ID
 */
export const getPersonalDataById = async (req, res) => {
    try {
        const userId = req.user.id;
        const personalData = await PersonalData.findOne({
            _id: req.params.id,
            createdBy: userId,
            isActive: true
        });

        if (!personalData) {
            return res.status(404).json({
                success: false,
                message: "Personal data not found"
            });
        }

        res.json({
            success: true,
            personalData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * USER: Update personal data
 */
export const updatePersonalData = async (req, res) => {
    try {
        const userId = req.user.id;
        const personalData = await PersonalData.findOneAndUpdate(
            { _id: req.params.id, createdBy: userId },
            req.body,
            { new: true }
        );

        if (!personalData) {
            return res.status(404).json({
                success: false,
                message: "Personal data not found"
            });
        }

        res.json({
            success: true,
            message: "Personal data updated",
            personalData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * USER: Delete personal data (Soft Delete)
 */
export const deletePersonalData = async (req, res) => {
    try {
        const userId = req.user.id;
        const personalData = await PersonalData.findOneAndUpdate(
            { _id: req.params.id, createdBy: userId },
            { isActive: false },
            { new: true }
        );

        if (!personalData) {
            return res.status(404).json({
                success: false,
                message: "Personal data not found"
            });
        }

        res.json({
            success: true,
            message: "Personal data removed"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
