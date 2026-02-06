import Profile from "../models/Profile.js";

/**
 * Middleware to check if a user can access a specific family tree node
 * Each user can only access their own family tree and related members
 */
export const canAccessFamilyTree = async (req, res, next) => {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const { userId } = req.params; // The user whose tree is being accessed

    if (!currentUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // If accessing their own tree, allow
    if (userId && userId === currentUserId.toString()) {
      return next();
    }

    // If no specific userId is requested (getting own tree), allow
    if (!userId) {
      return next();
    }

    // Check if the requested user is in the current user's family tree
    const currentUserProfile = await Profile.findOne({ user: currentUserId });
    if (!currentUserProfile) {
      return res.status(404).json({
        message: "Profile not found. Please create your profile first."
      });
    }

    // Collect all family member IDs
    const familyMemberIds = new Set();
    const addFamilyMembers = (profile) => {
      if (profile.father) familyMemberIds.add(profile.father.toString());
      if (profile.mother) familyMemberIds.add(profile.mother.toString());
      (profile.brothers || []).forEach(id => familyMemberIds.add(id.toString()));
      (profile.sisters || []).forEach(id => familyMemberIds.add(id.toString()));
      (profile.partners || []).forEach(id => familyMemberIds.add(id.toString()));
      (profile.sons || []).forEach(id => familyMemberIds.add(id.toString()));
      (profile.daughters || []).forEach(id => familyMemberIds.add(id.toString()));
    };

    // Recursively build the family tree to check access
    const visited = new Set();
    const buildFamilyNetwork = async (profileId) => {
      if (visited.has(profileId.toString())) return;
      visited.add(profileId.toString());

      const profile = await Profile.findOne({ user: profileId });
      if (!profile) return;

      addFamilyMembers(profile);

      // Recursively check all relationships
      const relatedIds = [
        profile.father,
        profile.mother,
        ...(profile.brothers || []),
        ...(profile.sisters || []),
        ...(profile.partners || []),
        ...(profile.sons || []),
        ...(profile.daughters || [])
      ].filter(Boolean);

      for (const relatedId of relatedIds) {
        await buildFamilyNetwork(relatedId);
      }
    };

    await buildFamilyNetwork(currentUserId);

    // Check if the requested user is in the family network
    if (!familyMemberIds.has(userId)) {
      return res.status(403).json({
        message: "Access denied. You can only access your own family tree."
      });
    }

    next();
  } catch (err) {
    console.error("Family Tree Auth Error:", err);
    return res.status(500).json({
      message: "Error checking family tree access"
    });
  }
};

/**
 * Middleware to check if user can add a member to a specific target user
 */
export const canAddMember = async (req, res, next) => {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const { targetUserId } = req.body;

    if (!currentUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // If adding to their own profile, allow
    if (!targetUserId || targetUserId === currentUserId.toString()) {
      return next();
    }

    // Check if target user is in current user's family tree
    const currentUserProfile = await Profile.findOne({ user: currentUserId });
    if (!currentUserProfile) {
      return res.status(404).json({
        message: "Profile not found. Please create your profile first."
      });
    }

    // Build family network
    const familyMemberIds = new Set();
    familyMemberIds.add(currentUserId.toString());

    const visited = new Set();
    const buildFamilyNetwork = async (profileId) => {
      if (visited.has(profileId.toString())) return;
      visited.add(profileId.toString());

      const profile = await Profile.findOne({ user: profileId });
      if (!profile) return;

      familyMemberIds.add(profile.user.toString());

      const relatedIds = [
        profile.father,
        profile.mother,
        ...(profile.brothers || []),
        ...(profile.sisters || []),
        ...(profile.partners || []),
        ...(profile.sons || []),
        ...(profile.daughters || [])
      ].filter(Boolean);

      for (const relatedId of relatedIds) {
        familyMemberIds.add(relatedId.toString());
        await buildFamilyNetwork(relatedId);
      }
    };

    await buildFamilyNetwork(currentUserId);

    // Check if target user is in the family network
    if (!familyMemberIds.has(targetUserId)) {
      return res.status(403).json({
        message: "Access denied. You can only add members to your own family tree."
      });
    }

    next();
  } catch (err) {
    console.error("Add Member Auth Error:", err);
    return res.status(500).json({
      message: "Error checking add member permission"
    });
  }
};

/**
 * Get all family tree member IDs for a user (used for data isolation)
 */
export const getFamilyTreeMemberIds = async (userId) => {
  const familyMemberIds = new Set();
  familyMemberIds.add(userId.toString());

  const visited = new Set();
  const buildFamilyNetwork = async (profileId) => {
    if (visited.has(profileId.toString())) return;
    visited.add(profileId.toString());

    const profile = await Profile.findOne({ user: profileId });
    if (!profile) return;

    familyMemberIds.add(profile.user.toString());

    const relatedIds = [
      profile.father,
      profile.mother,
      ...(profile.brothers || []),
      ...(profile.sisters || []),
      ...(profile.partner || []),
      ...(profile.sons || []),
      ...(profile.daughters || [])
    ].filter(Boolean);

    for (const relatedId of relatedIds) {
      familyMemberIds.add(relatedId.toString());
      await buildFamilyNetwork(relatedId);
    }
  };

  await buildFamilyNetwork(userId);

  return Array.from(familyMemberIds);
};

