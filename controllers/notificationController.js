import Notification from "../models/Notification.js";
import Profile from "../models/Profile.js";
import { getUserId } from "../utils/common.js";
import mongoose from "mongoose";

// Get notifications for the user's family tree
export const getNotifications = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const { limit = 10, cursor } = req.query;
        const limitInt = parseInt(limit);

        // Get user's treeId
        const userProfile = await Profile.findOne({ user: userId });
        if (!userProfile || !userProfile.treeId) {
            return res.status(400).json({ success: false, message: "User not part of a family tree" });
        }

        const query = {
            $or: [
                // 1. Direct notifications to me
                { recipient: userId },
                // 2. Broadcasts to my tree, BUT not from me
                {
                    treeId: userProfile.treeId,
                    recipient: null, // Broadcast
                    sender: { $ne: userId } // Not my own actions
                }
            ],
            isArchived: { $ne: true }
        };

        if (cursor) {
            query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(limitInt)
            .populate({
                path: "sender",
                select: "firstname lastname avatar",
                populate: {
                    path: "profile",
                    select: "profilePicture"
                }
            });

        const nextCursor =
            notifications.length === limitInt
                ? notifications[notifications.length - 1]._id
                : null;

        res.json({
            success: true,
            data: notifications,
            nextCursor,
        });
    } catch (err) {
        console.error("Get Notifications Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// Delete a notification
export const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndDelete(id);
        res.json({ success: true, message: "Notification deleted" });
    } catch (err) {
        console.error("Delete Notification Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// Toggle archive status
export const toggleArchiveNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }
        notification.isArchived = !notification.isArchived;
        await notification.save();
        res.json({ success: true, message: notification.isArchived ? "Archived" : "Unarchived" });
    } catch (err) {
        console.error("Archive Notification Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
