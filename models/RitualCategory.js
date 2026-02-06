import mongoose from "mongoose";

const ritualCategorySchema = new mongoose.Schema(
    {
        religion: {
            type: String,
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true
        },
        description: {
            type: String,
            default: ""
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

// Compound index for religion and name to ensure unique categories per religion
ritualCategorySchema.index({ religion: 1, name: 1 }, { unique: true });

const RitualCategory = mongoose.model("RitualCategory", ritualCategorySchema);

export default RitualCategory;
