import mongoose from "mongoose";

const externalContactSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    name: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: false
    },
    relation: {
        type: String, // Friend, Relative, Colleague, Neighbor, Other
        required: true,
        default: "Friend"
    },
    foodPreference: {
        type: String,
        enum: ["Veg", "Non-Veg", "Both"],
        required: false,
        default: "Both"
    }
}, { timestamps: true });

// Compound index to prevent duplicates for same user
externalContactSchema.index({ user: 1, mobile: 1 }, { unique: true });

const ExternalContact = mongoose.model("ExternalContact", externalContactSchema);

export default ExternalContact;
