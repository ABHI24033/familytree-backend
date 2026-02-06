import express from "express";
import {
    createSubscriptionOrder,
    verifySubscriptionPayment,
    selectSubscription,
    getSubscriptionStatus
} from "../controllers/subscriptionController.js";
import { protect } from "../middleware/authtication.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

router.post("/create-order", createSubscriptionOrder);
router.post("/verify-payment", verifySubscriptionPayment);
router.post("/select", selectSubscription);
router.get("/status", getSubscriptionStatus);

export default router;
