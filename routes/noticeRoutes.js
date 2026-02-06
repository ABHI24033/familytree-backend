import express from "express";
import {
    createNotice,
    deleteNotice,
    getAllNotices,
    getAllNoticesForAdmin,
    getAllNoticesForUsers,
    getSingleNotice,
    toggleNoticeActive,
    toggleNoticePin,
    updateNotice
} from "../controllers/noticeControllers.js";
import { protect } from "../middleware/authtication.js";
import { checkSubscriptionAccess } from "../middleware/subscriptionMiddleware.js";
import { uploadFile, multerErrorHandler } from "../middleware/imageupload.js";

const router = express.Router();

router.post("/", protect, checkSubscriptionAccess, uploadFile.single("pdf"), multerErrorHandler, createNotice);
router.get("/user", protect, checkSubscriptionAccess, getAllNoticesForUsers);
router.get("/admin", protect, checkSubscriptionAccess, getAllNoticesForAdmin);
router.get("/:id", protect, checkSubscriptionAccess, getSingleNotice);
router.put("/:id", protect, checkSubscriptionAccess, uploadFile.single("pdf"), multerErrorHandler, updateNotice);
router.delete("/:id", protect, checkSubscriptionAccess, deleteNotice);
router.patch("/:id/toggle", protect, checkSubscriptionAccess, toggleNoticeActive);
router.patch("/:id/pin", protect, checkSubscriptionAccess, toggleNoticePin);

export default router;
