import express from "express";
import {
    getMyPersonalData,
    createPersonalData,
    getPersonalDataById,
    updatePersonalData,
    deletePersonalData
} from "../controllers/personalDataControllers.js";
import { protect } from "../middleware/authtication.js";
import { uploadFile, multerErrorHandler } from "../middleware/imageupload.js";

const router = express.Router();

/* All routes are user-specific and protected */
router.get("/", protect, getMyPersonalData);
router.post("/", protect, uploadFile.single('file'), multerErrorHandler, createPersonalData);
router.get("/:id", protect, getPersonalDataById);
router.put("/:id", protect, updatePersonalData);
router.delete("/:id", protect, deletePersonalData);

export default router;
