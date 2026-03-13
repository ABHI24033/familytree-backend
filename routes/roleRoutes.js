import express from "express";
import { protect, adminOnly } from "../middleware/authtication.js";
import {
  createCoordinator,
  createSubAdmin,
  deactivateRole,
  getAdministrators,
  listUsersForRoleAssignment,
  listCoordinators,
  listSubAdmins,
  setUserRole
} from "../controllers/roleController.js";

const router = express.Router();

// Used by Family Zone "Administrator" section
router.get("/administrators", protect, getAdministrators);

// Admin role management
router.get("/users", protect, adminOnly, listUsersForRoleAssignment);

router.post("/subadmins", protect, adminOnly, createSubAdmin);
router.get("/subadmins", protect, adminOnly, listSubAdmins);

router.post("/coordinators", protect, adminOnly, createCoordinator);
router.get("/coordinators", protect, adminOnly, listCoordinators);

// Assign or remove role from an existing user
router.patch("/role/:id", protect, adminOnly, setUserRole);

// Deactivate (remove) a role from a user (does not delete the user)
router.patch("/deactivate/:id", protect, adminOnly, deactivateRole);

export default router;
