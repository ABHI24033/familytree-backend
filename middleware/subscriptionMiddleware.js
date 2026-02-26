import User from "../models/User.js";

export const checkSubscriptionAccess = async (req, res, next) => {
    try {
        // Assume verifyToken has already run and attached req.user (id)
        // We need to fetch the full user with subscription details created_at
        const user = await User.findById(req.user.id);


        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }

        // Helper to check trial access (150 days / 5 months)
        const hasValidTrial = (userToCheck) => {
            const trialEnd = new Date(userToCheck.createdAt);
            trialEnd.setDate(trialEnd.getDate() + 150);
            return trialEnd > new Date();
        };

        // Helper to check pro subscription access
        const hasActivePro = (userToCheck) => {
            return userToCheck.subscription &&
                userToCheck.subscription.plan === 'pro' &&
                userToCheck.subscription.status === 'active' &&
                new Date(userToCheck.subscription.expiryDate) > new Date();
        };

        // 1. Check if direct user has active Pro or Trial
        if (hasActivePro(user) || hasValidTrial(user)) {
            return next(); // Direct access granted
        }

        // 2. Check if user inherits from a primary account
        if (user.primary_account_id) {
            const primaryUser = await User.findById(user.primary_account_id);
            if (primaryUser) {
                if (hasActivePro(primaryUser) || hasValidTrial(primaryUser)) {
                    return next(); // Inherited access granted
                }
            }
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
