import mongoose from "mongoose";

const knowledgeBankSchema = new mongoose.Schema(
  {
    religion: {
      type: String,
      required: true,
      index: true
    },

    title: {
      type: String,
      required: true
    },

    description: {
      type: String
    },

    category: {
      type: String, // Marriage, Sanskar, Funeral etc
      required: true
    },

    type: {
      type: String,
      default: "mixed", // or pdf/video/mixed
    },

    pdfUrl: {
      type: String,
      // required: true  <-- Removed required here, validation will handle it based on type
    },

    videoUrl: {
      type: String
    },

    thumbnailUrl: {
      type: String
    },

    isActive: {
      type: Boolean,
      default: true
    },

    isPrivate: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

export default mongoose.model("KnowledgeBank", knowledgeBankSchema);
