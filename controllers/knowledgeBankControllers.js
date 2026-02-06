
import KnowledgeBank from "../models/KnowledgeBank.js";
import Profile from "../models/Profile.js";

/**
 * ADMIN: Create Knowledge Bank Entry
 */
export const createKnowledgeBank = async (req, res) => {
    try {
        const userId = req?.user?.id;

        // ===== AUTH CHECK =====
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const { religion, title, description, category, videoUrl, pdfUrl } = req.body;

        // ===== VALIDATION =====
        if (!religion || !title || !category) {
            return res.status(400).json({
                success: false,
                message: "Religion, title and category are required",
            });
        }

        // Determine type based on provided content
        let determinedType = "mixed";
        if (pdfUrl && !videoUrl) determinedType = "pdf";
        else if (!pdfUrl && videoUrl) determinedType = "video";
        else if (!pdfUrl && !videoUrl) determinedType = "none";

        // ===== CREATE KNOWLEDGE BANK ENTRY =====
        const knowledgeBankData = {
            religion,
            title,
            description: description || "",
            category,
            type: determinedType,
            pdfUrl: pdfUrl || "",
            videoUrl: videoUrl || "",
            createdBy: userId,
        };

        const knowledgeBank = await KnowledgeBank.create(knowledgeBankData);

        await knowledgeBank.populate("createdBy", "firstname lastname");

        return res.status(201).json({
            success: true,
            message: "Knowledge Bank entry created successfully",
            data: knowledgeBank,
        });

    } catch (err) {
        console.error("createKnowledgeBank Error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


/**
 * USER: Get knowledge bank entries by religion
 */
export const getKnowledgeBankByReligion = async (req, res) => {
    try {
        const { religion } = req.params;

        const knowledgeBanks = await KnowledgeBank.find({
            religion,
            // isActive: true,
            // isPrivate: false
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            count: knowledgeBanks.length,
            knowledgeBanks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * USER: Get knowledge bank entries for logged-in user automatically
 */
export const getMyReligionKnowledgeBank = async (req, res) => {
    try {
        const userId = req.user.id;
        const userProfile = await Profile.findOne({ user: userId });

        if (!userProfile) {
            return res.status(404).json({
                success: false,
                message: "Profile not found"
            });
        }

        const userReligion = userProfile.religion;

        if (!userReligion) {
            return res.status(400).json({
                success: false,
                message: "Religion not specified in profile"
            });
        }

        const knowledgeBanks = await KnowledgeBank.find({
            religion: userReligion,
            isActive: true,
            isPrivate: false
        });

        res.json({
            success: true,
            knowledgeBanks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Get single knowledge bank entry by ID
 */
export const getKnowledgeBankById = async (req, res) => {
    try {
        const knowledgeBank = await KnowledgeBank.findById(req.params.id);
        if (!knowledgeBank || !knowledgeBank.isActive) {
            return res.status(404).json({
                success: false,
                message: "Knowledge Bank entry not found"
            });
        }
        res.json({
            success: true,
            knowledgeBank
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Update Knowledge Bank Entry
 */
export const updateKnowledgeBank = async (req, res) => {
    try {
        const knowledgeBank = await KnowledgeBank.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.json({
            success: true,
            message: "Knowledge Bank entry updated",
            knowledgeBank
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Delete Knowledge Bank Entry (Soft Delete)
 */
export const deleteKnowledgeBank = async (req, res) => {
    try {
        await KnowledgeBank.findByIdAndUpdate(req.params.id, {
            isActive: false
        });

        res.json({
            success: true,
            message: "Knowledge Bank entry removed"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Get ALL Knowledge Bank Entries (for table)
 */
export const getAllKnowledgeBank = async (req, res) => {
    try {
        const knowledgeBanks = await KnowledgeBank.find({ isActive: true }).sort({ createdAt: -1 });
        res.json({
            success: true,
            knowledgeBanks
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
