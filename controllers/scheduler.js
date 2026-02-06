import cron from 'node-cron';
import Events from '../models/Events.js';
import Notification from '../models/Notification.js';
import Notice from '../models/Notice.js';
import User from '../models/User.js';

export const initScheduler = () => {
    // Schedule a task to run every day at 09:00 AM (server time)
    cron.schedule('0 9 * * *', async () => {
        console.log('Running daily housekeeping tasks...');
        await Promise.all([
            checkAndSendEventReminders(),
            deleteOldNotices(),
            checkSubscriptionExpiry()
        ]);
    });
};

const deleteOldNotices = async () => {
    try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        console.log('Deleting notices older than:', oneYearAgo);

        // Deleting notices where endDate (if exists) is older than 1 year, 
        // OR where createdAt is older than 1 year (if no endDate).
        const result = await Notice.deleteMany({
            $or: [
                { endDate: { $lt: oneYearAgo } },
                { $and: [{ endDate: { $exists: false } }, { createdAt: { $lt: oneYearAgo } }] },
                { $and: [{ endDate: null }, { createdAt: { $lt: oneYearAgo } }] }
            ]
        });

        console.log(`Deleted ${result.deletedCount} old notices.`);
    } catch (error) {
        console.error("Error in deleteOldNotices:", error);
    }
};

const checkAndSendEventReminders = async () => {
    try {
        const today = new Date();
        const reminderDate = new Date(today);
        reminderDate.setDate(today.getDate() + 2); // Target: 2 days from now

        const targetDateString = reminderDate.toISOString().split('T')[0];

        const events = await Events.find({ startDate: targetDateString });

        for (const event of events) {
            if (!event.guests || event.guests.length === 0) continue;

            const guestsToNotify = event.guests.filter(g =>
                g.user && (g.status === 'accepted' || g.status === 'pending')
            );

            for (const guest of guestsToNotify) {
                // Create Notification for specific guest
                await Notification.create({
                    sender: event.createdBy,
                    recipient: guest.user, // Target specific user
                    treeId: event.treeId,
                    type: "event",
                    message: `Reminder: You have an event "${event.eventName}" in 2 days!`,
                    referenceId: event._id,
                });
            }
        }
    } catch (error) {
        console.error("Error in checkAndSendEventReminders:", error);
    }
};

const checkSubscriptionExpiry = async () => {
    try {
        console.log("Checking for subscription expiries...");
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Define target dates for 7 days and 1 day before expiry
        const sevenDaysFromNow = new Date(today);
        sevenDaysFromNow.setDate(today.getDate() + 7);

        const oneDayFromNow = new Date(today);
        oneDayFromNow.setDate(today.getDate() + 1);

        // Helper to match exact day
        const getDayRange = (date) => {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            return { $gte: start, $lte: end };
        };

        const expiringUsers = await User.find({
            $or: [
                { "subscription.expiryDate": getDayRange(sevenDaysFromNow) },
                { "subscription.expiryDate": getDayRange(oneDayFromNow) }
            ],
            "subscription.status": "active"
        });

        for (const user of expiringUsers) {
            // We need profile to get treeId
            // Importing Profile dynamically to avoid circular dependency issues if any
            const Profile = (await import('../models/Profile.js')).default;
            const userProfile = await Profile.findOne({ user: user._id });

            if (userProfile && userProfile.treeId) {
                const daysLeft = Math.ceil((new Date(user.subscription.expiryDate) - today) / (1000 * 60 * 60 * 24));

                await Notification.create({
                    sender: user._id, // Self-reminder
                    recipient: user._id,
                    treeId: userProfile.treeId,
                    type: "subscription",
                    message: `Your subscription will expire in ${daysLeft} days. Renew now to avoid interruption.`,
                    referenceId: user._id
                });
                console.log(`Sent expiry notification to ${user.firstname} (${daysLeft} days left)`);
            }
        }

    } catch (error) {
        console.error("Error in checkSubscriptionExpiry:", error);
    }
};
