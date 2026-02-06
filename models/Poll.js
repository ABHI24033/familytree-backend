import mongoose from "mongoose";

const Schema = mongoose.Schema;

const pollOptionSchema = new Schema({
    text: { type: String, required: true, trim: true },
    votes: [{ type: Schema.Types.ObjectId, ref: "User" }], // users who voted for this option
});

const pollSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    treeId: { type: Schema.Types.ObjectId, ref: "FamilyTree", required: true, index: true },
    question: { type: String, required: true, trim: true },
    options: [pollOptionSchema],
    duration: { type: Number, required: true }, // in hours
    expiresAt: { type: Date, required: true },
    voters: [{ type: Schema.Types.ObjectId, ref: "User" }], // all users who voted
}, { timestamps: true });

// Virtual for total votes count
pollSchema.virtual("totalVotes").get(function () {
    return this.options.reduce((sum, option) => sum + (option.votes?.length || 0), 0);
});

// Virtual for checking if poll is expired
pollSchema.virtual("isExpired").get(function () {
    return new Date() > this.expiresAt;
});

// Ensure virtuals are included in JSON
pollSchema.set('toJSON', { virtuals: true });
pollSchema.set('toObject', { virtuals: true });

export default mongoose.model("Poll", pollSchema);
