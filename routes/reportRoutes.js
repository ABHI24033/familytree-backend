import express from "express";
import { protect } from "../middleware/authtication.js";
import { getMemberReport, getMemberReportMetadata } from "../controllers/reportController.js";

const router = express.Router();

router.get("/members", protect, getMemberReport);
router.get("/metadata", protect, getMemberReportMetadata);

export default router;
