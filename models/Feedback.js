import mongoose from "mongoose";

const Schema = mongoose.Schema;

const feedbackSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    treeId: {
        type: Schema.Types.ObjectId,
        ref: "FamilyTree",
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        enum: ['bug', 'feature_request', 'general', 'improvement'],
        default: 'general'
    },
    rating: {
        type: Number,
        min: 1,
        max: 5
    }
}, { timestamps: true });

// Index for faster queries
feedbackSchema.index({ treeId: 1, createdAt: -1 });

export default mongoose.model("Feedback", feedbackSchema);
