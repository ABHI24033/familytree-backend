import mongoose, { Schema } from "mongoose";

const profileSchema = new Schema(
  {
    // Which user this profile belongs to
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Which family tree this person belongs to
    treeId: {
      type: Schema.Types.ObjectId,
      ref: "FamilyTree",
      index: true
    },

    // Core person info
    prefix: {
      type: String,
      trim: true,
      enum: ['Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'Prof.', 'Rev.', 'Fr.', 'Sr.', 'Late']
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      trim: true,
      required: true
    },
    dob: { type: Date },
    age: {
      type: Number,
      min: 0,
      max: 120,
      required: true
    },

    // store yearOfBirth for fast UI display (optional but handy)
    yearOfBirth: {
      type: Number
    },

    dateOfDeath: { type: Date },
    profilePicture: { type: String, trim: true, default: '' },

    birthPlace: { type: String, trim: true },
    deathPlace: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
    postalCode: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^\d{5,6}$/.test(v);
        },
        message: "Postal code must be 5 or 6 digits"
      }
    },

    whatsappNo: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^[6-9]\d{9}$/.test(v);
        },
        message: "Enter a valid 10-digit WhatsApp number"
      }
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: "Invalid email address"
      }
    },

    marital_status: {
      type: String,
      enum: ["single", "married", "divorced", "widowed", "separated"],
      trim: true
    },
    marriageDate: { type: Date },

    // Partner relationship (user ID) - Single partner only
    partner: { type: Schema.Types.ObjectId, ref: "User" },

    occupation: { type: String, trim: true },
    jobType: {
      type: String,
      trim: true,
      enum: [
        "full-time",
        "part-time",
        "contract",
        "freelance",
        "self-employed",
        "unemployed",
        "student",
        "retired"
      ]
    },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    jobStatus: {
      type: String,
      enum: ["active", "retired", "house-wife", "house-husband", "unemployed"]
    },

    // EDUCATION
    education: [{
      level: { type: String, trim: true },
      year: { type: String, trim: true },
      institution: { type: String, trim: true }
    }],

    // Kept for backward compatibility if needed, else can be deprecated
    // qualification: { type: String, ... },

    // EMPLOYMENT
    jobCategory: {
      type: String,
      trim: true,
      enum: ["govt", "private", "retired", "homemaker", "entrepreneur"] // Match frontend values
    },
    employmentHistory: [{
      fromYear: { type: String, trim: true },
      toYear: { type: String, trim: true },
      company: { type: String, trim: true },
      designation: { type: String, trim: true }
    }],

    foodPreference: {
      type: String,
      enum: ["veg", "non-veg", "both", "vegan", "jain"]
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"]
    },
    religion: {
      type: String,
      trim: true,
      required: true
    },
    religionDetails: { type: String, trim: true }, // For non-Christian

    lifeHistory: { type: String, maxlength: 500 },

    // DEATH & BURIAL
    burialPlace: { type: String, trim: true },

    parish: { type: String, trim: true },
    church: { type: String, trim: true },
    parishPriest: { type: String, trim: true },
    parishCoordinator: { type: String, trim: true },
    parishContact: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^[6-9]\d{9}$/.test(v);
        },
        message: "Enter a valid 10-digit contact number"
      }
    },

    // 🔗 Family relationships (always User IDs)
    father: { type: Schema.Types.ObjectId, ref: "User" },
    mother: { type: Schema.Types.ObjectId, ref: "User" },
    brothers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    sisters: [{ type: Schema.Types.ObjectId, ref: "User" }],
    sons: [{ type: Schema.Types.ObjectId, ref: "User" }],
    daughters: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // Guardian (Special role for logged-in user)
    guardian: { type: Schema.Types.ObjectId, ref: "User" },

    isCompleted: { type: Boolean, default: false }
  },
  {
    timestamps: true
  }
);

// ---- Indexes ----
profileSchema.index({ user: 1 }, { unique: true });
// profileSchema.index({ treeId: 1 }); // Removed duplicate index
profileSchema.index({ dob: 1 });
profileSchema.index({ father: 1 });
profileSchema.index({ mother: 1 });
profileSchema.index({ brothers: 1 });
profileSchema.index({ sisters: 1 });
profileSchema.index({ sons: 1 });
profileSchema.index({ daughters: 1 });
profileSchema.index({ partner: 1 });

// ---- Virtual: yearOfBirth from dob if not manually set ----
profileSchema.pre("save", function (next) {
  if (this.dob && !this.yearOfBirth) {
    this.yearOfBirth = this.dob.getFullYear();
  }
  next();
});

// ---- Virtual: normalized relationships object ----
// This matches the "correct style" response: { fatherId, motherId, partnerId, childrenIds }
profileSchema.virtual("relationships").get(function () {
  return {
    fatherId: this.father || null,
    motherId: this.mother || null,
    partnerId: this.partner || null,
    childrenIds: [
      ...(this.sons || []),
      ...(this.daughters || [])
    ]
  };
});

// Include virtuals in JSON
profileSchema.set("toObject", { virtuals: true });
profileSchema.set("toJSON", { virtuals: true });

export default mongoose.model("Profile", profileSchema);

