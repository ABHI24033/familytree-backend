import RitualCategory from "../models/RitualCategory.js";

/**
 * Get categories by religion
 */
export const getCategoriesByReligion = async (req, res) => {
    try {
        const { religion } = req.params;

        const categories = await RitualCategory.find({
            religion,
            isActive: true
        }).sort({ name: 1 });

        res.json({
            success: true,
            categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Get all categories (Admin)
 */
export const getAllCategories = async (req, res) => {
    try {
        const categories = await RitualCategory.find({ isActive: true })
            .sort({ religion: 1, name: 1 });

        res.json({
            success: true,
            categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Create category (Admin)
 */
export const createCategory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { religion, name, description } = req.body;

        if (!religion || !name) {
            return res.status(400).json({
                success: false,
                message: "Religion and name are required"
            });
        }

        const category = await RitualCategory.create({
            religion,
            name,
            description: description || "",
            createdBy: userId
        });

        res.status(201).json({
            success: true,
            message: "Category created successfully",
            category
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Category already exists for this religion"
            });
        }
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Update category (Admin)
 */
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await RitualCategory.findByIdAndUpdate(
            id,
            req.body,
            { new: true }
        );

        res.json({
            success: true,
            message: "Category updated successfully",
            category
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Delete category (Admin - soft delete)
 */
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await RitualCategory.findByIdAndUpdate(id, { isActive: false });

        res.json({
            success: true,
            message: "Category deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
