import express from "express";
const router = express.Router();
import { protect } from "../middleware/authtication.js";
import { checkSubscriptionAccess } from "../middleware/subscriptionMiddleware.js";
import { addComment, createPoll, createPost, deleteComment, deletePost, editComment, editPost, getComments, getFeed, getPostById, getPollById, toggleLike, votePoll } from "../controllers/postControllers.js";
import { multerErrorHandler, upload } from "../middleware/imageupload.js";

router.get("/", protect, checkSubscriptionAccess, getFeed);
router.post("/poll", protect, checkSubscriptionAccess, createPoll);
router.post("/poll/:id/vote", protect, checkSubscriptionAccess, votePoll);
router.get("/poll/:id", protect, checkSubscriptionAccess, getPollById);
router.get("/:id", protect, checkSubscriptionAccess, getPostById);
router.post("/", protect, checkSubscriptionAccess, upload.array("images", 10), multerErrorHandler, createPost);
router.post("/:id/like", protect, checkSubscriptionAccess, toggleLike);
router.post("/:id/comment", protect, checkSubscriptionAccess, addComment);
router.get("/:id/comments", protect, checkSubscriptionAccess, getComments);
router.delete("/:id", protect, checkSubscriptionAccess, deletePost);
router.put("/:id", protect, checkSubscriptionAccess, upload.array("images", 10), editPost);
router.delete("/:postId/comment/:commentId", protect, checkSubscriptionAccess, deleteComment);
router.put("/:postId/comment/:commentId", protect, checkSubscriptionAccess, editComment);

export default router;

