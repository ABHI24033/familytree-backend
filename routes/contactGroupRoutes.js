import express from "express";
import {
    createGroup,
    getGroups,
    getGroupById,
    updateGroup,
    deleteGroup
} from "../controllers/contactGroupController.js";
import { protect } from "../middleware/authtication.js";

const router = express.Router();

// All routes are protected
router.use(protect);

router.post("/", createGroup);
router.get("/", getGroups);
router.get("/:id", getGroupById);
router.put("/:id", updateGroup);
router.delete("/:id", deleteGroup);

export default router;
