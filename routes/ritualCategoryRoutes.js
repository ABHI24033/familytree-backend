import express from "express";
import {
    getCategoriesByReligion,
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory
} from "../controllers/ritualCategoryControllers.js";
import { protect, superAdminOnly } from "../middleware/authtication.js";

const router = express.Router();

// Public/Protected routes
router.get("/religion/:religion", getCategoriesByReligion);

// Admin routes
router.get("/", protect, superAdminOnly, getAllCategories);
router.post("/", protect, superAdminOnly, createCategory);
router.put("/:id", protect, superAdminOnly, updateCategory);
router.delete("/:id", protect, superAdminOnly, deleteCategory);

export default router;
