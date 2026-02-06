import mongoose from "mongoose";

const Schema = mongoose.Schema;

const commentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
}, { timestamps: true });

const postSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  treeId: { type: Schema.Types.ObjectId, ref: "FamilyTree", required: true, index: true },
  text: { type: String, trim: true },
  images: [{ type: String }], // url if any
  likes: [{ type: Schema.Types.ObjectId, ref: "User" }], // users who liked
  comments: [commentSchema],
}, { timestamps: true });

// Virtuals or helpers
postSchema.virtual("likesCount").get(function () {
  return this.likes?.length || 0;
});
postSchema.virtual("commentsCount").get(function () {
  return this.comments?.length || 0;
});

export default mongoose.model("Post", postSchema);
