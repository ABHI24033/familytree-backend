import express from "express";
import { getSettings, updateSetting } from "../controllers/systemSettingController.js";
import { protect, superAdminOnly } from "../middleware/authtication.js";

const router = express.Router();

router.get("/", protect, getSettings);
router.put("/", protect, superAdminOnly, updateSetting);

export default router;
