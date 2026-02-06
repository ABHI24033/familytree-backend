import express from "express";
import { protect } from "../middleware/authtication.js";
import { checkSubscriptionAccess } from "../middleware/subscriptionMiddleware.js";
import { canAddMember } from "../middleware/familyTreeAuth.js";
import { upload, multerErrorHandler } from "../middleware/imageupload.js";
import {
  getFamilyTree,
  addFamilyMember,
  getFamilyTreeStats,
  updateFamilyMember,
  removeFamilyMember,
  deleteFamilyMember,
  getFamilyMembersList,
  getTopFamilyMembers,
  setGuardian
} from "../controllers/familyTreeController.js";

const router = express.Router();

// Get complete family tree for current user
router.get("/", protect, checkSubscriptionAccess, getFamilyTree);

// Get family tree statistics
router.get("/stats", protect, checkSubscriptionAccess, getFamilyTreeStats);

// Get top 6 family members for widget
router.get("/top-members", protect, checkSubscriptionAccess, getTopFamilyMembers);

// Get all family members list (flat)
router.get("/members", protect, checkSubscriptionAccess, getFamilyMembersList);

// Add a new family member (with authorization check and file upload)
// Note: upload middleware must come before canAddMember to parse multipart/form-data body
// router.post("/add-member", protect, upload.single('profilePicture'), multerErrorHandler, canAddMember, addFamilyMember);
router.post("/add-member", protect, checkSubscriptionAccess, upload.single('profilePicture'), multerErrorHandler, addFamilyMember);

// Update family member (with file upload support)
router.put("/member/:memberId", protect, checkSubscriptionAccess, upload.single('profilePicture'), multerErrorHandler, updateFamilyMember);

// Remove family member relationship
router.delete("/member", protect, checkSubscriptionAccess, removeFamilyMember);

// Delete family member (completely)
router.delete("/member/:memberId", protect, checkSubscriptionAccess, deleteFamilyMember);

// Set Guardian for logged-in user
router.put("/guardian", protect, checkSubscriptionAccess, setGuardian);

export default router;

