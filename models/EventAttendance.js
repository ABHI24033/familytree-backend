import mongoose from "mongoose";

const eventAttendanceSchema = new mongoose.Schema(
    {
        event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        mobile: {
            type: String,
            required: true,
            trim: true
        },
        attendedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

// Optional: Ensure a person with same mobile only recorded once per event
eventAttendanceSchema.index({ event: 1, mobile: 1 }, { unique: true });

export default mongoose.model("EventAttendance", eventAttendanceSchema);
