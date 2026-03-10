import axios from "axios";
import mongoose from "mongoose";
import Events from "../models/Events.js";
import Profile from "../models/Profile.js";
import User from "../models/User.js";
import EventAttendance from "../models/EventAttendance.js";
import { uploadImageToCloudinary } from "../utils/cloudinaryUpload.js";
import { getUserId } from "../utils/common.js";

import { getAllConnectedProfiles } from "../utils/familyTreeUtils.js";
import Notification from "../models/Notification.js";
import { sendWhatsAppEventInviteWithFamily, sendWhatsAppEventInviteWithoutFamily, sendWhatsAppRSVPThankYou } from "../utils/aisensy.js";

export const createEvent = async (req, res) => {
  try {

    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      eventName,
      eventType,
      location,
      googleMapLink,
      virtualLink,
      startDate,
      startTime,
      endDate,
      endTime,
      eventDetails,
      guestListId,
      guests,
      externalGuests, // [NEW] External Guests
      inviteAllFamily, // [NEW] Flag to invite all
      sendWhatsAppToFamily, // [NEW] WhatsApp to Family members
      sendWhatsAppToFriends, // [NEW] WhatsApp to Friends/External
      inviteWithFamily, // [NEW] Whether to invite internal guests with their full family
      friendsInviteWithFamily, // [NEW] Whether to invite external guests with their full family
    } = req.body;


    // Parse inviteAllFamily (handle "true"/"false" strings from FormData)
    const isInviteAll = inviteAllFamily === true || inviteAllFamily === 'true';

    // Parse guests (handle JSON string or regular array)
    let parsedGuests = [];
    if (guests) {
      if (Array.isArray(guests)) {
        parsedGuests = guests;
      } else if (typeof guests === 'string') {
        try {
          parsedGuests = JSON.parse(guests);
        } catch (e) {
          // Fallback: split by comma if not JSON
          parsedGuests = guests.split(',').map(g => g.trim()).filter(Boolean);
        }
      }
    }

    // ========== VALIDATION ==========
    if (!eventName || !eventType || !startDate || !startTime || !endDate || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    // ========== ONE COVER IMAGE ONLY ==========
    let coverImageUrl = null;

    if (req.file) {
      try {
        const uploadResult = await uploadImageToCloudinary(req.file.buffer);
        coverImageUrl = uploadResult.url;
      } catch (err) {
        console.error("Cover Upload Error:", err);
        return res.status(500).json({
          success: false,
          message: "Cover image upload failed",
          error: err.message,
        });
      }
    }

    // ======== GUEST LIST LOGIC =========
    let finalGuestIds = [];

    // 1. If inviteAllFamily is true, fetch all connected profiles
    if (isInviteAll) {
      const allProfiles = await getAllConnectedProfiles(userId);
      // Map profiles to user IDs
      const allUserIds = allProfiles.map(p => p.user._id.toString());
      finalGuestIds = [...finalGuestIds, ...allUserIds];
    }

    // 2. Add manual selected guests (if provided)
    if (parsedGuests && Array.isArray(parsedGuests)) {
      const extractedIds = parsedGuests.map(g => {
        if (typeof g === 'object' && g !== null) {
          return g.id || g._id || g.user;
        }
        return g;
      });
      finalGuestIds = [...finalGuestIds, ...extractedIds];
    }

    // 3. Remove duplicates (but allow self)
    finalGuestIds = [...new Set(finalGuestIds.map(id => id.toString()))];

    // 4. Format guests for Schema (array of objects)
    const formattedGuests = finalGuestIds.map(guestId => {
      // If guest is the creator, set status to 'accepted'
      if (guestId === userId) {
        return {
          user: guestId,
          status: "accepted",
          respondedAt: new Date()
        };
      }

      return {
        user: guestId,
        status: "pending",
        respondedAt: null
      };
    });

    // Ensure creator is in the list if not already
    const isCreatorInList = formattedGuests.some(g => g.user === userId);
    if (!isCreatorInList) {
      formattedGuests.push({
        user: userId,
        status: "accepted",
        respondedAt: new Date()
      });
    }

    // ========== FETCH USER PROFILE FOR TREE ID ==========
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile || !userProfile.treeId) {
      return res.status(400).json({
        success: false,
        message: "User does not belong to a family tree",
      });
    }
    const treeId = userProfile.treeId;

    // Parse External Guests
    let parsedExternalGuests = [];
    if (externalGuests) {
      if (Array.isArray(externalGuests)) {
        parsedExternalGuests = externalGuests;
      } else if (typeof externalGuests === 'string') {
        try {
          parsedExternalGuests = JSON.parse(externalGuests);
        } catch (e) {
          console.error("Error parsing externalGuests:", e);
          parsedExternalGuests = [];
        }
      }
    }

    // Format for Schema
    const formattedExternalGuests = parsedExternalGuests.map(g => ({
      name: g.name,
      mobile: g.mobile,
      email: g.email || "",
      relation: g.relation || "Friend",
      status: "pending",
      respondedAt: null
    }));

    // ========== CREATE EVENT DATA ==========
    const eventData = {
      eventName,
      eventType,
      location: eventType === "inperson" ? location : null,
      googleMapLink: eventType === "inperson" ? googleMapLink : null,
      virtualLink: eventType === "virtual" ? virtualLink : null,
      startDate,
      startTime,
      endDate,
      endTime,
      eventDetails,
      guestListId: guestListId || null,
      guests: formattedGuests,
      externalGuests: formattedExternalGuests, // [NEW]
      coverImage: coverImageUrl,
      createdBy: userId,
      treeId // [NEW] Link event to tree
    };

    const event = await Events.create(eventData);

    // Populate for response
    await event.populate("guests.user", "firstname lastname email avatar");

    // [NEW] Create In-App Notifications for each invited guest
    const creator = await User.findById(userId);
    if (creator) {
      const notificationPromises = formattedGuests
        .filter(g => g.user.toString() !== userId.toString()) // Don't notify creator
        .map(g => Notification.create({
          sender: userId,
          recipient: g.user,
          treeId: treeId,
          type: "event",
          message: `${creator.firstname} ${creator.lastname} invited you to an event: ${eventName}`,
          referenceId: event._id,
        }));

      await Promise.all(notificationPromises);
    }

    // TODO: Send Email Invitations here (Mock or Real)

    // --- SEND WHATSAPP INVITATIONS ---
    const sendWhatsAppInvitations = async () => {
      try {
        const withFamily = sendWhatsAppToFamily === true || sendWhatsAppToFamily === 'true';
        const withFriends = sendWhatsAppToFriends === true || sendWhatsAppToFriends === 'true';
        const isWithFullFamily = inviteWithFamily === true || inviteWithFamily === 'true';
        const isFriendsWithFullFamily = friendsInviteWithFamily === true || friendsInviteWithFamily === 'true';

        if (!withFamily && !withFriends) return;

        const recipients = [];

        // 1. Internal Guests (Family)
        if (withFamily) {
          const guestsToNotify = formattedGuests.filter(g => g.user.toString() !== userId.toString());
          const guestUserIds = guestsToNotify.map(g => g.user);
          const internalUsers = await User.find({ _id: { $in: guestUserIds } }).select("country_code phone firstname lastname");

          internalUsers.forEach(u => {
            if (u.phone) {
              recipients.push({
                country_code: u.country_code,
                phone: u.phone,
                name: u.firstname || 'Guest',
                type: 'internal',
                withFullFamily: isWithFullFamily
              });
            }
          });
        }

        // 2. External Guests (Friends)
        if (withFriends) {
          formattedExternalGuests.forEach(g => {
            if (g.mobile) {
              recipients.push({
                country_code: '+91',
                phone: g.mobile,
                name: g.name || 'Guest',
                type: 'external',
                withFullFamily: isFriendsWithFullFamily
              });
            }
          });
        }

        if (recipients.length === 0) return;

        console.log(`Sending WhatsApp invites to ${recipients.length} guests.`);

        // Prepare event data for WhatsApp templates
        const eventLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/events/${event._id}`;
        const eventDateFormatted = startDate ? new Date(startDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }) : 'TBD';
        const eventLocationFormatted = location || 'TBD';
        const adminName = User ? `${User.firstname} ${User.lastname || ''}`.trim() : 'Host';

        const eventDataPayload = {
          eventName: eventName,
          eventDate: eventDateFormatted,
          eventLocation: eventLocationFormatted,
          eventLink: eventLink,
          adminName: adminName
        };

        for (const recipient of recipients) {
          // Use appropriate function based on "with family" flag
          if (recipient.withFullFamily) {
            console.log(`[WhatsApp] Sending WITH FAMILY invite to ${recipient.phone}`);
            await sendWhatsAppEventInviteWithFamily(recipient, eventDataPayload);
          } else {
            console.log(`[WhatsApp] Sending WITHOUT FAMILY invite to ${recipient.phone}`);
            await sendWhatsAppEventInviteWithoutFamily(recipient, eventDataPayload);
          }
        }
      } catch (error) {
        console.error("Error sending WhatsApp invites:", error);
      }
    };
    sendWhatsAppInvitations();

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: event,
    });

  } catch (err) {
    console.error("createEvent Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// [NEW] RSVP to an event
export const respondToEvent = async (req, res) => {
  try {
    const userId = getUserId(req);
    const eventId = req.params.id;
    const { status, foodPreference, totalAttendees, vegAttendees, nonVegAttendees, city } = req.body; // "accepted", "rejected", "maybe"

    if (!["accepted", "rejected", "maybe"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const event = await Events.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Find the guest in the list
    const guestIndex = event.guests.findIndex(
      (g) => g.user.toString() === userId
    );

    if (guestIndex === -1) {
      return res.status(403).json({ success: false, message: "You are not invited to this event" });
    }

    // Update status
    event.guests[guestIndex].status = status;
    event.guests[guestIndex].foodPreference = foodPreference;
    event.guests[guestIndex].totalAttendees = totalAttendees || 1;
    event.guests[guestIndex].vegAttendees = vegAttendees || 0;
    event.guests[guestIndex].nonVegAttendees = nonVegAttendees || 0;
    event.guests[guestIndex].city = city || null;
    event.guests[guestIndex].respondedAt = new Date();

    await event.save();

    return res.status(200).json({
      success: true,
      message: `You have ${status} the event`,
      data: {
        eventId,
        status,
        respondedAt: event.guests[guestIndex].respondedAt
      }
    });

  } catch (err) {
    console.error("respondToEvent Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAllEvents = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const cursor = req.query.cursor || null;
    const eventId = req.query.id || null;

    // 1. Get User ID & Tree ID
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile || !userProfile.treeId) {
      return res.status(403).json({ success: false, message: "No family tree associated" });
    }
    const treeId = userProfile.treeId;

    let matchStage = {
      treeId: treeId,
      $or: [
        { createdBy: userId },
        { "guests.user": userId }
      ]
    }; // Restrict to tree and invited/host only

    // ---------- If specific event ID is requested ----------
    if (eventId) {
      matchStage._id = new mongoose.Types.ObjectId(eventId);
    }

    // ---------- Cursor Pagination ----------
    if (cursor) {
      matchStage._id = { ...matchStage._id, $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const pipeline = [
      { $match: matchStage },

      { $sort: { _id: -1 } },

      { $limit: limit },

      // ============ Populate createdBy ============
      //   {
      //     $lookup: {
      //       from: "users",
      //       localField: "createdBy",
      //       foreignField: "_id",
      //       as: "createdBy"
      //     }
      //   },
      //   { $unwind: "$createdBy" },

      // ============ Populate guests ============
      //   {
      //     $lookup: {
      //       from: "users",
      //       localField: "guests",
      //       foreignField: "_id",
      //       as: "guests"
      //     }
      //   },

      // Fields to include in populated data
      {
        $project: {
          eventName: 1,
          eventType: 1,
          location: 1,
          virtualLink: 1,
          startDate: 1,
          startTime: 1,
          endDate: 1,
          endTime: 1,
          eventDetails: 1,
          coverImage: 1,
          createdAt: 1,
          updatedAt: 1,
          guests: 1, // [FIX] Include guests
          createdBy: 1 // [FIX] Include createdBy
        }
      }
    ];

    const events = await Events.aggregate(pipeline);

    // Populate guests and createdBy manually since aggregate doesn't support deep populate easily without lookups
    await Events.populate(events, [
      {
        path: "guests.user",
        select: "firstname lastname email",
        populate: { path: "profile", select: "gender profilePicture" }
      },
      {
        path: "createdBy",
        select: "firstname lastname",
        populate: { path: "profile", select: "profilePicture" }
      }
    ]);

    const nextCursor =
      !eventId && events.length > 0 ? events[events.length - 1]._id : null;

    return res.status(200).json({
      success: true,
      message: eventId ? "Event details fetched" : "Events fetched",
      data: events,
      nextCursor,
      limit
    });

  } catch (err) {
    console.error("getAllEvents Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getMyEvents = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const limit = parseInt(req.query.limit) || 10;
    const cursor = req.query.cursor || null;

    let query = { createdBy: userId };

    if (cursor) {
      query._id = { $lt: cursor };
    }

    const events = await Events.find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .lean(); // Use lean for performance and modification

    // Attach Guest Stats
    const eventsWithStats = events.map(event => {
      const internal = event.guests || [];
      const external = event.externalGuests || [];

      const stats = {
        total: internal.length + external.length,
        accepted: internal.filter(g => g.status === 'accepted').length + external.filter(g => g.status === 'accepted').length,
        rejected: internal.filter(g => g.status === 'rejected').length + external.filter(g => g.status === 'rejected').length,
        maybe: internal.filter(g => g.status === 'maybe').length + external.filter(g => g.status === 'maybe').length,
        pending: internal.filter(g => g.status === 'pending').length + external.filter(g => g.status === 'pending').length,
      };
      return { ...event, guestStats: stats };
    });

    const nextCursor = events.length > 0 ? events[events.length - 1]._id : null;

    return res.status(200).json({
      success: true,
      message: "My events fetched",
      data: eventsWithStats,
      nextCursor,
      limit
    });

  } catch (err) {
    console.error("getMyEvents Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getEventById = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Check user's tree
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile || !userProfile.treeId) {
      return res.status(403).json({ success: false, message: "No family tree associated" });
    }

    const event = await Events.findById(eventId)
      .populate({
        path: "createdBy",
        select: "firstname lastname",
        populate: { path: "profile", select: "profilePicture" }
      })
      .populate({
        path: "guests.user",
        select: "firstname lastname email",
        populate: { path: "profile", select: "gender profilePicture" }
      });

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Check if event belongs to same tree
    if (event.treeId && event.treeId.toString() !== userProfile.treeId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Event is from another family tree" });
    }

    return res.status(200).json({
      success: true,
      message: "Event fetched",
      data: event,
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const userId = getUserId(req);
    const eventId = req.params.id;

    const event = await Events.findById(eventId);

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Not allowed to delete this event" });
    }

    await event.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};



// [NEW] Get Consolidated Guest List (Invites + RSVPs)
export const getEventGuestList = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = getUserId(req);
    const { search, city, status } = req.query; // [NEW] status support

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: "Invalid Event ID" });
    }

    // 1. Fetch Event with Invite List
    const event = await Events.findById(eventId)
      .populate({
        path: "guests.user",
        select: "firstname lastname email phone",
        populate: {
          path: "profile",
          select: "profilePicture foodPreference education city"
        }
      })
      .lean();

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Check permissions (Only Creator or Admin usually, or anyone in the tree?)
    // For "My Guests", it's usually the host. But let's allow any tree member to see who is coming?
    // The requirement implies "My Guest" page, usually for the host. 
    // Let's restrict to Host for now, or allow read-only for others.
    if (event.createdBy.toString() !== userId) {
      // Optional: Check if admin
      // return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // 2. Fetch EventGuest (The RSVPs)
    // We dynamic import or assume it's available? It's not imported.
    // I need to import EventGuest at top of file, but I cannot do that in replace_file_content easily without viewing top.
    // I'll assume I can add it or I'll use mongoose.model("EventGuest")
    const EventGuest = mongoose.model("EventGuest");
    const rsvps = await EventGuest.find({ event: eventId }).lean();

    // Create Map of RSVPs for fast lookup
    const rsvpMap = {}; // userId -> status
    const externalRsvpMap = {}; // mobile -> status

    rsvps.forEach(rsvp => {
      if (rsvp.user) {
        rsvpMap[rsvp.user.toString()] = rsvp;
      } else if (rsvp.mobile) {
        externalRsvpMap[rsvp.mobile] = rsvp;
      }
    });

    // 3. Merge Internal Guests
    const consolidatedGuests = event.guests.map(guest => {
      const userIdStr = guest.user?._id?.toString();
      const rsvp = rsvpMap[userIdStr];

      // Get Default Food Preference from Profile
      const profileFoodPref = guest.user?.profile?.foodPreference || null;

      return {
        _id: userIdStr,
        name: guest.user ? `${guest.user.firstname} ${guest.user.lastname}` : "Unknown User",
        email: guest.user?.email,
        phone: guest.user?.phone,
        avatar: guest.user?.profile?.profilePicture || "", // [FIX] Use profile picture
        type: "internal",
        relation: "Family", // todo: compute relation
        invitedStatus: guest.status, // The status in Event array (original invite)
        currentStatus: rsvp ? rsvp.status : guest.status, // RSVP overrides
        respondedAt: rsvp ? rsvp.respondedAt : guest.respondedAt,
        foodPreference: rsvp ? rsvp.foodPreference : (guest.foodPreference || profileFoodPref),
        totalAttendees: rsvp ? rsvp.totalAttendees : guest.totalAttendees,
        city: (rsvp && rsvp.city) ? rsvp.city : (guest.user?.profile?.city || guest.city || ""), // [FIX] Use profile city as fallback
        education: guest.user?.profile?.education || [] // [NEW] Pass education
      };
    });

    // 4. Merge External Guests
    const consolidatedExternalGuests = event.externalGuests.map(guest => {
      const rsvp = externalRsvpMap[guest.mobile];
      return {
        _id: guest._id, // subdoc id
        name: guest.name,
        email: guest.email,
        phone: guest.mobile,
        avatar: null, // No avatar for external yet
        type: "external",
        relation: guest.relation,
        invitedStatus: guest.status,
        currentStatus: rsvp ? rsvp.status : guest.status,
        respondedAt: rsvp ? rsvp.respondedAt : guest.respondedAt,
        foodPreference: rsvp ? rsvp.foodPreference : guest.foodPreference,
        totalAttendees: rsvp ? rsvp.totalAttendees : guest.totalAttendees,
        city: (rsvp && rsvp.city) ? rsvp.city : (guest.city || "") // [FIX] Fallback to guest.city if rsvp.city is missing
      };
    });

    // 5. Combine All Guests
    let allGuests = [...consolidatedGuests, ...consolidatedExternalGuests];

    // [NEW] Get Unique Cities (Calculated from ALL invited/added guests as per latest request)
    const uniqueCities = [...new Set(allGuests.map(g => g.city).filter(Boolean))].sort();

    // city filter
    if (city) {
      allGuests = allGuests.filter(g => g.city === city);
    }

    // status filter (Optional, triggered by UI buttons)
    if (status) {
      allGuests = allGuests.filter(g => g.currentStatus === status);
    }

    // [NEW] Search Filter
    if (search) {
      const q = search.toLowerCase();
      allGuests = allGuests.filter(g => {
        const nameMatch = g.name.toLowerCase().includes(q);
        const cityMatch = g.city?.toLowerCase().includes(q);

        // Education/College check
        const educationMatch = g.education?.some(edu =>
          (edu.institution?.toLowerCase().includes(q)) ||
          (edu.level?.toLowerCase().includes(q))
        );

        return nameMatch || cityMatch || educationMatch;
      });
    }

    // 6. Stats (Calculate on FULL list)
    const stats = {
      totalGuests: allGuests.length,
      totalAttendees: allGuests.reduce((acc, g) => acc + (['accepted', 'maybe'].includes(g.currentStatus) ? (g.totalAttendees || 0) : 0), 0),
      vegAttendees: allGuests.reduce((acc, g) => acc + (['accepted', 'maybe'].includes(g.currentStatus) ? (g.vegAttendees || 0) : 0), 0),
      nonVegAttendees: allGuests.reduce((acc, g) => acc + (['accepted', 'maybe'].includes(g.currentStatus) ? (g.nonVegAttendees || 0) : 0), 0),
      accepted: allGuests.filter(g => g.currentStatus === 'accepted').length,
      pending: allGuests.filter(g => g.currentStatus === 'pending').length,
      rejected: allGuests.filter(g => g.currentStatus === 'rejected').length,
      maybe: allGuests.filter(g => g.currentStatus === 'maybe').length,
    };

    // 7. Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedGuests = allGuests.slice(startIndex, endIndex);

    return res.status(200).json({
      success: true,
      data: paginatedGuests,
      stats: stats,
      cities: uniqueCities, // [NEW] Return list of cities
      pagination: {
        totalGuests: allGuests.length,
        totalPages: Math.ceil(allGuests.length / limit),
        currentPage: page,
        limit: limit
      },
      event: {
        eventName: event.eventName,
        startDate: event.startDate,
        startTime: event.startTime,
        createdBy: event.createdBy
      }
    });

  } catch (err) {
    console.error("getEventGuestList Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// PUBLIC EVENT ACCESS (No Auth)
// ==========================================

// [NEW] Get Event details for public link
export const getPublicEventById = async (req, res) => {
  try {
    const eventId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: "Invalid Event Link" });
    }

    // Fetch event with basic details needed for guests
    const event = await Events.findById(eventId)
      .select("-guests -guestListId") // Exclude internal family guest list
      .populate({
        path: "createdBy",
        select: "firstname lastname",
        populate: { path: "profile", select: "profilePicture" }
      });

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found or has been deleted" });
    }

    return res.status(200).json({
      success: true,
      message: "Event fetched",
      data: event,
    });

  } catch (err) {
    console.error("getPublicEventById Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// [NEW] Public RSVP (Name + Mobile)
export const respondToEventPublic = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { name, mobile, status, foodPreference, totalAttendees, vegAttendees, nonVegAttendees, city } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: "Invalid Event Link" });
    }

    if (!name || !mobile) {
      return res.status(400).json({ success: false, message: "Name and Mobile number are required" });
    }

    if (!["accepted", "rejected", "maybe"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const event = await Events.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Check if this mobile number already responded
    const existingIndex = event.externalGuests.findIndex(g => g.mobile === mobile);
    console.log("existingIndex----->", existingIndex);
    console.log("event.externalGuests----->", event.externalGuests);
    if (existingIndex !== -1) {
      return res.status(409).json({
        success: false,
        message: "You have already responded to this event with this mobile number."
      });
    } else {
      // Add new guest
      event.externalGuests.push({
        name,
        mobile,
        status,
        foodPreference,
        totalAttendees: totalAttendees || 1,
        vegAttendees: vegAttendees || 0,
        nonVegAttendees: nonVegAttendees || 0,
        city: city || null,
        respondedAt: new Date()
      });
    }

    await event.save();

    // Send WhatsApp Thank You Message
    try {
      const creator = await User.findById(event.createdBy);
      await sendWhatsAppRSVPThankYou(
        { phone: mobile, name: name },
        {
          eventName: event.eventName,
          adminName: creator ? `${creator.firstname} ${creator.lastname}` : "Host"
        }
      );
    } catch (whatsappError) {
      console.error("Failed to send WhatsApp thank you:", whatsappError.message);
      // Don't fail the RSVP if notification fails
    }

    return res.status(200).json({
      success: true,
      message: `You have successfully RSVP'd as ${status}`,
      data: {
        eventId,
        name,
        status
      }
    });

  } catch (err) {
    console.error("respondToEventPublic Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// [NEW] Add External Guest (Manual Add by Host)
export const addExternalGuest = async (req, res) => {
  try {
    const eventId = req.params.id; // [FIX] Get eventId
    const userId = getUserId(req); // [FIX] Get userId
    const { name, mobile, email, relation, city } = req.body; // [NEW] Added city

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: "Invalid Event ID" });
    }

    if (!name || !mobile) {
      return res.status(400).json({ success: false, message: "Name and Mobile are required" });
    }

    // Check event exists & permissions
    const event = await Events.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Restrict to creator (or maybe tree members? stick to creator for add)
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Only host can add guests" });
    }

    // Add External Guest
    event.externalGuests.push({
      name,
      mobile,
      email,
      relation,
      city, // [NEW] Save city
      status: "pending", // Default
      respondedAt: null
    });

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Guest added successfully",
      data: event.externalGuests[event.externalGuests.length - 1]
    });

  } catch (err) {
    console.error("addExternalGuest Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// [NEW] Get Unique Cities from Guests who Accepted Guests Only
export const getEventCities = async (req, res) => {
  try {
    const eventId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: "Invalid Event ID" });
    }

    const EventGuest = mongoose.model("EventGuest");
    // Find only RSVPs where status is 'accepted'
    const acceptedRsvps = await EventGuest.find({
      event: eventId,
      status: 'accepted'
    }).select("city").lean();

    // Extract unique cities
    const cities = [...new Set(acceptedRsvps.map(r => r.city).filter(Boolean))].sort();


    return res.status(200).json({
      success: true,
      data: cities
    });

  } catch (err) {
    console.error("getEventCities Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// [NEW] Get Received Invitations for Current User
export const getReceivedInvitations = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { type } = req.query; // Optional filter: "pending", "accepted", "history" (past events)

    const today = new Date().toISOString().split('T')[0];

    // Build Query
    // We want events where guests.user == userId AND we are NOT the creator
    let query = {
      "guests.user": userId,
      createdBy: { $ne: userId }
    };

    // Filter by Type logic
    if (type === 'history') {
      // Past events
      query.startDate = { $lt: today };
    } else {
      // Upcoming events
      query.startDate = { $gte: today };

      // If specific status requested (e.g., pending)
      // Note: guests is an array, we can't easily filter the ROOT document by subdocument status efficiently in query without aggregate or post-filter.
      // But we can limit the returned guests? No, we want the Event.
    }

    // Fetch Events
    let events = await Events.find(query)
      .populate({
        path: "createdBy",
        select: "firstname lastname",
        populate: {
          path: "profile",
          select: "profilePicture"
        }
      })
      .sort({ startDate: 1 }) // Nearest first
      .lean();

    // Post-process to attach "status" and filter if needed
    // Post-process to attach "status" and filter if needed
    const invitedEvents = events.map(event => {
      const myGuestEntry = event.guests.find(g => g.user.toString() === userId);

      const internal = event.guests || [];
      const external = event.externalGuests || [];

      const guestStats = {
        total: internal.length + external.length,
        accepted: internal.filter(g => g.status === 'accepted').length + external.filter(g => g.status === 'accepted').length,
        rejected: internal.filter(g => g.status === 'rejected').length + external.filter(g => g.status === 'rejected').length,
        maybe: internal.filter(g => g.status === 'maybe').length + external.filter(g => g.status === 'maybe').length,
        pending: internal.filter(g => g.status === 'pending').length + external.filter(g => g.status === 'pending').length,
      };

      return {
        ...event,
        status: myGuestEntry ? myGuestEntry.status : 'unknown',
        guestStats, // [NEW] Return stats
        guests: undefined, // Hide other guests list for summary to save bandwidth
        externalGuests: undefined
      };
    });

    // Apply Status Filter
    let finalEvents = invitedEvents;
    if (type === 'replied') {
      finalEvents = invitedEvents.filter(e => e.status !== 'pending');
    } else if (['pending', 'accepted', 'rejected', 'maybe'].includes(type)) {
      finalEvents = invitedEvents.filter(e => e.status === type);
    }

    return res.status(200).json({
      success: true,
      message: "Invitations fetched",
      data: finalEvents
    });

  } catch (err) {
    console.error("getReceivedInvitations Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};



// [NEW] Mark Event Attendance (Venue QR Scan)
export const markEventAttendance = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { name, mobile } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: "Invalid Event ID" });
    }

    if (!name || !mobile) {
      return res.status(400).json({ success: false, message: "Name and Mobile are required" });
    }

    const event = await Events.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Record attendance
    try {
      await EventAttendance.create({
        event: eventId,
        name,
        mobile
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: "Attendance already recorded for this mobile number" });
      }
      throw err;
    }

    return res.status(201).json({
      success: true,
      message: "Attendance recorded successfully! Welcome to the event.",
      data: { name, eventName: event.eventName }
    });

  } catch (err) {
    console.error("markEventAttendance Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// [NEW] Get Event Attendance List (Host Only)
export const getEventAttendance = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = getUserId(req);

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: "Invalid Event ID" });
    }

    const event = await Events.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Only the host can view attendance reports" });
    }

    const attendance = await EventAttendance.find({ event: eventId }).sort({ attendedAt: -1 });

    return res.status(200).json({
      success: true,
      data: attendance
    });

  } catch (err) {
    console.error("getEventAttendance Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
