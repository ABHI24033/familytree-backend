import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    eventName: { type: String, required: true },

    eventType: {
      type: String,
      enum: ["inperson", "virtual"],
      required: true,
    },

    location: { type: String, default: null },
    googleMapLink: { type: String, default: null },
    virtualLink: { type: String, default: null },

    startDate: { type: String, required: true },
    startTime: { type: String, required: true },
    endDate: { type: String, required: true },
    endTime: { type: String, required: true },

    eventDetails: { type: String },

    /** 
     * guestListId → If user selected a saved list 
     * Example: "Delhi Family"
     */
    guestListId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestList",
      default: null,
    },

    /**
     * treeId → Links the event to a specific family tree
     */
    treeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FamilyTree",
      required: true,
      index: true
    },

    /**
     * guests → Store individual guest refs with RSVP status
     */
    guests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ["pending", "accepted", "rejected", "maybe"],
          default: "pending",
        },
        foodPreference: { type: String, enum: ["Veg", "Non-Veg", "Both"], default: null },
        totalAttendees: { type: Number, default: 1 },
        vegAttendees: { type: Number, default: 0 },
        nonVegAttendees: { type: Number, default: 0 },
        city: { type: String, trim: true },
        respondedAt: { type: Date },
      },
    ],

    /** 
     * externalGuests → For public link sharing RSVPs
     */
    externalGuests: [
      {
        name: { type: String, required: true, trim: true },
        mobile: { type: String, required: true, trim: true },
        email: { type: String, trim: true },
        relation: { type: String, trim: true },
        status: {
          type: String,
          enum: ["pending", "accepted", "rejected", "maybe"],
          default: "pending"
        },
        foodPreference: { type: String, enum: ["Veg", "Non-Veg", "Both"], default: null },
        totalAttendees: { type: Number, default: 1 },
        vegAttendees: { type: Number, default: 0 },
        nonVegAttendees: { type: Number, default: 0 },
        city: { type: String, trim: true },
        respondedAt: { type: Date, default: Date.now }
      }
    ],

    /** Cover image URL */
    coverImage: { type: String },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Event", eventSchema);
