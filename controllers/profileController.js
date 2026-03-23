import mongoose from "mongoose";
import Post from "../models/Post.js";
import Poll from "../models/Poll.js";
import Profile from "../models/Profile.js";
import User from "../models/User.js";
import { uploadImageToCloudinary, deleteImageFromCloudinary, extractPublicIdFromUrl, uploadPDFToCloudinary, deleteRawFileFromCloudinary } from "../utils/cloudinaryUpload.js";
import { getUserId, handleValidationError, transformFormData, validateRequiredFields, populateFamilyRelations, validateUpdateFields } from "../utils/common.js";
import { sendWelcomeEmail } from "../utils/emailService.js";

// Helper function to process uploaded PDF files
const processUploadedPDFs = async (req, existingDocs = []) => {
  const uploadedDocs = [...existingDocs];
  
  if (req.files && req.files.lifeHistoryDocuments && req.files.lifeHistoryDocuments.length > 0) {
    // Check total limit
    if (existingDocs.length + req.files.lifeHistoryDocuments.length > 3) {
      throw new Error(`Cannot upload ${req.files.lifeHistoryDocuments.length} files. Maximum 3 documents allowed.`);
    }
    
    // Upload each PDF to Cloudinary
    for (const file of req.files.lifeHistoryDocuments) {
      const uploadResult = await uploadPDFToCloudinary(file.buffer, file.originalname);
      uploadedDocs.push({
        name: uploadResult.name,
        url: uploadResult.url,
        publicId: uploadResult.public_id,
        uploadedAt: new Date()
      });
    }
  }
  
  return uploadedDocs;
};

// Create a new profile for the authenticated user
export const createProfile = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if profile already exists
    const existingProfile = await Profile.findOne({ user: userId });
    if (existingProfile) {
      return res.status(400).json({
        message: "Profile already exists. Use update endpoint instead."
      });
    }

    // Handle profile picture upload if present
    let profilePictureUrl = null;
    if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
      try {
        const uploadResult = await uploadImageToCloudinary(req.files.profilePicture[0].buffer);
        profilePictureUrl = uploadResult.url;
      } catch (uploadError) {
        return res.status(500).json({
          message: "Failed to upload profile picture",
          error: uploadError.message
        });
      }
    }

    // Transform form-data to proper types
    const profileData = transformFormData(req.body);
    profileData.user = userId;

    // If file was uploaded, use the Cloudinary URL; otherwise use the provided URL
    if (profilePictureUrl) {
      profileData.profilePicture = profilePictureUrl;
    }

    // If no treeId is provided (meaning independent user not joined via invite/family),
    // they become the root of a new tree.
    if (!profileData.treeId) {
      profileData.treeId = userId; // Tree ID is the Root User ID
    }

    // Process PDF uploads
    try {
      profileData.lifeHistoryDocuments = await processUploadedPDFs(req, []);
    } catch (pdfError) {
      return res.status(400).json({
        message: "PDF upload failed",
        error: pdfError.message
      });
    }

    // Validate required fields
    const validationErrors = validateRequiredFields(profileData, !!(req.files && req.files.profilePicture));
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Create profile
    profileData.isCompleted = true;
    const profile = await Profile.create(profileData);

    // Send welcome email if email is provided
    if (req.body.email) {
      sendWelcomeEmail(req.body.email, profileData.firstname || 'User').catch(err => {
        console.error('Failed to send welcome email:', err);
      });
    }

    return res.status(201).json({
      message: "Profile created successfully",
      data: profile
    });
  } catch (err) {
    const validationError = handleValidationError(err, res);
    if (validationError) return validationError;
    next(err);
  }
};

// Get the authenticated user's profile
export const getProfile = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let query = Profile.findOne({ user: userId });
    // Populate user field with firstname, lastname, and phone
    query = query.populate('user', 'firstname lastname phone country_code');
    query = populateFamilyRelations(query);

    const profile = await query;

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Convert profile to object and add user details
    const profileData = profile.toObject();

    // If user is populated, add it to the response
    if (profileData.user) {
      profileData.user = {
        user_id: profileData.user._id,
        firstname: profileData.user.firstname,
        lastname: profileData.user.lastname,
        country_code: profileData.user.country_code,
        phone: profileData.user.phone
      };
    }

    return res.status(200).json({
      message: "Profile retrieved successfully",
      data: profileData
    });
  } catch (err) {
    next(err);
  }
};

// Update the authenticated user's profile
export const updateProfile = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if profile exists
    const existingProfile = await Profile.findOne({ user: userId });
    if (!existingProfile) {
      return res.status(404).json({
        message: "Profile not found. Please create a profile first."
      });
    }

    // Handle profile picture upload if present
    let profilePictureUrl = null;
    let oldProfilePictureUrl = existingProfile.profilePicture;

    if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
      try {
        const uploadResult = await uploadImageToCloudinary(req.files.profilePicture[0].buffer);
        profilePictureUrl = uploadResult.url;
      } catch (uploadError) {
        return res.status(500).json({
          message: "Failed to upload profile picture",
          error: uploadError.message
        });
      }
    }

    // Transform form-data to proper types
    const updates = transformFormData(req.body);
    delete updates.user; // Prevent user field override

    // Extract firstname and lastname for User model update
    const userUpdates = {};
    if (updates.firstname !== undefined && updates.firstname !== null && updates.firstname !== '') {
      userUpdates.firstname = updates.firstname.trim();
      delete updates.firstname; // Remove from profile updates
    }
    if (updates.lastname !== undefined && updates.lastname !== null && updates.lastname !== '') {
      userUpdates.lastname = updates.lastname.trim();
      delete updates.lastname; // Remove from profile updates
    }
    if (updates.phone !== undefined && updates.phone !== null && updates.phone !== '') {
      userUpdates.phone = updates.phone.trim();
      delete updates.phone; // Remove from profile updates, stored in User
    }

    // If file was uploaded, use the Cloudinary URL
    if (profilePictureUrl) {
      updates.profilePicture = profilePictureUrl;
    }

    // Process PDF uploads - merge with existing docs
    try {
      updates.lifeHistoryDocuments = await processUploadedPDFs(req, existingProfile.lifeHistoryDocuments || []);
    } catch (pdfError) {
      return res.status(400).json({
        message: "PDF upload failed",
        error: pdfError.message
      });
    }

    // Validate fields being updated
    const validationErrors = validateUpdateFields(updates, !!(req.files && req.files.profilePicture));
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Update User model if firstname or lastname are provided
    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(
        userId,
        { $set: userUpdates },
        { new: true, runValidators: true }
      );
    }

    // Update profile
    updates.isCompleted = true;
    let query = Profile.findOneAndUpdate(
      { user: userId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    // Populate user field with firstname, lastname, and phone
    query = query.populate('user', 'firstname lastname phone country_code');
    query = populateFamilyRelations(query);

    const profile = await query;

    // Delete old image from Cloudinary if a new one was uploaded
    if (profilePictureUrl && oldProfilePictureUrl) {
      const oldPublicId = extractPublicIdFromUrl(oldProfilePictureUrl);
      if (oldPublicId) {
        // Delete asynchronously - don't wait for it
        deleteImageFromCloudinary(oldPublicId).catch(err => {
          console.error('Failed to delete old profile picture:', err);
        });
      }
    }

    // Convert profile to object and format user details
    const profileData = profile.toObject();

    // If user is populated, format it consistently with getProfile
    if (profileData.user) {
      profileData.user = {
        user_id: profileData.user._id,
        firstname: profileData.user.firstname,
        lastname: profileData.user.lastname,
        country_code: profileData.user.country_code,
        phone: profileData.user.phone
      };
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      data: profileData
    });
  } catch (err) {
    const validationError = handleValidationError(err, res);
    if (validationError) return validationError;
    next(err);
  }
};

// Update a specific user's profile by ID (Admin/Self)
export const updateUserProfileById = async (req, res, next) => {
  try {
    const requesterId = getUserId(req);
    const targetUserId = req.params.id;

    if (!requesterId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Verify User Exists
    const currentUser = await User.findById(requesterId);
    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check Authorization: Must be Admin OR updating self
    const isAdmin = currentUser.isAdmin || currentUser.isSuperAdmin;
    const isSelf = requesterId.toString() === targetUserId.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: "Access denied. Admin privileges required." });
    }

    const userId = targetUserId; // Use the param ID for updates

    // Check if profile exists
    const existingProfile = await Profile.findOne({ user: userId });
    if (!existingProfile) {
      return res.status(404).json({
        message: "Profile not found for this user."
      });
    }

    // Handle profile picture upload if present
    let profilePictureUrl = null;
    let oldProfilePictureUrl = existingProfile.profilePicture;

    if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
      try {
        const uploadResult = await uploadImageToCloudinary(req.files.profilePicture[0].buffer);
        profilePictureUrl = uploadResult.url;
      } catch (uploadError) {
        return res.status(500).json({
          message: "Failed to upload profile picture",
          error: uploadError.message
        });
      }
    }

    // Transform form-data to proper types
    const updates = transformFormData(req.body);
    delete updates.user; // Prevent user field override

    // Extract firstname and lastname for User model update
    const userUpdates = {};
    if (updates.firstname !== undefined && updates.firstname !== null && updates.firstname !== '') {
      userUpdates.firstname = updates.firstname.trim();
      delete updates.firstname; // Remove from profile updates
    }
    if (updates.lastname !== undefined && updates.lastname !== null && updates.lastname !== '') {
      userUpdates.lastname = updates.lastname.trim();
      delete updates.lastname; // Remove from profile updates
    }
    if (updates.phone !== undefined && updates.phone !== null && updates.phone !== '') {
      userUpdates.phone = updates.phone.trim();
      delete updates.phone; // Remove from profile updates, stored in User
    }

    // If file was uploaded, use the Cloudinary URL
    if (profilePictureUrl) {
      updates.profilePicture = profilePictureUrl;
    }

    // Process PDF uploads - merge with existing docs
    try {
      updates.lifeHistoryDocuments = await processUploadedPDFs(req, existingProfile.lifeHistoryDocuments || []);
    } catch (pdfError) {
      return res.status(400).json({
        message: "PDF upload failed",
        error: pdfError.message
      });
    }

    // Validate fields being updated
    const validationErrors = validateUpdateFields(updates, !!(req.files && req.files.profilePicture));
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Update User model if firstname or lastname are provided
    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(
        userId,
        { $set: userUpdates },
        { new: true, runValidators: true }
      );
    }

    // Update profile
    updates.isCompleted = true;
    let query = Profile.findOneAndUpdate(
      { user: userId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    // Populate user field with firstname, lastname, and phone
    query = query.populate('user', 'firstname lastname phone country_code');
    query = populateFamilyRelations(query);

    const profile = await query;

    // Delete old image from Cloudinary if a new one was uploaded
    if (profilePictureUrl && oldProfilePictureUrl) {
      const oldPublicId = extractPublicIdFromUrl(oldProfilePictureUrl);
      if (oldPublicId) {
        // Delete asynchronously
        deleteImageFromCloudinary(oldPublicId).catch(err => {
          console.error('Failed to delete old profile picture:', err);
        });
      }
    }

    // Convert profile to object and format user details
    const profileData = profile.toObject();

    if (profileData.user) {
      profileData.user = {
        user_id: profileData.user._id,
        firstname: profileData.user.firstname,
        lastname: profileData.user.lastname,
        country_code: profileData.user.country_code,
        phone: profileData.user.phone
      };
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      data: profileData
    });
  } catch (err) {
    const validationError = handleValidationError(err, res);
    if (validationError) return validationError;
    next(err);
  }
};

// get user profile and post by id
export const getUserProfileById = async (req, res, next) => {
  try {
    const profileUserId = req.params.id;
    const loggedInUserId = getUserId(req);

    if (!profileUserId) {
      return res.status(400).json({ message: "User ID required" });
    }

    // --------------------------
    // ✔ Fetch user info
    // --------------------------
    const user = await User.findById(profileUserId)
      .select("firstname lastname email phone country_code createdAt");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // --------------------------
    // ✔ Fetch profile
    // --------------------------
    let profileQuery = Profile.findOne({ user: profileUserId });
    profileQuery = profileQuery.populate("user", "firstname lastname phone country_code");
    profileQuery = populateFamilyRelations(profileQuery);

    const profile = await profileQuery;

    // --------------------------
    // ✔ Pagination input
    // --------------------------
    const limit = Math.min(20, parseInt(req.query.limit || "10"));
    const cursor = req.query.cursor || null;

    // --------------------------
    // ✔ Match condition (cursor based)
    // --------------------------
    const matchStage = cursor
      ? {
        user: new mongoose.Types.ObjectId(profileUserId),
        _id: { $lt: new mongoose.Types.ObjectId(cursor) },
      }
      : { user: new mongoose.Types.ObjectId(profileUserId) };

    // --------------------------
    // ✔ Aggregation Pipeline (same style as feed)
    // --------------------------
    const pipeline = [
      { $match: matchStage },
      { $sort: { _id: -1 } },
      { $limit: limit },

      // join user details
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "authorData",
        },
      },
      { $unwind: "$authorData" },

      // JOIN AUTHOR PROFILE
      {
        $lookup: {
          from: "profiles",
          localField: "user",
          foreignField: "user",
          as: "authorProfile",
        },
      },
      {
        $unwind: {
          path: "$authorProfile",
          preserveNullAndEmptyArrays: true,
        },
      },

      // join comment authors
      {
        $lookup: {
          from: "users",
          localField: "comments.user",
          foreignField: "_id",
          as: "commentAuthors",
        },
      },

      // Add custom fields
      {
        $addFields: {
          likesCount: { $size: "$likes" },
          commentsCount: { $size: "$comments" },
          isPoll: false, // Mark as regular post

          likedByMe: {
            $in: [new mongoose.Types.ObjectId(loggedInUserId), "$likes"],
          },

          author: {
            _id: "$authorData._id",
            firstname: "$authorData.firstname",
            lastname: "$authorData.lastname",
            profilePicture: "$authorProfile.profilePicture",
          },

          profilePicture: profile?.profilePicture || null,
          timeAgo: { $toString: "$createdAt" },
        },
      },

      {
        $project: {
          authorData: 0,
          authorProfile: 0,
          commentAuthors: 0,
          __v: 0,
        },
      },
    ];

    const posts = await Post.aggregate(pipeline);

    // --------------------------
    // ✔ FETCH POLLS
    // --------------------------
    const pollsPipeline = [
      { $match: matchStage },
      { $sort: { _id: -1 } },
      { $limit: limit },

      // JOIN POLL AUTHOR
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "authorData",
        },
      },
      { $unwind: "$authorData" },

      // JOIN POLL AUTHOR PROFILE
      {
        $lookup: {
          from: "profiles",
          localField: "user",
          foreignField: "user",
          as: "authorProfile",
        },
      },
      {
        $unwind: {
          path: "$authorProfile",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Add fields
      {
        $addFields: {
          isPoll: true, // Mark as poll
          totalVotes: {
            $sum: {
              $map: {
                input: "$options",
                as: "opt",
                in: { $size: "$$opt.votes" }
              }
            }
          },
          isExpired: { $gt: [new Date(), "$expiresAt"] },
          hasVoted: { $in: [new mongoose.Types.ObjectId(loggedInUserId), "$voters"] },

          author: {
            _id: "$authorData._id",
            firstname: "$authorData.firstname",
            lastname: "$authorData.lastname",
            profilePicture: "$authorProfile.profilePicture",
          },
        },
      },

      // Remove unwanted fields
      {
        $project: {
          authorData: 0,
          authorProfile: 0,
        },
      },
    ];

    const polls = await Poll.aggregate(pollsPipeline);

    // --------------------------
    // ✔ MERGE AND SORT posts and polls
    // --------------------------
    const allItems = [...posts, ...polls].sort((a, b) => {
      return b._id.getTimestamp() - a._id.getTimestamp();
    }).slice(0, limit);

    // --------------------------
    // ✔ nextCursor for infinite scroll
    // --------------------------
    const nextCursor = allItems.length > 0 ? allItems[allItems.length - 1]._id : null;

    // --------------------------
    // ✔ Final response
    // --------------------------
    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      data: {
        user: {
          id: user._id,
          firstname: user.firstname,
          lastname: user.lastname,
          email: user.email,
          phone: user.phone,
          country_code: user.country_code,
          profilePicture: profile?.profilePicture || "",
          joinedAt: user.createdAt,
        },
        profile: profile || {},
        posts: allItems,
        nextCursor,
        limit
      },
    });


  } catch (err) {
    next(err);
  }
};


// Get upcoming birthdays and anniversaries for the authenticated user's family tree
export const getUpcomingBirthdaysAndAnniversaries = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userProfile = await Profile.findOne({ user: userId });

    // Check if user is part of a family tree
    if (!userProfile || !userProfile.treeId) {
      return res.status(200).json({
        success: true,
        birthdays: [],
        anniversaries: []
      });
    }

    // Fetch all profiles in the same tree
    const profiles = await Profile.find({ treeId: userProfile.treeId }).populate(
      "user",
      "firstname lastname"
    );

    const birthdays = [];
    const anniversaries = [];
    const deathAnniversaries = [];

    // Correct daysUntil function (IMPORTANT)
    const getDaysUntil = (month, day) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize time to midnight

      const currentYear = today.getFullYear();

      // event this year
      let nextEvent = new Date(currentYear, month, day);
      nextEvent.setHours(0, 0, 0, 0);

      // If event already passed strictly by date
      if (nextEvent.getTime() < today.getTime()) {
        nextEvent = new Date(currentYear + 1, month, day);
        nextEvent.setHours(0, 0, 0, 0);
      }

      const diff = nextEvent.getTime() - today.getTime();
      return Math.round(diff / (1000 * 60 * 60 * 24)); // exact day diff
    };

    profiles.forEach((profile) => {
      // Safety check: ensure user exists
      if (!profile.user) return;

      // ----------- BIRTHDAY -----------
      if (profile?.dob && !profile.dateOfDeath) { // Only show birthday if alive
        const dobDate = new Date(profile.dob);

        const month = dobDate.getMonth(); // correct (0–11)
        const day = dobDate.getDate();

        const daysUntil = getDaysUntil(month, day);

        if (daysUntil >= -1 && daysUntil <= 30) { // Changed to 30 days
          birthdays.push({
            userId: profile.user._id,
            name: `${profile.user.firstname} ${profile.user.lastname}`,
            profilePicture: profile.profilePicture || "",
            dob: profile.dob,
            daysUntil
          });
        }
      }

      // ----------- ANNIVERSARY -----------
      if (profile.marriageDate && !profile.dateOfDeath) { // Only show anniversary if alive
        const mDate = new Date(profile.marriageDate);

        const month = mDate.getMonth();
        const day = mDate.getDate();

        const daysUntil = getDaysUntil(month, day);

        if (daysUntil >= -1 && daysUntil <= 30) { // Changed to 30 days
          anniversaries.push({
            userId: profile.user._id,
            name: `${profile.user.firstname} ${profile.user.lastname}`,
            profilePicture: profile.profilePicture || "",
            marriageDate: profile.marriageDate,
            daysUntil
          });
        }
      }

      // ----------- DEATH ANNIVERSARY -----------
      if (profile.dateOfDeath) {
        const dDate = new Date(profile.dateOfDeath);

        const month = dDate.getMonth();
        const day = dDate.getDate();

        const daysUntil = getDaysUntil(month, day);

        if (daysUntil >= -1 && daysUntil <= 30) { // Show within 30 days
          deathAnniversaries.push({
            userId: profile.user._id,
            name: `${profile.user.firstname} ${profile.user.lastname}`,
            profilePicture: profile.profilePicture || "",
            dateOfDeath: profile.dateOfDeath,
            daysUntil
          });
        }
      }
    });

    birthdays.sort((a, b) => a.daysUntil - b.daysUntil);
    anniversaries.sort((a, b) => a.daysUntil - b.daysUntil);
    deathAnniversaries.sort((a, b) => a.daysUntil - b.daysUntil);

    return res.status(200).json({
      success: true,
      birthdays,
      anniversaries,
      deathAnniversaries
    });
  } catch (err) {
    next(err);
  }
};

// Upload life history document (max 3 files)
export const uploadLifeHistoryDocument = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let profile = await Profile.findOne({ user: userId });
    
    // If profile doesn't exist, create a minimal stub profile
    if (!profile) {
      // Get user info for the profile
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Create minimal profile with just required fields
      profile = await Profile.create({
        user: userId,
        treeId: userId, // Default treeId to user's own ID
        firstname: user.firstname || "",
        lastname: user.lastname || "",
        gender: "other", // Default value
        isCompleted: false, // Mark as incomplete since this is just for document upload
        lifeHistoryDocuments: []
      });
      
      console.log(`Created minimal profile for user ${userId} during document upload`);
    }

    // Check if max limit (3) reached
    const currentDocs = profile.lifeHistoryDocuments || [];
    if (currentDocs.length >= 3) {
      return res.status(400).json({
        message: "Maximum limit reached",
        error: "You can only upload up to 3 life history documents"
      });
    }

    // Upload PDF to Cloudinary
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const uploadResult = await uploadPDFToCloudinary(
      req.file.buffer,
      req.file.originalname
    );

    // Add document to profile
    const newDocument = {
      name: uploadResult.name,
      url: uploadResult.url,
      publicId: uploadResult.public_id,
      uploadedAt: new Date()
    };

    profile.lifeHistoryDocuments.push(newDocument);
    await profile.save();

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      data: newDocument
    });
  } catch (err) {
    console.error("Error uploading document:", err);
    next(err);
  }
};

// Remove life history document
export const removeLifeHistoryDocument = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { documentId } = req.params;
    if (!documentId) {
      return res.status(400).json({ message: "Document ID required" });
    }

    const profile = await Profile.findOne({ user: userId });
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Find document by its _id (stored as string in array)
    const docIndex = profile.lifeHistoryDocuments.findIndex(
      doc => doc._id.toString() === documentId
    );

    if (docIndex === -1) {
      return res.status(404).json({ message: "Document not found" });
    }

    const document = profile.lifeHistoryDocuments[docIndex];

    // Delete from Cloudinary
    if (document.publicId) {
      await deleteRawFileFromCloudinary(document.publicId);
    }

    // Remove from array
    profile.lifeHistoryDocuments.splice(docIndex, 1);
    await profile.save();

    return res.status(200).json({
      success: true,
      message: "Document removed successfully"
    });
  } catch (err) {
    console.error("Error removing document:", err);
    next(err);
  }
};


