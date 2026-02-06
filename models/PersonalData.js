import mongoose from "mongoose";

const personalDataSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true
        },

        description: {
            type: String
        },

        category: {
            type: String,
            required: true
        },

        type: {
            type: String,
            default: "mixed", // pdf/video/image/mixed/none
        },

        fileUrl: {
            type: String,
            // Can be PDF, image, or any document URL
        },

        videoUrl: {
            type: String
        },

        thumbnailUrl: {
            type: String
        },

        isActive: {
            type: Boolean,
            default: true
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    { timestamps: true }
);

export default mongoose.model("PersonalData", personalDataSchema);
