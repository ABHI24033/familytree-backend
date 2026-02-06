import mongoose from "mongoose";

const NoticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Notice title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [200, "Title cannot exceed 200 characters"],
      index: true,
    },

    description: {
      type: String,
      required: [true, "Notice description is required"],
    },

    // 🟡 New fields you want:
    startDate: {
      type: Date,
      default: () => new Date(), // today's date
      required: true,
    },

    endDate: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["Active", "Inactive", "Expired"],
      default: "Active",
    },

    isPinned: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // set true if you want admin
    },

    pdfUrl: {
      type: String, // Cloudinary URL
      default: null,
    },
    pdfPublicId: {
      type: String, // For deletion from Cloudinary
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Text index for search
NoticeSchema.index({ title: "text", description: "text" });

// Auto-expire notice if endDate < today (optional)
NoticeSchema.pre("save", function (next) {
  if (this.endDate && this.endDate < new Date()) {
    this.status = "Expired";
  }
  next();
});

const Notice = mongoose.model("Notice", NoticeSchema);
export default Notice;
