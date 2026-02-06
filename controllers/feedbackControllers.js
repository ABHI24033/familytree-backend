import Feedback from "../models/Feedback.js";
import Profile from "../models/Profile.js";

// Create new feedback
export const createFeedback = async (req, res) => {
    try {
        const userId = req?.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        const { title, message, category, rating } = req.body;

        // Validation
        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: "Title is required"
            });
        }

        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: "Message is required"
            });
        }

        // Get user's tree ID
        const userProfile = await Profile.findOne({ user: userId });
        if (!userProfile || !userProfile.treeId) {
            return res.status(400).json({
                success: false,
                message: "User does not belong to a family tree"
            });
        }

        // Create feedback
        const feedback = await Feedback.create({
            user: userId,
            treeId: userProfile.treeId,
            title: title.trim(),
            message: message.trim(),
            category: category || 'general',
            rating: rating || null
        });

        await feedback.populate("user", "firstname lastname");

        return res.status(201).json({
            success: true,
            message: "Feedback submitted successfully",
            data: feedback
        });

    } catch (err) {
        console.error("createFeedback Error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Get all feedback
export const getAllFeedback = async (req, res) => {
    try {
        const userId = req?.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        // Get user's tree ID
        const userProfile = await Profile.findOne({ user: userId });
        if (!userProfile || !userProfile.treeId) {
            return res.status(400).json({
                success: false,
                message: "User does not belong to a family tree"
            });
        }

        const { category, page = 1, limit = 10 } = req.query;

        // Build query
        const query = { treeId: userProfile.treeId };

        if (category) {
            query.category = category;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const feedback = await Feedback.find(query)
            .populate("user", "firstname lastname avatar")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Feedback.countDocuments(query);

        return res.status(200).json({
            success: true,
            data: feedback,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (err) {
        console.error("getAllFeedback Error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};
