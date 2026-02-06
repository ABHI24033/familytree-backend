import mongoose from "mongoose";

const eventGuestSchema = new mongoose.Schema(
    {
        event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            // Optional: if it's an external guest, this will be null
            default: null,
        },

        // For external guests (or override for internal?)
        name: { type: String, trim: true },
        mobile: { type: String, trim: true },
        email: { type: String, trim: true },

        // RSVP Data
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "maybe"],
            default: "pending",
        },
        foodPreference: {
            type: String,
            enum: ["Veg", "Non-Veg", "Both"],
            default: null
        },
        totalAttendees: { type: Number, default: 1 },
        vegAttendees: { type: Number, default: 0 },
        nonVegAttendees: { type: Number, default: 0 },

        isExternal: { type: Boolean, default: false },
        city: { type: String, trim: true }, // [NEW] City field

        // Metadata
        respondedAt: { type: Date },
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User", // Who added this guest (for external guests)
        }
    },
    { timestamps: true }
);

// Compound index to ensure a user is only invited once per event (unless we allow duplicates?)
// For now, let's enforce uniqueness for registered users.
eventGuestSchema.index({ event: 1, user: 1 }, { unique: true, partialFilterExpression: { user: { $exists: true, $ne: null } } });

export default mongoose.model("EventGuest", eventGuestSchema);
