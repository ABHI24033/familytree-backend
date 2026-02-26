import express from "express";
import {
    createSubscriptionOrder,
    verifySubscriptionPayment,
    selectSubscription,
    getSubscriptionStatus,
    getFamilyMembers,
    addFamilyMember
} from "../controllers/subscriptionController.js";
import { protect } from "../middleware/authtication.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

router.post("/create-order", createSubscriptionOrder);
router.post("/verify-payment", verifySubscriptionPayment);
router.post("/select", selectSubscription);
router.get("/status", getSubscriptionStatus);

// Family Sharing Routes
router.get("/family", getFamilyMembers);
router.post("/family/add", addFamilyMember);

export default router;
