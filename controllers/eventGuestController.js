import mongoose from "mongoose";
import EventGuest from "../models/EventGuest.js";
import Events from "../models/Events.js";
import { getUserId } from "../utils/common.js";

// Get Guests with Pagination
export const getEventGuests = async (req, res) => {
    try {
        const eventId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const status = req.query.status || "";

        // Advanced Filters
        const {
            ageMin, ageMax, gender, marital_status,
            city, state, dobStart, dobEnd,
            anniversaryStart, anniversaryEnd,
            jobCategory, foodPreference, bloodGroup
        } = req.query;

        const skip = (page - 1) * limit;

        // Base match for the event
        const matchStage = { event: new mongoose.Types.ObjectId(eventId) };

        // Basic Filters (Status & Search)
        if (status) {
            matchStage.status = status;
        } else {
            matchStage.status = { $ne: "pending" };
        }

        if (search) {
            matchStage.$or = [
                { name: { $regex: search, $options: "i" } },
                { mobile: { $regex: search, $options: "i" } },
                { city: { $regex: search, $options: "i" } }
            ];
        }

        // Create Aggregation Pipeline
        const pipeline = [
            { $match: matchStage },
            // Join with User
            {
                $lookup: {
                    from: "users",
                    localField: "user",
                    foreignField: "_id",
                    as: "userData"
                }
            },
            { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },
            // Join with Profile
            {
                $lookup: {
                    from: "profiles",
                    localField: "user",
                    foreignField: "user",
                    as: "profileData"
                }
            },
            { $unwind: { path: "$profileData", preserveNullAndEmptyArrays: true } }
        ];

        // Apply Advanced Filters in a $match stage after lookups
        const advancedMatch = {};

        if (ageMin || ageMax) {
            advancedMatch["profileData.age"] = {};
            if (ageMin) advancedMatch["profileData.age"].$gte = parseInt(ageMin);
            if (ageMax) advancedMatch["profileData.age"].$lte = parseInt(ageMax);
        }

        if (gender && gender.length) {
            advancedMatch["profileData.gender"] = { $in: Array.isArray(gender) ? gender : [gender] };
        }

        if (marital_status && marital_status.length) {
            advancedMatch["profileData.marital_status"] = { $in: Array.isArray(marital_status) ? marital_status : [marital_status] };
        }

        if (city && city.length) {
            // Check both guest-entered city and profile city
            advancedMatch.$or = [
                { city: { $in: Array.isArray(city) ? city : [city] } },
                { "profileData.city": { $in: Array.isArray(city) ? city : [city] } }
            ];
        }

        if (state && state.length) {
            advancedMatch["profileData.state"] = { $in: Array.isArray(state) ? state : [state] };
        }

        if (dobStart || dobEnd) {
            advancedMatch["profileData.dob"] = {};
            if (dobStart) advancedMatch["profileData.dob"].$gte = new Date(dobStart);
            if (dobEnd) advancedMatch["profileData.dob"].$lte = new Date(dobEnd);
        }

        if (anniversaryStart || anniversaryEnd) {
            advancedMatch["profileData.marriageDate"] = {};
            if (anniversaryStart) advancedMatch["profileData.marriageDate"].$gte = new Date(anniversaryStart);
            if (anniversaryEnd) advancedMatch["profileData.marriageDate"].$lte = new Date(anniversaryEnd);
        }

        if (jobCategory && jobCategory.length) {
            advancedMatch["profileData.jobCategory"] = { $in: Array.isArray(jobCategory) ? jobCategory : [jobCategory] };
        }

        if (foodPreference && foodPreference.length) {
            // This is preferred from EventGuest's own RSVP data
            matchStage.foodPreference = { $in: Array.isArray(foodPreference) ? foodPreference : [foodPreference] };
        }

        if (bloodGroup && bloodGroup.length) {
            advancedMatch["profileData.bloodGroup"] = { $in: Array.isArray(bloodGroup) ? bloodGroup : [bloodGroup] };
        }

        if (Object.keys(advancedMatch).length > 0) {
            pipeline.push({ $match: advancedMatch });
        }

        // Count total matching documents
        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await EventGuest.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        // Fetch paginated results
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    _id: 1,
                    event: 1,
                    user: {
                        _id: "$userData._id",
                        firstname: "$userData.firstname",
                        lastname: "$userData.lastname",
                        email: "$userData.email",
                        avatar: "$userData.avatar"
                    },
                    name: 1,
                    mobile: 1,
                    email: 1,
                    status: 1,
                    foodPreference: 1,
                    totalAttendees: 1,
                    vegAttendees: 1,
                    nonVegAttendees: 1,
                    isExternal: 1,
                    city: 1,
                    respondedAt: 1,
                    createdAt: 1
                }
            }
        );

        const guests = await EventGuest.aggregate(pipeline);

        // Calculate Stats for the whole event (not just this page)
        // We use a separate simpler query for stats to avoid the heavy joins if not needed, 
        // but for accuracy we might want stats based on filters? 
        // Usually stats are for the WHOLE event regardless of advanced filters.
        const statsPipeline = [
            { $match: { event: new mongoose.Types.ObjectId(eventId) } }
        ];
        const allGuestsForStats = await EventGuest.aggregate(statsPipeline);
        const respondedGuests = allGuestsForStats.filter(g => g.status !== 'pending');

        const stats = {
            totalGuests: respondedGuests.length,
            accepted: allGuestsForStats.filter(g => g.status === 'accepted').length,
            maybe: allGuestsForStats.filter(g => g.status === 'maybe').length,
            rejected: allGuestsForStats.filter(g => g.status === 'rejected').length,
            totalAttendees: allGuestsForStats.reduce((acc, g) => acc + (g.status === 'accepted' || g.status === 'maybe' ? (g.totalAttendees || 0) : 0), 0),
            vegAttendees: allGuestsForStats.reduce((acc, g) => acc + (g.status === 'accepted' || g.status === 'maybe' ? (g.vegAttendees || 0) : 0), 0),
            nonVegAttendees: allGuestsForStats.reduce((acc, g) => acc + (g.status === 'accepted' || g.status === 'maybe' ? (g.nonVegAttendees || 0) : 0), 0),
        };

        return res.status(200).json({
            success: true,
            data: guests,
            stats,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        console.error("getEventGuests Error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// Auth User RSVP
export const rsvpToEvent = async (req, res) => {
    try {
        const userId = getUserId(req);
        const eventId = req.params.id;
        const { status, foodPreference, totalAttendees, vegAttendees, nonVegAttendees, city } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        // Verify Event Exists
        const event = await Events.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: "Event not found" });
        }

        // Update or Create Guest Entry
        const guestEntry = await EventGuest.findOneAndUpdate(
            { event: eventId, user: userId },
            {
                status,
                foodPreference,
                totalAttendees: totalAttendees || 1,
                vegAttendees: vegAttendees || 0,
                nonVegAttendees: nonVegAttendees || 0,
                city, // [NEW] Save city
                respondedAt: new Date(),
                isExternal: false
            },
            { new: true, upsert: true }
        );

        // ALSO update the embedded guests array in the Event document
        const guestIndex = event.guests.findIndex(g => g.user && g.user.toString() === userId.toString());

        if (guestIndex !== -1) {
            // Guest exists, update their status
            event.guests[guestIndex].status = status;
            event.guests[guestIndex].foodPreference = foodPreference || event.guests[guestIndex].foodPreference;
            event.guests[guestIndex].totalAttendees = totalAttendees || event.guests[guestIndex].totalAttendees;
            event.guests[guestIndex].vegAttendees = vegAttendees || event.guests[guestIndex].vegAttendees;
            event.guests[guestIndex].nonVegAttendees = nonVegAttendees || event.guests[guestIndex].nonVegAttendees;
            event.guests[guestIndex].city = city || event.guests[guestIndex].city; // [NEW] Sync city
            event.guests[guestIndex].respondedAt = new Date();
        } else {
            // Guest doesn't exist in embedded array, add them
            event.guests.push({
                user: userId,
                status,
                foodPreference,
                totalAttendees: totalAttendees || 1,
                vegAttendees: vegAttendees || 0,
                nonVegAttendees: nonVegAttendees || 0,
                city, // [NEW] Sync city
                respondedAt: new Date()
            });
        }

        await event.save();

        return res.status(200).json({
            success: true,
            message: `RSVP Updated: ${status}`,
            data: guestEntry
        });

    } catch (err) {
        console.error("rsvpToEvent Error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// Public Guest RSVP
export const rsvpToEventPublic = async (req, res) => {
    try {
        const eventId = req.params.id;
        const { name, mobile, status, foodPreference, totalAttendees, vegAttendees, nonVegAttendees, city } = req.body;

        if (!name || !mobile) {
            return res.status(400).json({ success: false, message: "Name and Mobile are required" });
        }

        // Check if Event Exists
        const event = await Events.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: "Event not found" });
        }

        // 1. Check if duplicate (Already Registered)
        const existingGuest = await EventGuest.findOne({ event: eventId, mobile: mobile });
        if (existingGuest) {
            return res.status(409).json({ success: false, message: "You have already responded to this event with this mobile number." });
        }

        // 2. Create Guest Entry (EventGuest)
        const guestEntry = await EventGuest.create({
            event: eventId,
            mobile,
            name,
            status,
            foodPreference,
            totalAttendees: totalAttendees || 1,
            vegAttendees: vegAttendees || 0,
            nonVegAttendees: nonVegAttendees || 0,
            city, // [NEW] Save city
            respondedAt: new Date(),
            isExternal: true
        });

        // 3. Sync with Events Model (Embedded Array)
        // Check if mobile exists in externalGuests (should not if logic is consistent, but safeguard)
        const extIndex = event.externalGuests.findIndex(g => g.mobile === mobile);

        if (extIndex !== -1) {
            // Update existing (Should strictly assume duplicate check above passed, so this might be dead code if DBs are synced, 
            // but if we treat EventGuest as truth, we update here just in case)
            event.externalGuests[extIndex].status = status;
            event.externalGuests[extIndex].name = name;
            event.externalGuests[extIndex].foodPreference = foodPreference;
            event.externalGuests[extIndex].totalAttendees = totalAttendees || 1;
            event.externalGuests[extIndex].vegAttendees = vegAttendees || 0;
            event.externalGuests[extIndex].nonVegAttendees = nonVegAttendees || 0;
            event.externalGuests[extIndex].city = city || event.externalGuests[extIndex].city; // [NEW] Sync city
            event.externalGuests[extIndex].respondedAt = new Date();
        } else {
            // Add new
            event.externalGuests.push({
                name,
                mobile,
                status,
                foodPreference,
                totalAttendees: totalAttendees || 1,
                vegAttendees: vegAttendees || 0,
                nonVegAttendees: nonVegAttendees || 0,
                city, // [NEW] Sync city
                respondedAt: new Date()
            });
        }

        await event.save();

        return res.status(200).json({
            success: true,
            message: "RSVP Submitted Successfully",
            data: guestEntry
        });

    } catch (err) {
        console.error("rsvpToEventPublic Error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
