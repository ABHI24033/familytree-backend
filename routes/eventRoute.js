import express from "express";
import { createEvent, deleteEvent, getAllEvents, getEventById, getMyEvents, getPublicEventById, addExternalGuest, getEventGuestList, getReceivedInvitations, getEventCities } from "../controllers/eventControllers.js"; // Removed old respondToEvent
import { getEventGuests, rsvpToEvent, rsvpToEventPublic } from "../controllers/eventGuestController.js"; // [NEW]
import { protect } from "../middleware/authtication.js";
import { checkSubscriptionAccess } from "../middleware/subscriptionMiddleware.js";
import { upload } from "../middleware/imageupload.js";

const router = express.Router();

// Create Event API
router.post("/create", protect, checkSubscriptionAccess, upload.single("coverImage"), createEvent);
router.get("/", protect, checkSubscriptionAccess, getAllEvents);

// [NEW] Guest Management & RSVP
router.put("/:id/rsvp", protect, checkSubscriptionAccess, rsvpToEvent); // Changed to PUT and use new controller
router.get("/:id/guests", protect, checkSubscriptionAccess, getEventGuests); // [NEW] Pagination support
router.get("/:id/guest-list", protect, checkSubscriptionAccess, getEventGuestList); // [NEW] Full Consolidated List
router.get("/:id/cities", protect, checkSubscriptionAccess, getEventCities); // [NEW] Dedicated City List

// [NEW] PUBLIC ACCESS ROUTES (No Auth)
router.get("/public/:id", getPublicEventById);
router.put("/public/:id/rsvp", rsvpToEventPublic); // Changed to PUT and use new controller

// Manual Add External Guest (Protected)
router.post("/:id/external-guests", protect, checkSubscriptionAccess, addExternalGuest);

router.get("/invitations", protect, checkSubscriptionAccess, getReceivedInvitations); // [NEW] Received Invitations
router.get("/mine", protect, checkSubscriptionAccess, getMyEvents);
router.get("/:id", protect, checkSubscriptionAccess, getEventById);
router.delete("/:id", protect, checkSubscriptionAccess, deleteEvent);


export default router;
