import express from "express";
import {
    createKnowledgeBank,
    deleteKnowledgeBank,
    getMyReligionKnowledgeBank,
    getKnowledgeBankByReligion,
    updateKnowledgeBank,
    getAllKnowledgeBank,
    getKnowledgeBankById
} from "../controllers/knowledgeBankControllers.js";
import { protect, superAdminOnly } from "../middleware/authtication.js";

const router = express.Router();


/* Admin Specific */
router.post("/", protect, superAdminOnly, createKnowledgeBank);
router.get("/admin/all", protect, superAdminOnly, getAllKnowledgeBank);

/* USER Specific (Static/Typed) */
router.get("/religion/:religion", getKnowledgeBankByReligion);
router.get("/my", protect, getMyReligionKnowledgeBank);

/* Generic Dynamic ID (Must be last) */
router.get("/:id", protect, getKnowledgeBankById);
router.put("/:id", protect, superAdminOnly, updateKnowledgeBank);
router.delete("/:id", protect, superAdminOnly, deleteKnowledgeBank);

export default router;
