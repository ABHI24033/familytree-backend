import express from "express";
import {
    createGuestList,
    getMyGuestLists,
    deleteGuestList,
} from "../controllers/guestListController.js";
import { protect } from "../middleware/authtication.js";

const router = express.Router();

router.route("/")
    .post(protect, createGuestList)
    .get(protect, getMyGuestLists);

router.route("/:id")
    .delete(protect, deleteGuestList);

export default router;
