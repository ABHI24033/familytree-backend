import express from "express";
import { protect } from "../middleware/authtication.js";
import { getNotifications, deleteNotification, toggleArchiveNotification } from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", protect, getNotifications);
router.delete("/:id", protect, deleteNotification);
router.patch("/:id/archive", protect, toggleArchiveNotification);

export default router;
