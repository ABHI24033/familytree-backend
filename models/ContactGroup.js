import mongoose from "mongoose";

const contactGroupSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    members: [{
        memberId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        memberType: {
            type: String,
            enum: ["User", "ExternalContact"],
            required: true
        }
    }]
}, { timestamps: true });

// Ensure unique group names per user
contactGroupSchema.index({ user: 1, name: 1 }, { unique: true });

const ContactGroup = mongoose.model("ContactGroup", contactGroupSchema);

export default ContactGroup;
