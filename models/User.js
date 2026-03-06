import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    firstname: {
      type: String,
      required: true,
      trim: true
    },
    lastname: {
      type: String,
      required: true,
      trim: true
    },
    country_code: {
      type: String,
      default: "+91",
      trim: true
    },
    phone: {
      type: String,
      required: false, // Changed from true to false
      trim: true,
      validate: {
        validator: function (v) {
          // If value is provided (not empty string or null), it must be 10 digits
          // We allow empty string because unique:sparse handles nulls/undefined better,
          // but frontend might send empty string.
          if (v === null || v === undefined || v === '') return true;
          return /^\d{10}$/.test(v);
        },
        message: 'Phone must be exactly 10 digits'
      }
    },
    password: {
      type: String,
      select: false // Don't return password by default
    },
    is_verified: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active'
    },
    is_deleted: {
      type: Boolean,
      default: false
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    isSuperAdmin: {
      type: Boolean,
      default: false
    },
    ipAddress: {
      type: String, // Registration IP
      trim: true
    },
    lastLoginIp: {
      type: String, // Last Login IP
      trim: true
    },
    lastActive: {
      type: Date
    },
    otp: {
      type: String,
      select: false // Don't return OTP by default
    },
    otpExpires: {
      type: Date,
      select: false // Don't return OTP expiration by default
    },
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'pro'],
        default: 'free'
      },
      status: {
        type: String,
        enum: ['active', 'expired'],
        default: 'active'
      },
      expiryDate: {
        type: Date
      },
      startDate: {
        type: Date
      },
      hasSelected: {
        type: Boolean,
        default: false
      },
      razorpayCustomerId: {
        type: String
      },
      razorpaySubscriptionId: {
        type: String
      }
    },
    // Family Sharing fields
    primary_account_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    family_members: [{
      type: Schema.Types.ObjectId,
      ref: "User"
    }],
    isFirstLogin: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ is_deleted: 1, status: 1 });

// Virtual populate for Profile (one-to-one)
userSchema.virtual('profile', {
  ref: 'Profile',
  localField: '_id',
  foreignField: 'user',
  justOne: true
});

userSchema.set('toObject', { virtuals: true });
userSchema.set('toJSON', { virtuals: true });

export default mongoose.model("User", userSchema);