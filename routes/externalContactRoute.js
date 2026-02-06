import express from "express";
import { getMyContacts, createContact, deleteContact } from "../controllers/externalContactController.js";
import { protect } from "../middleware/authtication.js";

const router = express.Router();

router.get("/", protect, getMyContacts);
router.post("/", protect, createContact);
router.delete("/:id", protect, deleteContact);

export default router;
