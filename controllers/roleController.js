import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import { validatePhone, validateRequiredFields } from "../utils/validation.js";
import { sendWhatsAppTemporaryPassword } from "../utils/aisensy.js";

const getUserId = (req) => req.user?.id || req.user?._id;

const getTreeMemberIdsForRequest = async (req) => {
  const userId = getUserId(req);
  if (!userId) return [];
  try {
    const currentProfile = await Profile.findOne({ user: userId }).select("treeId user");
    if (!currentProfile) return [userId.toString()];

    const treeId = (currentProfile.treeId || currentProfile.user)?.toString();
    if (!treeId) return [userId.toString()];

    const profiles = await Profile.find({ treeId }).select("user");
    const idSet = new Set(profiles.map(p => p.user.toString()));
    idSet.add(userId.toString());
    return Array.from(idSet);
  } catch (err) {
    console.error("Get Tree Member IDs Error:", err);
    return userId ? [userId.toString()] : [];
  }
};

const generateRandomPassword = (length = 10) => {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%&*";
  const randomBytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    const index = randomBytes[i] % charset.length;
    password += charset[index];
  }
  return password;
};

const mapUsersWithProfiles = async (users) => {
  const userIds = users.map(u => u._id);
  const profiles = await Profile.find({ user: { $in: userIds } }).select("user profilePicture");
  const profileMap = new Map(profiles.map(p => [p.user.toString(), p.profilePicture || null]));

  return users.map(u => ({
    id: u._id,
    firstname: u.firstname,
    lastname: u.lastname,
    name: `${u.firstname} ${u.lastname}`.trim(),
    phone: u.phone || null,
    country_code: u.country_code || null,
    profilePicture: profileMap.get(u._id.toString()) || null,
    status: u.status,
    createdAt: u.createdAt,
    ...(typeof u.isAdmin === "boolean" ? { isAdmin: u.isAdmin } : {}),
    ...(typeof u.isSuperAdmin === "boolean" ? { isSuperAdmin: u.isSuperAdmin } : {}),
    ...(typeof u.isSubAdmin === "boolean" ? { isSubAdmin: u.isSubAdmin } : {}),
    ...(typeof u.isCoordinator === "boolean" ? { isCoordinator: u.isCoordinator } : {})
  }));
};

const hasSubAdminInTree = async (treeMemberIds, excludeUserId = null) => {
  if (!treeMemberIds || treeMemberIds.length === 0) return false;
  const query = {
    isSubAdmin: true,
    is_deleted: false,
    _id: { $in: treeMemberIds }
  };
  if (excludeUserId) query._id = { $in: treeMemberIds, $ne: excludeUserId };
  const existing = await User.findOne(query).select("_id");
  return !!existing;
};

const hasCoordinatorInTree = async (treeMemberIds, excludeUserId = null) => {
  if (!treeMemberIds || treeMemberIds.length === 0) return false;
  const query = {
    isCoordinator: true,
    is_deleted: false,
    _id: { $in: treeMemberIds }
  };
  if (excludeUserId) query._id = { $in: treeMemberIds, $ne: excludeUserId };
  const existing = await User.findOne(query).select("_id");
  return !!existing;
};

export const getAdministrators = async (req, res) => {
  try {
    const treeMemberIds = await getTreeMemberIdsForRequest(req);
    if (!treeMemberIds || treeMemberIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { admin: null, subAdmins: [], coordinators: [] }
      });
    }

    const idFilter = { _id: { $in: treeMemberIds } };

    const [adminUser, subAdmins, coordinators] = await Promise.all([
      User.findOne({ isAdmin: true, is_deleted: false, ...idFilter })
        .sort({ createdAt: 1 })
        .select("firstname lastname phone country_code createdAt status"),
      User.find({ isSubAdmin: true, is_deleted: false, ...idFilter })
        .select("firstname lastname phone country_code createdAt status")
        .sort({ createdAt: -1 }),
      User.find({ isCoordinator: true, is_deleted: false, ...idFilter })
        .select("firstname lastname phone country_code createdAt status")
        .sort({ createdAt: -1 })
    ]);

    const admin = adminUser ? (await mapUsersWithProfiles([adminUser]))[0] : null;
    const subAdminsData = await mapUsersWithProfiles(subAdmins);
    const coordinatorsData = await mapUsersWithProfiles(coordinators);

    return res.status(200).json({
      success: true,
      data: {
        admin,
        subAdmins: subAdminsData,
        coordinators: coordinatorsData
      }
    });
  } catch (error) {
    console.error("Get Administrators Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const listUsersForRoleAssignment = async (req, res) => {
  try {
    // Show family-tree users so Admin can assign roles within their family zone.
    const treeMemberIds = await getTreeMemberIdsForRequest(req);

    const query = {
      is_deleted: false,
      status: "active",
      _id: { $in: treeMemberIds || [] }
    };

    const users = await User.find(query)
      .select("firstname lastname phone country_code createdAt status isAdmin isSuperAdmin isSubAdmin isCoordinator")
      .sort({ createdAt: -1 });

    const data = await mapUsersWithProfiles(users);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("List Users For Role Assignment Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const setUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, enabled } = req.body;

    if (!role || !["subadmin", "coordinator"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role. Use 'subadmin' or 'coordinator'." });
    }

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, message: "Invalid enabled flag. Use true/false." });
    }

    const user = await User.findById(id);
    if (!user || user.is_deleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isAdmin) {
      return res.status(400).json({ success: false, message: "Main Admin role cannot be modified." });
    }

    const updates = {};
    if (role === "subadmin") {
      if (enabled && user.isCoordinator) {
        return res.status(400).json({
          success: false,
          message: "This user is a Coordinator. Remove Coordinator role first, then assign SubAdmin."
        });
      }
      if (enabled) {
        const treeMemberIds = await getTreeMemberIdsForRequest(req);
        const alreadyHasSubAdmin = await hasSubAdminInTree(treeMemberIds, id);
        if (alreadyHasSubAdmin) {
          return res.status(400).json({
            success: false,
            message: "Only one SubAdmin is allowed in a family. Remove the existing SubAdmin first."
          });
        }
      }
      updates.isSubAdmin = enabled;
    } else {
      if (enabled && user.isSubAdmin) {
        return res.status(400).json({
          success: false,
          message: "This user is a SubAdmin. Remove SubAdmin role first, then assign Coordinator."
        });
      }
      if (enabled) {
        const treeMemberIds = await getTreeMemberIdsForRequest(req);
        const alreadyHasCoordinator = await hasCoordinatorInTree(treeMemberIds, id);
        if (alreadyHasCoordinator) {
          return res.status(400).json({
            success: false,
            message: "Only one Coordinator is allowed in a family. Remove the existing Coordinator first."
          });
        }
      }
      updates.isCoordinator = enabled;
    }

    await User.findByIdAndUpdate(id, updates, { new: true });

    return res.status(200).json({
      success: true,
      message: enabled ? "Role assigned successfully" : "Role removed successfully"
    });
  } catch (error) {
    console.error("Set User Role Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createRoleUser = async ({ roleKey, req, res }) => {
  try {
    const { firstname, lastname, country_code, phone } = req.body;

    if (roleKey === "isSubAdmin") {
      const treeMemberIds = await getTreeMemberIdsForRequest(req);
      const alreadyHasSubAdmin = await hasSubAdminInTree(treeMemberIds, null);
      if (alreadyHasSubAdmin) {
        return res.status(400).json({
          success: false,
          message: "Only one SubAdmin is allowed in a family. Remove the existing SubAdmin first."
        });
      }
    }

    if (roleKey === "isCoordinator") {
      const treeMemberIds = await getTreeMemberIdsForRequest(req);
      const alreadyHasCoordinator = await hasCoordinatorInTree(treeMemberIds, null);
      if (alreadyHasCoordinator) {
        return res.status(400).json({
          success: false,
          message: "Only one Coordinator is allowed in a family. Remove the existing Coordinator first."
        });
      }
    }

    const requiredValidation = validateRequiredFields({ firstname, lastname, phone });
    if (!requiredValidation.valid) {
      return res.status(400).json({ success: false, message: requiredValidation.message });
    }

    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      return res.status(400).json({ success: false, message: phoneValidation.message });
    }

    const existingUser = await User.findOne({ phone: phoneValidation.phone, is_deleted: false });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User with this phone number already exists" });
    }

    const tempPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const countryCode = country_code || "+91";

    const roleFlags = {
      isAdmin: false,
      isSubAdmin: false,
      isCoordinator: false
    };
    roleFlags[roleKey] = true;

    const user = await User.create({
      firstname: firstname.trim(),
      lastname: lastname.trim(),
      country_code: countryCode,
      phone: phoneValidation.phone,
      password: hashedPassword,
      is_verified: false,
      isFirstLogin: true,
      status: "active",
      ...roleFlags
    });

    // Fire-and-forget WhatsApp notification; account creation should succeed even if WhatsApp fails.
    sendWhatsAppTemporaryPassword(
      { phone: phoneValidation.phone, name: `${firstname} ${lastname}`.trim() },
      tempPassword
    ).catch((err) => {
      console.error("Temp password WhatsApp send failed:", err.response?.data || err.message);
    });

    return res.status(201).json({
      success: true,
      message: "Role user created successfully",
      data: { id: user._id }
    });
  } catch (error) {
    console.error("Create Role User Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const createSubAdmin = async (req, res) => createRoleUser({ roleKey: "isSubAdmin", req, res });
export const createCoordinator = async (req, res) => createRoleUser({ roleKey: "isCoordinator", req, res });

export const listSubAdmins = async (req, res) => {
  try {
    const treeMemberIds = await getTreeMemberIdsForRequest(req);
    const users = await User.find({
      isSubAdmin: true,
      is_deleted: false,
      _id: { $in: treeMemberIds || [] }
    })
      .select("firstname lastname phone country_code createdAt status")
      .sort({ createdAt: -1 });

    const data = await mapUsersWithProfiles(users);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("List SubAdmins Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const listCoordinators = async (req, res) => {
  try {
    const treeMemberIds = await getTreeMemberIdsForRequest(req);
    const users = await User.find({
      isCoordinator: true,
      is_deleted: false,
      _id: { $in: treeMemberIds || [] }
    })
      .select("firstname lastname phone country_code createdAt status")
      .sort({ createdAt: -1 });

    const data = await mapUsersWithProfiles(users);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("List Coordinators Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deactivateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    req.body = { role, enabled: false };
    return setUserRole(req, res);
  } catch (error) {
    console.error("Deactivate Role Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
