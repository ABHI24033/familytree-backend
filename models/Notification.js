import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false, // If null, broadcast to treeId
        },
        treeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FamilyTree",
            required: true,
        },
        type: {
            type: String,
            enum: ["post", "poll", "event", "notice", "new_member", "subscription"],
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            // Dynamic ref based on type could be handled in application logic or via specific fields if needed
        },
        isRead: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
