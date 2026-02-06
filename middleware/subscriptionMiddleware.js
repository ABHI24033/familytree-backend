import User from "../models/User.js";

export const checkSubscriptionAccess = async (req, res, next) => {
    try {
        // Assume verifyToken has already run and attached req.user (id)
        // We need to fetch the full user with subscription details created_at
        const user = await User.findById(req.user.id);


        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        // 1. Check if user is on active Pro plan
        const isProActive = user.subscription &&
            user.subscription.plan === 'pro' &&
            user.subscription.status === 'active' &&
            new Date(user.subscription.expiryDate) > new Date();

        if (isProActive) {
            return next(); // Reference to next middleware
        }

        // 2. Check if user is within Free Trial (3 months)
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const createdAt = new Date(user.createdAt);

        if (createdAt > threeMonthsAgo) {
            // if (createdAt > new Date()) {
            return next(); // Still in free trial
        }

        // 3. Block access
        return res.status(403).json({
            success: false,
            message: "Free trial expired. Please upgrade to Pro plan to continue accessing this feature.",
            code: "SUBSCRIPTION_EXPIRED"
        });

    } catch (error) {
        console.error("Subscription Check Error:", error);
        return res.status(500).json({ success: false, message: "Server error checking subscription" });
    }
};
