import mongoose from "mongoose";

const GuestListSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        members: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        externalMembers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "ExternalContact",
            },
        ],
    },
    { timestamps: true }
);

// Allow a user to have multiple lists with same name? Maybe not.
// GuestListSchema.index({ user: 1, name: 1 }, { unique: true }); 

export default mongoose.model("GuestList", GuestListSchema);
