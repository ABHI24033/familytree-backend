import Razorpay from 'razorpay';
import crypto from 'crypto';
import User from '../models/User.js';

// Initialize Razorpay
const getRazorpayInstance = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error("Razorpay keys not found in environment variables");
    }
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
};

// Create a subscription order
export const createSubscriptionOrder = async (req, res) => {
    try {
        const instance = getRazorpayInstance();
        const options = {
            amount: 69900, // amount in the smallest currency unit (699 INR * 100 paise)
            currency: "INR",
            receipt: `receipt_order_${Date.now()}`,
            notes: {
                userId: req.user.id,
                plan: "pro"
            }
        };


        const order = await instance.orders.create(options);

        if (!order) {
            return res.status(500).json({
                success: false,
                message: "Failed to create Razorpay order"
            });
        }

        res.status(200).json({
            success: true,
            order
        });
    } catch (error) {
        console.error("Create Order Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error creating order",
            error: error.message
        });
    }
};

/**
 * Handle initial subscription plan selection (e.g. Free Trial)
 */
export const selectSubscription = async (req, res) => {
    try {
        const { plan } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (plan === 'free') {
            // Set expiry to 150 days (5 months) from now
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 150);

            user.subscription = {
                plan: 'free',
                status: 'active',
                expiryDate: expiryDate,
                hasSelected: true // Flag to track that they've made a choice
            };
        } else if (plan === 'pro') {
            // Usually Pro is selected via payment, but if we need a manual selection
            user.subscription.hasSelected = true;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: "Subscription plan selected",
            subscription: user.subscription
        });
    } catch (error) {
        console.error("Select Subscription Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// Verify payment and update user subscription
export const verifySubscriptionPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const userId = req.user.id;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Missing payment verification parameters"
            });
        }

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Payment successful - Update user
            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            // Calculate expiry: 1 year (365 days) from now or from current expiry
            let expiryDate = new Date();
            const isUpgrade = user.subscription?.plan !== 'pro';

            // If user has ANY active subscription (Trial or Pro) with an expiry in the future, extend it
            if (user.subscription && user.subscription.status === 'active' && user.subscription.expiryDate) {
                const currentExpiry = new Date(user.subscription.expiryDate);
                if (currentExpiry > expiryDate) {
                    expiryDate = new Date(currentExpiry);
                }
            }

            expiryDate.setDate(expiryDate.getDate() + 365);

            user.subscription = {
                plan: 'pro',
                status: 'active',
                startDate: isUpgrade ? new Date() : (user.subscription?.startDate || new Date()),
                expiryDate: expiryDate,
                razorpayCustomerId: razorpay_payment_id, // storing payment ID for reference
                razorpaySubscriptionId: razorpay_order_id,
                hasSelected: true
            };

            await user.save();

            res.status(200).json({
                success: true,
                message: "Subscription upgraded successfully",
                subscription: user.subscription
            });
        } else {
            res.status(400).json({
                success: false,
                message: "Invalid payment signature"
            });
        }
    } catch (error) {
        console.error("Verify Payment Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error verifying payment"
        });
    }
};

// Check subscription status (helper for frontend)
export const getSubscriptionStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check if trial is expired (150 days)
        const expiryThreshold = new Date();
        expiryThreshold.setDate(expiryThreshold.getDate() - 150);
        let isTrialExpired = new Date(user.createdAt) < expiryThreshold;

        // Check if pro plan is active
        let isProActive = user.subscription.plan === 'pro' &&
            user.subscription.status === 'active' &&
            new Date(user.subscription.expiryDate) > new Date();

        // Check Inherited Access
        if (!isProActive && user.primary_account_id) {
            const primaryUser = await User.findById(user.primary_account_id);
            if (primaryUser) {
                const primaryIsPro = primaryUser.subscription &&
                    primaryUser.subscription.plan === 'pro' &&
                    primaryUser.subscription.status === 'active' &&
                    new Date(primaryUser.subscription.expiryDate) > new Date();

                const primaryTrialEnd = new Date(primaryUser.createdAt);
                primaryTrialEnd.setDate(primaryTrialEnd.getDate() + 150);
                const primaryHasTrial = primaryTrialEnd > new Date();

                if (primaryIsPro || primaryHasTrial) {
                    isProActive = primaryIsPro; // Treat as pro if primary is pro
                    isTrialExpired = false; // Override expired trial if inherited
                }
            }
        }

        // If pro plan expired, update status
        if (user.subscription.plan === 'pro' && !isProActive && user.subscription.status === 'active') {
            user.subscription.status = 'expired';
            await user.save();
        }

        res.status(200).json({
            success: true,
            plan: user.subscription.plan,
            status: user.subscription.status,
            isTrialExpired: isTrialExpired,
            isProActive: isProActive,
            expiryDate: user.subscription.expiryDate
        });

    } catch (error) {
        console.error("Get Status Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ---------------- FAMILY MANAGMENT ---------------- //

export const getFamilyMembers = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('family_members', 'firstname lastname phone is_verified status');
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({
            success: true,
            family_members: user.family_members || []
        });
    } catch (error) {
        console.error("Get Family Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching family members" });
    }
};

export const addFamilyMember = async (req, res) => {
    try {
        const { phone } = req.body; // or email, but currently system authenticates primarily via phone
        const primaryUserId = req.user.id;

        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone number is required." });
        }

        const primaryUser = await User.findById(primaryUserId);

        // Find target user
        const targetUser = await User.findOne({ phone, is_deleted: false });

        if (!targetUser) {
            return res.status(404).json({ success: false, message: "User not found. They must sign up first." });
        }

        if (targetUser._id.toString() === primaryUserId) {
            return res.status(400).json({ success: false, message: "You cannot add yourself to your family." });
        }

        if (targetUser.primary_account_id) {
            return res.status(400).json({ success: false, message: "This user is already part of a family plan." });
        }

        // Add to family
        targetUser.primary_account_id = primaryUserId;
        await targetUser.save();

        if (!primaryUser.family_members) {
            primaryUser.family_members = [];
        }

        // Ensure not duplicate
        if (!primaryUser.family_members.includes(targetUser._id)) {
            primaryUser.family_members.push(targetUser._id);
            await primaryUser.save();
        }

        res.status(200).json({
            success: true,
            message: "Family member added successfully",
            targetUser: {
                id: targetUser._id,
                firstname: targetUser.firstname,
                lastname: targetUser.lastname,
                phone: targetUser.phone
            }
        });
    } catch (error) {
        console.error("Add Family Member Error:", error);
        res.status(500).json({ success: false, message: "Server error linking family member" });
    }
};
