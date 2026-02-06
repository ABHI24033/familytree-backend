import SystemSetting from "../models/SystemSetting.js";

/**
 * Initialize default settings if they don't exist
 */
export const initializeSettings = async () => {
    const defaults = [
        { key: "maxPdfSize", value: 5, description: "Maximum PDF size in MB" },
        { key: "maxImageSize", value: 2, description: "Maximum Image size in MB" }
    ];

    for (const setting of defaults) {
        const exists = await SystemSetting.findOne({ key: setting.key });
        if (!exists) {
            await SystemSetting.create(setting);
        }
    }
};

/**
 * Get all system settings
 */
export const getSettings = async (req, res) => {
    try {
        const settings = await SystemSetting.find();
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update a system setting
 */
export const updateSetting = async (req, res) => {
    try {
        const { key, value } = req.body;
        const setting = await SystemSetting.findOneAndUpdate(
            { key },
            { value },
            { new: true, upsert: true }
        );
        res.json({ success: true, message: "Setting updated", setting });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
