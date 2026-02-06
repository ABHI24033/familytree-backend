import express from "express";
const router = express.Router();
import { protect } from "../middleware/authtication.js";
import { checkSubscriptionAccess } from "../middleware/subscriptionMiddleware.js";
import { createFeedback, getAllFeedback } from "../controllers/feedbackControllers.js";

router.post("/", protect, checkSubscriptionAccess, createFeedback);
router.get("/", protect, checkSubscriptionAccess, getAllFeedback);

export default router;
