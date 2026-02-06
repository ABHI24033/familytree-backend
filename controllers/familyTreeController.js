import User from "../models/User.js";
import Profile from "../models/Profile.js";
import { uploadImageToCloudinary } from "../utils/cloudinaryUpload.js";
import { validatePhone, validateEmail } from "../utils/validation.js";
import { sendFamilyMemberWelcomeEmail } from "../utils/emailService.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Notification from "../models/Notification.js";

// Get user ID from request
const getUserId = (req) => {
  return req.user?.id || req.user?._id;
};

// Generate a secure random password for newly added members
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

// Helper: Traverse graph to find all connected profiles
const getAllConnectedProfiles = async (startUserId) => {
  const visited = new Set();
  const queue = [startUserId.toString()];
  const profilesMap = new Map(); // Use Map to deduplicate by user ID

  // Safety break to prevent infinite loops if something goes wrong
  let iterations = 0;
  const MAX_ITERATIONS = 10000;

  while (queue.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const currentId = queue.shift();

    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const profile = await Profile.findOne({ user: currentId })
      .populate('user', 'firstname lastname phone email country_code isAdmin isSuperAdmin');

    if (!profile) continue;

    profilesMap.set(currentId, profile);

    // Add all connections to queue
    if (profile.father) queue.push(profile.father.toString());
    if (profile.mother) queue.push(profile.mother.toString());

    if (profile.partner) queue.push(profile.partner.toString());

    if (profile.sons && profile.sons.length > 0) {
      profile.sons.forEach(s => queue.push(s.toString()));
    }
    if (profile.daughters && profile.daughters.length > 0) {
      profile.daughters.forEach(d => queue.push(d.toString()));
    }
    if (profile.brothers && profile.brothers.length > 0) {
      profile.brothers.forEach(b => queue.push(b.toString()));
    }
    if (profile.sisters && profile.sisters.length > 0) {
      profile.sisters.forEach(s => queue.push(s.toString()));
    }
  }

  return Array.from(profilesMap.values());
};

// Helper: Self-heal missing partner links based on shared children
const repairRelationships = async (profiles) => {
  let repairsMade = false;
  const profileMap = new Map(profiles.map(p => [p.user._id.toString(), p]));

  for (const profile of profiles) {
    const childrenIds = [...(profile.sons || []), ...(profile.daughters || [])];
    if (childrenIds.length === 0) continue;

    // We only need to check one direction (e.g., if I am Father, check Mother) to avoid double work
    // But for robustness, checking both is fine.

    // Find implied partner from children
    // If I am Male (Father), look for Mother in children
    // If I am Female (Mother), look for Father in children
    let impliedPartnerId = null;

    for (const childId of childrenIds) {
      // We need the child profile to check its parents
      // The child might be in our profiles list
      // Note: 'profiles' from getAllConnectedProfiles contains populated user, but children refs in 'sons'/'daughters' are just ObjectIds usually?
      // Wait, 'sons' and 'daughters' in Schema are refs to User. 
      // getAllConnectedProfiles does NOT populate sons/daughters. So they are IDs.

      // We need to find the child's profile to see their parents.
      // Since getAllConnectedProfiles grabs everyone connected, the child SHOULD be in the map.
      // But 'sons' contains UserIds. The map is keyed by UserId.
      const childProfile = profileMap.get(childId.toString());

      if (childProfile) {
        if (profile.gender === 'male' && childProfile.mother) {
          impliedPartnerId = childProfile.mother.toString();
        } else if (profile.gender === 'female' && childProfile.father) {
          impliedPartnerId = childProfile.father.toString();
        }
      }

      if (impliedPartnerId) break; // Found a candidate
    }

    try {
      if (impliedPartnerId) {
        const currentPartnerId = profile.partner?.toString();

        // If we found an implied partner, but we don't have them set as our partner
        // OR if we have a partner set but it's different? (That would be a conflict, maybe skip)
        // We process if partner is missing.
        if (!currentPartnerId) {
          const impliedPartnerProfile = profileMap.get(impliedPartnerId);

          // Ensure the other person also doesn't have a partner (or has us)
          if (impliedPartnerProfile) {
            const otherPartnerId = impliedPartnerProfile.partner?.toString();

            if (!otherPartnerId || otherPartnerId === profile.user._id.toString()) {
              // FIX IT
              console.log(`Self-healing: Linking ${profile.user.firstname} and ${impliedPartnerProfile.user.firstname} as partners.`);

              profile.partner = impliedPartnerId;
              impliedPartnerProfile.partner = profile.user._id;

              await profile.save();
              await impliedPartnerProfile.save();
              repairsMade = true;
            }
          }
        }
      }
      // --- NEW: Sync Children with Partner ---
      // If I have a partner, ensure all my children also link to that partner (as father/mother)
      // and that the partner has them in their list.
      if (profile.partner) {
        const partnerProfile = profileMap.get(profile.partner.toString());
        if (partnerProfile) {
          // Iterate all my children
          // (Re-fetch childrenIds just in case, though profile is same)
          const myChildrenIds = [...(profile.sons || []), ...(profile.daughters || [])];

          for (const childId of myChildrenIds) {
            const childProfile = profileMap.get(childId.toString());
            if (childProfile) {
              let changedChild = false;
              let changedPartner = false;

              // Link Child -> Partner (as parent)
              if (profile.gender === 'male') {
                // I am father, partner is mother
                if (!childProfile.mother) {
                  console.log(`Self-healing: Bequeathing mother ${partnerProfile.user.firstname} to child ${childProfile.user.firstname}`);
                  childProfile.mother = partnerProfile.user._id;
                  changedChild = true;
                }
              } else {
                // I am mother, partner is father
                if (!childProfile.father) {
                  console.log(`Self-healing: Bequeathing father ${partnerProfile.user.firstname} to child ${childProfile.user.firstname}`);
                  childProfile.father = partnerProfile.user._id;
                  changedChild = true;
                }
              }

              // Link Partner -> Child (in list)
              if (childProfile.gender === 'male') {
                if (!partnerProfile.sons) partnerProfile.sons = [];
                if (!partnerProfile.sons.includes(childProfile.user._id)) {
                  partnerProfile.sons.push(childProfile.user._id);
                  changedPartner = true;
                }
              } else {
                if (!partnerProfile.daughters) partnerProfile.daughters = [];
                if (!partnerProfile.daughters.includes(childProfile.user._id)) {
                  partnerProfile.daughters.push(childProfile.user._id);
                  changedPartner = true;
                }
              }

              if (changedChild) {
                await childProfile.save();
                repairsMade = true;
              }
              if (changedPartner) {
                await partnerProfile.save();
                repairsMade = true;
              }
            }
          }
        }
      }
    } catch (healError) {
      console.error(`Self-healing failed for profile ${profile._id}:`, healError.message);
      // Continue to next profile, don't crash
    }
  }

  return repairsMade;
};

// Get complete family tree for current user (Normalized)
export const getFamilyTree = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // console.log("userId----->", userId);

    // Check if user has a profile
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile) {
      return res.status(404).json({
        message: "Profile not found. Please create your profile first."
      });
    }

    // console.log("userProfile----->", userProfile);

    // 1. Fetch all connected profiles
    let allProfiles = await getAllConnectedProfiles(userId);

    // 1.5 Self-heal relationships
    // This fixes stale data where parents share children but aren't linked as partners
    const healed = await repairRelationships(allProfiles);
    if (healed) {
      // If we fixed connections, re-fetch to get clean updated data
      allProfiles = await getAllConnectedProfiles(userId);
    }

    // Apply Search Filter if 'search' query is present
    const { search } = req.query;
    if (search) {
      const searchRegex = new RegExp(search, 'i'); // Case-insensitive
      allProfiles = allProfiles.filter(p =>
        searchRegex.test(p.user.firstname) ||
        searchRegex.test(p.user.lastname) ||
        searchRegex.test(`${p.user.firstname} ${p.user.lastname}`)
      );
    }

    // 2. Build People Array
    const people = allProfiles.map(p => {
      const user = p.user;
      return {
        id: user._id.toString(),
        treeId: p.treeId?.toString() || userProfile.treeId?.toString() || userId.toString(), // Fallback to root user ID as tree ID
        firstName: user.firstname,
        firstname: user.firstname, // Alias for frontend compatibility
        lastName: user.lastname,
        lastname: user.lastname, // Alias for frontend compatibility
        gender: p.gender,
        prefix: p.prefix, // Added field
        profilePicture: p.profilePicture,
        phone: user.phone,
        email: p.email,
        dob: p.dob,
        age: p.age,
        dateOfDeath: p.dateOfDeath, // Added field
        yearOfBirth: p.yearOfBirth || (p.dob ? new Date(p.dob).getFullYear() : null),
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin,
        relationships: {
          fatherId: p.father?.toString() || null,
          motherId: p.mother?.toString() || null,
          partnerId: p.partner?.toString() || null,
          childrenIds: [
            ...(p.sons?.map(id => id.toString()) || []),
            ...(p.daughters?.map(id => id.toString()) || [])
          ],
          siblingIds: [] // Will be calculated below
        }
      };
    });

    // 2.5. Calculate Sibling IDs for each person
    // Siblings are people who share the same father OR mother
    people.forEach(person => {
      const { fatherId, motherId } = person.relationships;
      const siblingIds = [];

      // Find all people who share the same father or mother (excluding self)
      people.forEach(otherPerson => {
        if (otherPerson.id === person.id) return; // Skip self

        const { fatherId: otherFatherId, motherId: otherMotherId } = otherPerson.relationships;

        // Check if they share the same father
        if (fatherId && otherFatherId && fatherId === otherFatherId) {
          if (!siblingIds.includes(otherPerson.id)) {
            siblingIds.push(otherPerson.id);
          }
        }

        // Check if they share the same mother
        if (motherId && otherMotherId && motherId === otherMotherId) {
          if (!siblingIds.includes(otherPerson.id)) {
            siblingIds.push(otherPerson.id);
          }
        }
      });

      person.relationships.siblingIds = siblingIds;
    });

    // 3. Build Families Array
    const familiesMap = new Map();

    // Helper to get family key
    const getFamilyKey = (p1, p2) => {
      if (!p1 && !p2) return null;
      if (!p1) return `single_${p2}`;
      if (!p2) return `single_${p1}`;
      const sorted = [p1, p2].sort();
      return `fam_${sorted[0]}_${sorted[1]}`;
    };

    // A. Group by children's parents
    people.forEach(person => {
      const { fatherId, motherId } = person.relationships;
      if (fatherId || motherId) {
        const key = getFamilyKey(fatherId, motherId);
        if (!familiesMap.has(key)) {
          familiesMap.set(key, {
            id: key, // Temporary ID
            treeId: person.treeId,
            partnerIds: [fatherId, motherId].filter(Boolean),
            childrenIds: []
          });
        }
        familiesMap.get(key).childrenIds.push(person.id);
      }
    });

    // B. Group by partners (even if no children)
    people.forEach(person => {
      if (person.relationships.partnerId) {
        const partnerId = person.relationships.partnerId;
        const key = getFamilyKey(person.id, partnerId);
        if (!familiesMap.has(key)) {
          familiesMap.set(key, {
            id: key,
            treeId: person.treeId,
            partnerIds: [person.id, partnerId].sort(), // Ensure consistent order
            childrenIds: []
          });
        }
      }
    });

    const families = Array.from(familiesMap.values()).map(f => ({
      ...f,
      // Generate a cleaner ID if needed, or keep the key
      id: f.id.startsWith('fam_') ? f.id : `fam-${f.partnerIds.join('-')}`
    }));

    // 4. Construct Tree Metadata
    const treeData = {
      id: userProfile.treeId?.toString() || userId.toString(),
      name: `${userProfile.user.firstname || 'Family'} Tree`,
      ownerUserId: userId.toString(),
      memberUserIds: people.map(p => p.id),
      rootPersonId: userId.toString(),
      guardianId: userProfile.guardian?.toString() || null,
      createdAt: new Date(), // Placeholder
      updatedAt: new Date()
    };

    return res.status(200).json({
      message: "Family tree retrieved successfully",
      data: {
        tree: treeData,
        people: people,
        families: families,
        meta: {
          generatedAt: new Date()
        }
      }
    });

  } catch (error) {
    console.error("Get Family Tree Error:", error);
    next(error);
  }
};

// Add a new family member
export const addFamilyMember = async (req, res, next) => {
  try {
    const {
      targetUserId,
      relationship,
      firstname,
      lastname,
      prefix,
      phone,
      email,
      dob,
      dateOfDeath,
      age,
      gender,
      profilePicture
    } = req.body;

    // RBAC Permissions Check
    // Allow if user is admin, superadmin, or adding to their own node
    const currentUserId = getUserId(req);
    if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });

    // Fetch full user object to ensure we have role info
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(401).json({ message: "User not found" });

    const isOwner = currentUserId.toString() === targetUserId;
    const isAdmin = currentUser.isAdmin || currentUser.isSuperAdmin || currentUser.role === 'admin';

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: "You do not have permission to add members to this user." });
    }

    // Fix: Fetch targetUser
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "Target user not found" });
    }

    let profilePictureUrl = profilePicture;
    if (req.file) {
      const uploadResult = await uploadImageToCloudinary(req.file.buffer);
      profilePictureUrl = uploadResult.url;
    }

    const isDeceased = prefix === 'Late';

    // Validate Phone and Email
    let validPhone = null;
    if (prefix === 'Late') {
      // For Late members, phone and email are optional
      // But if provided, they must be valid
      if (phone && phone.trim() !== "") {
        const phoneCheck = validatePhone(phone);
        if (!phoneCheck.valid) {
          return res.status(400).json({ message: "Invalid phone number format" });
        }
        validPhone = phoneCheck.phone;
      }

      if (email && email.trim() !== "" && !validateEmail(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Check dateOfDeath existence
      if (!dateOfDeath) {
        return res.status(400).json({ message: "Date of death is required for deceased members" });
      }
    } else {
      // For Living members, Phone is Required, Email is Required (as per existing logic)
      const phoneCheck = validatePhone(phone);
      if (!phoneCheck.valid) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }
      validPhone = phoneCheck.phone;

      if (!validateEmail(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
    }

    // Check if user already exists with this phone (if phone is provided)
    if (phone && phone.trim() !== "") {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ message: "User with this phone number already exists" });
      }
    }

    // Check if profile exists with this email (if email is provided)
    if (email && email.trim() !== "") {
      const existingProfile = await Profile.findOne({ email });
      if (existingProfile) {
        return res.status(400).json({ message: "User with this email already exists" });
      }
    }

    // 2. Create User
    // If Late and no phone, do not set phone field (it will be undefined/null, handled by sparse index)
    const temporaryPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    const userData = {
      firstname,
      lastname,
      password: hashedPassword, // Dummy or real password
      country_code: "+91",
      is_verified: false,
      status: 'active'
    };

    if (phone && phone.trim() !== "") {
      userData.phone = phone;
    }

    const newUser = new User(userData);
    await newUser.save();

    let newProfile; // Declare outside for error handling scope

    try {
      // Get target user's profile to inherit treeId
      const targetProfile = await Profile.findOne({ user: targetUser._id });
      if (!targetProfile) {
        throw new Error("Target user profile not found");
      }

      // Determine Tree ID
      const treeId = targetProfile.treeId || targetProfile.user;

      // Determine gender
      let memberGender = gender;
      if (gender === 'other' || !gender) {
        if (['father', 'brother', 'son'].includes(relationship)) memberGender = 'male';
        else if (['mother', 'sister', 'daughter'].includes(relationship)) memberGender = 'female';
      }

      // Create profile for new user
      newProfile = await Profile.create({
        user: newUser._id,
        treeId: treeId, // Assign treeId
        prefix,
        gender: memberGender,
        dob: new Date(dob),
        dateOfDeath: dateOfDeath ? new Date(dateOfDeath) : undefined,
        age: parseInt(age),
        email: email ? email.trim().toLowerCase() : undefined,
        profilePicture: profilePictureUrl
      });
      // If target didn't have treeId, update it now (migration on the fly)
      if (!targetProfile.treeId) {
        targetProfile.treeId = treeId;
        await targetProfile.save();
      }

      // Get other parent ID if provided
      const { otherParentId } = req.body;


      // Update relationships based on relationship type
      switch (relationship) {
        case 'father':
          if (targetProfile.father) return res.status(400).json({ message: "Father already exists" });
          targetProfile.father = newUser._id;
          if (targetProfile.gender === 'male') {
            if (!newProfile.sons) newProfile.sons = [];
            newProfile.sons.push(targetUser._id);
          } else {
            if (!newProfile.daughters) newProfile.daughters = [];
            newProfile.daughters.push(targetUser._id);
          }

          // Auto-link partner if mother exists
          if (targetProfile.mother) {
            const motherProfile = await Profile.findOne({ user: targetProfile.mother });
            if (motherProfile) {
              newProfile.partner = targetProfile.mother;
              motherProfile.partner = newUser._id;
              await motherProfile.save();
            }
          }
          break;

        case 'mother':
          if (targetProfile.mother) return res.status(400).json({ message: "Mother already exists" });
          targetProfile.mother = newUser._id;
          if (targetProfile.gender === 'male') {
            if (!newProfile.sons) newProfile.sons = [];
            newProfile.sons.push(targetUser._id);
          } else {
            if (!newProfile.daughters) newProfile.daughters = [];
            newProfile.daughters.push(targetUser._id);
          }

          // Auto-link partner if father exists
          if (targetProfile.father) {
            const fatherProfile = await Profile.findOne({ user: targetProfile.father });
            if (fatherProfile) {
              newProfile.partner = targetProfile.father;
              fatherProfile.partner = newUser._id;
              await fatherProfile.save();
            }
          }
          break;

        case 'brother':
          if (!targetProfile.brothers) targetProfile.brothers = [];
          targetProfile.brothers.push(newUser._id);
          if (targetProfile.gender === 'male') {
            if (!newProfile.brothers) newProfile.brothers = [];
            newProfile.brothers.push(targetUser._id);
          } else {
            if (!newProfile.sisters) newProfile.sisters = [];
            newProfile.sisters.push(targetUser._id);
          }
          newProfile.father = targetProfile.father;
          newProfile.mother = targetProfile.mother;
          break;

        case 'sister':
          if (!targetProfile.sisters) targetProfile.sisters = [];
          targetProfile.sisters.push(newUser._id);
          if (targetProfile.gender === 'male') {
            if (!newProfile.brothers) newProfile.brothers = [];
            newProfile.brothers.push(targetUser._id);
          } else {
            if (!newProfile.sisters) newProfile.sisters = [];
            newProfile.sisters.push(targetUser._id);
          }
          newProfile.father = targetProfile.father;
          newProfile.mother = targetProfile.mother;
          break;

        case 'partner':
          if (targetProfile.partner) return res.status(400).json({ message: "Partner already exists" });
          targetProfile.partner = newUser._id;
          newProfile.partner = targetUser._id;

          // Auto-link existing children to the new partner
          const existingChildrenFn = async () => {
            const childrenIds = [...(targetProfile.sons || []), ...(targetProfile.daughters || [])];
            for (const childId of childrenIds) {
              const childProfile = await Profile.findOne({ user: childId });
              if (childProfile) {
                let updatedChild = false;
                // Link Child -> New Partner
                if (targetProfile.gender === 'male') { // Target is Father, New is Mother
                  if (!childProfile.mother) {
                    childProfile.mother = newUser._id;
                    updatedChild = true;
                  }
                } else { // Target is Mother, New is Father
                  if (!childProfile.father) {
                    childProfile.father = newUser._id;
                    updatedChild = true;
                  }
                }

                if (updatedChild) await childProfile.save();

                // Link New Partner -> Child
                if (childProfile.gender === 'male') {
                  if (!newProfile.sons) newProfile.sons = [];
                  newProfile.sons.push(childProfile.user._id);
                } else {
                  if (!newProfile.daughters) newProfile.daughters = [];
                  newProfile.daughters.push(childProfile.user._id);
                }
              }
            }
          };
          await existingChildrenFn();
          break;

        case 'son':
          if (!targetProfile.sons) targetProfile.sons = [];
          targetProfile.sons.push(newUser._id);
          if (targetProfile.gender === 'male') {
            newProfile.father = targetUser._id;
            // Auto-assign mother if father has a partner
            if (targetProfile.partner) {
              const partnerProfile = await Profile.findOne({ user: targetProfile.partner });
              if (partnerProfile) {
                newProfile.mother = targetProfile.partner;
                if (!partnerProfile.sons) partnerProfile.sons = [];
                if (!partnerProfile.sons.includes(newUser._id)) {
                  partnerProfile.sons.push(newUser._id);
                  await partnerProfile.save();
                }
              }
            }
          } else {
            newProfile.mother = targetUser._id;
            // Auto-assign father if mother has a partner
            if (targetProfile.partner) {
              const partnerProfile = await Profile.findOne({ user: targetProfile.partner });
              if (partnerProfile) {
                newProfile.father = targetProfile.partner;
                if (!partnerProfile.sons) partnerProfile.sons = [];
                if (!partnerProfile.sons.includes(newUser._id)) {
                  partnerProfile.sons.push(newUser._id);
                  await partnerProfile.save();
                }
              }
            }
          }
          break;

        case 'daughter':
          if (!targetProfile.daughters) targetProfile.daughters = [];
          targetProfile.daughters.push(newUser._id);
          if (targetProfile.gender === 'male') {
            newProfile.father = targetUser._id;
            // Auto-assign mother if father has a partner
            if (targetProfile.partner) {
              const partnerProfile = await Profile.findOne({ user: targetProfile.partner });
              if (partnerProfile) {
                newProfile.mother = targetProfile.partner;
                if (!partnerProfile.daughters) partnerProfile.daughters = [];
                if (!partnerProfile.daughters.includes(newUser._id)) {
                  partnerProfile.daughters.push(newUser._id);
                  await partnerProfile.save();
                }
              }
            }
          } else {
            newProfile.mother = targetUser._id;
            // Auto-assign father if mother has a partner
            if (targetProfile.partner) {
              const partnerProfile = await Profile.findOne({ user: targetProfile.partner });
              if (partnerProfile) {
                newProfile.father = targetProfile.partner;
                if (!partnerProfile.daughters) partnerProfile.daughters = [];
                if (!partnerProfile.daughters.includes(newUser._id)) {
                  partnerProfile.daughters.push(newUser._id);
                  await partnerProfile.save();
                }
              }
            }
          }
          break;
      }

      await targetProfile.save();
      await newProfile.save();

      // Calculate sibling IDs for the newly added member
      const siblingIds = [];
      if (newProfile.father || newProfile.mother) {
        // Find all profiles that share the same father or mother
        const siblingsWithSameFather = newProfile.father
          ? await Profile.find({ father: newProfile.father, _id: { $ne: newProfile._id } })
          : [];
        const siblingsWithSameMother = newProfile.mother
          ? await Profile.find({ mother: newProfile.mother, _id: { $ne: newProfile._id } })
          : [];

        // Combine and deduplicate sibling IDs
        const allSiblingIds = new Set();
        siblingsWithSameFather.forEach(s => allSiblingIds.add(s.user.toString()));
        siblingsWithSameMother.forEach(s => allSiblingIds.add(s.user.toString()));
        siblingIds.push(...Array.from(allSiblingIds));
      }

      // Send welcome email (ONLY if not deceased and email exists)
      if (newProfile.email && !isDeceased && validPhone && !validPhone.startsWith('DEAD-')) {
        const addedByName = `${targetUser.firstname} ${targetUser.lastname}`;
        const familyMemberName = `${newUser.firstname} ${newUser.lastname}`;
        sendFamilyMemberWelcomeEmail(
          newProfile.email,
          addedByName,
          relationship,
          familyMemberName,
          {
            phone: validPhone,
            password: temporaryPassword
          }
        ).catch(err => console.error("Email sending failed:", err));
      }

      // [NEW] Create Notification for New Family Member
      // Notify everyone in the tree except the person who added them
      const fullCurrentUser = await User.findById(currentUserId);
      if (fullCurrentUser) {
        await Notification.create({
          sender: currentUserId,
          treeId: treeId,
          recipient: null, // Broadcast
          type: "new_member",
          message: `${fullCurrentUser.firstname} ${fullCurrentUser.lastname} added a new family member: ${newUser.firstname} ${newUser.lastname}`,
          referenceId: newUser._id
        });
      }

      return res.status(201).json({
        message: "Family member added successfully",
        data: {
          // Return the new person in the normalized format
          id: newUser._id.toString(),
          treeId: newProfile.treeId?.toString(),
          firstName: newUser.firstname,
          lastName: newUser.lastname,
          gender: newProfile.gender,
          profilePicture: newProfile.profilePicture,
          relationships: {
            fatherId: newProfile.father?.toString() || null,
            motherId: newProfile.mother?.toString() || null,
            partnerId: newProfile.partner?.toString() || null,
            childrenIds: [],
            siblingIds: siblingIds.map(id => id.toString())
          }
        }
      });

    } catch (innerError) {
      console.error("Rollback: Deleting partial data due to error:", innerError.message);
      if (newProfile) await Profile.findByIdAndDelete(newProfile._id);
      if (newUser) await User.findByIdAndDelete(newUser._id);
      throw innerError;
    }

  } catch (error) {
    console.error("Add Family Member Error:", error);
    next(error);
  }
};

// Get family tree statistics
export const getFamilyTreeStats = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has a profile
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile) {
      return res.status(404).json({
        message: "Profile not found. Please create your profile first."
      });
    }

    // Build the family tree and count members
    const visited = new Set();
    const stats = {
      totalMembers: 0,
      males: 0,
      females: 0,
      generations: 0,
      avgAge: 0,
      totalAge: 0
    };

    const countMembers = async (nodeId, depth = 0) => {
      if (visited.has(nodeId.toString())) return;
      visited.add(nodeId.toString());

      const profile = await Profile.findOne({ user: nodeId }).populate('user');
      if (!profile) return;

      stats.totalMembers++;
      if (profile.gender === 'male') stats.males++;
      if (profile.gender === 'female') stats.females++;
      if (profile.age) stats.totalAge += profile.age;
      if (depth > stats.generations) stats.generations = depth;

      // Count all relationships
      const relatedIds = [
        profile.father,
        profile.mother,
        ...(profile.brothers || []),
        ...(profile.sisters || []),
        profile.partner,
        ...(profile.sons || []),
        ...(profile.daughters || [])
      ].filter(Boolean);

      for (const relatedId of relatedIds) {
        await countMembers(relatedId, depth + 1);
      }
    };

    await countMembers(userId);

    stats.avgAge = stats.totalMembers > 0 ? Math.round(stats.totalAge / stats.totalMembers) : 0;

    return res.status(200).json({
      message: "Family tree stats retrieved successfully",
      data: stats
    });
  } catch (error) {
    console.error("Get Family Tree Stats Error:", error);
    next(error);
  }
};

// Set Guardian for the logged-in user
export const setGuardian = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { guardianId } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile) return res.status(404).json({ message: "Profile not found" });

    // Validate if guardian exists and is in the tree (optional but good)
    // For now just check if user exists
    if (guardianId) {
      const guardianUser = await User.findById(guardianId);
      if (!guardianUser) return res.status(404).json({ message: "Guardian user not found" });

      // Prevent setting self as guardian
      if (guardianId === userId.toString()) {
        return res.status(400).json({ message: "You cannot be your own guardian" });
      }
    }

    userProfile.guardian = guardianId || null; // Allow unsetting if null/undefined
    await userProfile.save();

    return res.status(200).json({
      message: guardianId ? "Guardian set successfully" : "Guardian removed successfully",
      data: { guardianId: userProfile.guardian }
    });

  } catch (error) {
    console.error("Set Guardian Error:", error);
    next(error);
  }
};

// Update family member (edit existing member)
export const updateFamilyMember = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { memberId } = req.params;
    const {
      firstname,
      lastname,
      prefix,
      dob,
      dateOfDeath,
      age,
      gender,
      phone,
      email
    } = req.body;

    // Find the member to update
    const memberUser = await User.findById(memberId);
    if (!memberUser) {
      return res.status(404).json({ message: "Member not found" });
    }

    const memberProfile = await Profile.findOne({ user: memberId });
    if (!memberProfile) {
      return res.status(404).json({ message: "Member profile not found" });
    }

    // Update User fields (firstname, lastname)
    if (firstname) memberUser.firstname = firstname.trim();
    if (lastname) memberUser.lastname = lastname.trim();

    // Update Phone (if provided and different)
    // We allow clearing phone if it's not required (e.g. user is or becomes Late, or if we decide living can be phoneless)
    // Current logic: Late members can have no phone. Living MUST have phone.

    // Check if phone is being updated
    if (phone !== undefined) {
      const phoneToUpdate = phone ? phone.trim() : "";
      const currentPhone = memberUser.phone || "";

      if (phoneToUpdate !== currentPhone) {
        // If clearing phone (phoneToUpdate is empty)
        if (phoneToUpdate === "") {
          // Allow clearing ONLY if Late (or if schema allows sparse for all - schema does, but app logic?)
          // User requested "remove auto generated phone", implying usage for Late.
          // Living users "should" have phone likely.
          // Let's allow clearing generally if the schema supports it, but maybe warn/block for living if strictly required?
          // For now, let's stick to: Late = Optional, Living = Required (enforced elsewhere or here).

          // Check if user is Late
          const isDeceased = prefix === 'Late' || (memberProfile.prefix === 'Late' && !prefix);

          if (!isDeceased) {
            // If Living, don't allow clearing phone completely via empty string?
            // Frontend 'EditMemberModal' enforces it for living.
            // Backend 'should' enforce it too.
            return res.status(400).json({ message: "Phone number is required for living members" });
          }

          memberUser.phone = undefined; // Clear it for sparse index
        } else {
          // Validating new phone number
          if (!validatePhone(phoneToUpdate).valid) {
            return res.status(400).json({ message: "Invalid phone number format" });
          }

          // Uniqueness check
          const existingUser = await User.findOne({ phone: phoneToUpdate, _id: { $ne: memberId } });
          if (existingUser) {
            return res.status(400).json({ message: "Phone number already in use by another user" });
          }

          memberUser.phone = phoneToUpdate;
        }
      }
    }

    // Handle profile picture upload to Cloudinary
    if (req.file) {
      try {
        console.log('📸 Uploading updated profile picture to Cloudinary...');
        const uploadResult = await uploadImageToCloudinary(
          req.file.buffer,
          'familytree/profiles'
        );
        memberProfile.profilePicture = uploadResult.url;
        console.log('✅ Profile picture updated successfully:', uploadResult.url);
      } catch (uploadError) {
        console.error('❌ Cloudinary upload failed:', uploadError);
        // Continue without updating profile picture
      }
    }

    // Update Profile fields
    if (prefix) memberProfile.prefix = prefix;
    if (dob) memberProfile.dob = new Date(dob);

    // Handle Date of Death
    if (dateOfDeath !== undefined) {
      if (dateOfDeath === "" || dateOfDeath === null) {
        memberProfile.dateOfDeath = undefined; // Clear it if empty
      } else {
        memberProfile.dateOfDeath = new Date(dateOfDeath);
      }
    }

    if (age !== undefined) memberProfile.age = parseInt(age);
    if (gender) memberProfile.gender = gender;

    // Update Email
    if (email !== undefined) {
      const emailToUpdate = email.trim().toLowerCase();
      if (emailToUpdate !== "" && emailToUpdate !== memberProfile.email) {
        // Check uniqueness
        const existingProfile = await Profile.findOne({ email: emailToUpdate, user: { $ne: memberId } });
        if (existingProfile) {
          return res.status(400).json({ message: "Email already in use" });
        }
        memberProfile.email = emailToUpdate;
      } else if (emailToUpdate === "") {
        memberProfile.email = undefined; // Allow clearing email
      }
    }

    // Save updates
    await memberUser.save();
    await memberProfile.save();

    return res.status(200).json({
      message: "Family member updated successfully",
      data: {
        userId: memberUser._id,
        firstname: memberUser.firstname,
        lastname: memberUser.lastname,
        phone: memberUser.phone,
        prefix: memberProfile.prefix,
        email: memberProfile.email,
        dob: memberProfile.dob,
        dateOfDeath: memberProfile.dateOfDeath,
        age: memberProfile.age,
        gender: memberProfile.gender,
        profilePicture: memberProfile.profilePicture
      }
    });
  } catch (err) {
    console.error("Update Family Member Error:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        message: "Duplicate field value"
      });
    }

    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({
        message: "Validation failed",
        errors
      });
    }

    next(err);
  }
};

// Remove family member relationship (not the user itself)
export const removeFamilyMember = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { memberId, relationship } = req.body;

    if (!memberId || !relationship) {
      return res.status(400).json({
        message: "memberId and relationship are required"
      });
    }

    const currentProfile = await Profile.findOne({ user: currentUserId });
    if (!currentProfile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const memberProfile = await Profile.findOne({ user: memberId });
    if (!memberProfile) {
      return res.status(404).json({ message: "Member profile not found" });
    }

    // Remove relationship based on type
    switch (relationship) {
      case 'father':
        currentProfile.father = null;
        if (currentProfile.gender === 'male') {
          memberProfile.sons = (memberProfile.sons || []).filter(
            id => id.toString() !== currentUserId.toString()
          );
        } else {
          memberProfile.daughters = (memberProfile.daughters || []).filter(
            id => id.toString() !== currentUserId.toString()
          );
        }
        break;

      case 'mother':
        currentProfile.mother = null;
        if (currentProfile.gender === 'male') {
          memberProfile.sons = (memberProfile.sons || []).filter(
            id => id.toString() !== currentUserId.toString()
          );
        } else {
          memberProfile.daughters = (memberProfile.daughters || []).filter(
            id => id.toString() !== currentUserId.toString()
          );
        }
        break;

      case 'brother':
        currentProfile.brothers = (currentProfile.brothers || []).filter(
          id => id.toString() !== memberId
        );
        if (currentProfile.gender === 'male') {
          memberProfile.brothers = (memberProfile.brothers || []).filter(
            id => id.toString() !== currentUserId.toString()
          );
        } else {
          memberProfile.sisters = (memberProfile.sisters || []).filter(
            id => id.toString() !== currentUserId.toString()
          );
        }
        break;

      case 'sister':
        currentProfile.sisters = (currentProfile.sisters || []).filter(
          id => id.toString() !== memberId
        );
        if (currentProfile.gender === 'male') {
          memberProfile.brothers = (memberProfile.brothers || []).filter(
            id => id.toString() !== currentUserId.toString()
          );
        } else {
          memberProfile.sisters = (memberProfile.sisters || []).filter(
            id => id.toString() !== currentUserId.toString()
          );
        }
        break;

      case 'partner':
        currentProfile.partner = null;
        memberProfile.partner = null;
        break;

      case 'son':
        currentProfile.sons = (currentProfile.sons || []).filter(
          id => id.toString() !== memberId
        );
        if (currentProfile.gender === 'male') {
          memberProfile.father = null;
        } else {
          memberProfile.mother = null;
        }
        break;

      case 'daughter':
        currentProfile.daughters = (currentProfile.daughters || []).filter(
          id => id.toString() !== memberId
        );
        if (currentProfile.gender === 'male') {
          memberProfile.father = null;
        } else {
          memberProfile.mother = null;
        }
        break;

      default:
        return res.status(400).json({ message: "Invalid relationship type" });
    }

    await currentProfile.save();
    await memberProfile.save();

    return res.status(200).json({
      message: "Family member relationship removed successfully"
    });
  } catch (err) {
    console.error("Remove Family Member Error:", err);
    next(err);
  }
};

// Delete a family member (completely remove profile and user)
export const deleteFamilyMember = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { memberId } = req.params;

    if (!memberId) {
      return res.status(400).json({ message: "Member ID is required" });
    }

    // 1. Prevent deleting self via this endpoint
    if (memberId === currentUserId.toString()) {
      return res.status(400).json({
        message: "You cannot delete yourself from here. Use account deletion instead."
      });
    }

    // 2. Fetch current user to verify permissions (must be admin/superadmin or tree owner)
    const currentUser = await User.findById(currentUserId);

    const memberProfile = await Profile.findOne({ user: memberId });
    if (!memberProfile) {
      return res.status(404).json({ message: "Member profile not found" });
    }

    // Check if current user is authorized to delete this member
    // Logic: Current user must be the 'treeId' owner OR admin
    const isTreeOwner = memberProfile.treeId && memberProfile.treeId.toString() === currentUserId.toString();
    const isAdmin = currentUser.isAdmin || currentUser.isSuperAdmin;

    if (!isTreeOwner && !isAdmin) {
      return res.status(403).json({ message: "You do not have permission to delete this member" });
    }

    // 3. CLEANUP RELATIONSHIPS

    // A. Remove from Parents (Father/Mother)
    if (memberProfile.father) {
      const fatherProfile = await Profile.findOne({ user: memberProfile.father });
      if (fatherProfile) {
        fatherProfile.sons = fatherProfile.sons?.filter(id => id.toString() !== memberId);
        fatherProfile.daughters = fatherProfile.daughters?.filter(id => id.toString() !== memberId);
        await fatherProfile.save();
      }
    }
    if (memberProfile.mother) {
      const motherProfile = await Profile.findOne({ user: memberProfile.mother });
      if (motherProfile) {
        motherProfile.sons = motherProfile.sons?.filter(id => id.toString() !== memberId);
        motherProfile.daughters = motherProfile.daughters?.filter(id => id.toString() !== memberId);
        await motherProfile.save();
      }
    }

    // B. Remove from Partner
    if (memberProfile.partner) {
      const partnerProfile = await Profile.findOne({ user: memberProfile.partner });
      if (partnerProfile) {
        partnerProfile.partner = null;
        await partnerProfile.save();
      }
    }

    // C. Remove from Siblings (Brothers/Sisters)
    if (memberProfile.brothers && memberProfile.brothers.length > 0) {
      for (const brotherId of memberProfile.brothers) {
        const brotherProfile = await Profile.findOne({ user: brotherId });
        if (brotherProfile) {
          brotherProfile.brothers = brotherProfile.brothers?.filter(id => id.toString() !== memberId);
          brotherProfile.sisters = brotherProfile.sisters?.filter(id => id.toString() !== memberId);
          await brotherProfile.save();
        }
      }
    }
    if (memberProfile.sisters && memberProfile.sisters.length > 0) {
      for (const sisterId of memberProfile.sisters) {
        const sisterProfile = await Profile.findOne({ user: sisterId });
        if (sisterProfile) {
          sisterProfile.brothers = sisterProfile.brothers?.filter(id => id.toString() !== memberId);
          sisterProfile.sisters = sisterProfile.sisters?.filter(id => id.toString() !== memberId);
          await sisterProfile.save();
        }
      }
    }

    // D. Update Children (Set their father/mother to null)
    if (memberProfile.sons && memberProfile.sons.length > 0) {
      for (const sonId of memberProfile.sons) {
        const sonProfile = await Profile.findOne({ user: sonId });
        if (sonProfile) {
          if (sonProfile.father?.toString() === memberId) sonProfile.father = null;
          if (sonProfile.mother?.toString() === memberId) sonProfile.mother = null;
          await sonProfile.save();
        }
      }
    }
    if (memberProfile.daughters && memberProfile.daughters.length > 0) {
      for (const daughterId of memberProfile.daughters) {
        const daughterProfile = await Profile.findOne({ user: daughterId });
        if (daughterProfile) {
          if (daughterProfile.father?.toString() === memberId) daughterProfile.father = null;
          if (daughterProfile.mother?.toString() === memberId) daughterProfile.mother = null;
          await daughterProfile.save();
        }
      }
    }

    // 4. Delete Profile and User
    await Profile.findByIdAndDelete(memberProfile._id);
    await User.findByIdAndDelete(memberId);

    return res.status(200).json({
      message: "Member deleted successfully"
    });

  } catch (err) {
    console.error("Delete Family Member Error:", err);
    next(err);
  }
};

// Get all family members list (flat list, not tree structure)
export const getFamilyMembersList = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile) {
      return res.status(404).json({
        message: "Profile not found. Please create your profile first."
      });
    }

    // Collect all family member IDs
    const visited = new Set();
    const members = [];

    const collectMembers = async (nodeId) => {
      if (visited.has(nodeId.toString())) return;
      visited.add(nodeId.toString());

      const profile = await Profile.findOne({ user: nodeId })
        .populate('user', 'firstname lastname phone');

      if (!profile) return;

      members.push({
        userId: profile.user._id,
        firstname: profile.user.firstname,
        lastname: profile.user.lastname,
        fullName: `${profile.user.firstname} ${profile.user.lastname}`,
        phone: profile.user.phone,
        email: profile.email,
        dob: profile.dob,
        age: profile.age,
        gender: profile.gender,
        profilePicture: profile.profilePicture
      });

      // Recursively collect all related members
      const relatedIds = [
        profile.father,
        profile.mother,
        ...(profile.brothers || []),
        ...(profile.sisters || []),
        profile.partner,
        ...(profile.sons || []),
        ...(profile.daughters || [])
      ].filter(Boolean);

      for (const relatedId of relatedIds) {
        await collectMembers(relatedId);
      }
    };

    await collectMembers(userId);

    // Apply Search Filter if provided
    let resultMembers = members;
    const { search } = req.query;
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      resultMembers = members.filter(m =>
        searchRegex.test(m.firstname) ||
        searchRegex.test(m.lastname) ||
        searchRegex.test(m.fullName)
      );
    }

    // Sort alphabetically
    resultMembers.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return res.status(200).json({
      message: "Family members list retrieved successfully",
      data: resultMembers
    });
  } catch (err) {
    console.error("Get Family Members List Error:", err);
    next(err);
  }
};

// Get top 6 family members for "Family Zone" widget
// Priority: Partner, Father, Mother, Brothers, Sisters, Sons, Daughters
export const getTopFamilyMembers = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userProfile = await Profile.findOne({ user: userId });

    // If no profile or no family links at all
    if (!userProfile) {
      return res.status(200).json({ success: true, members: [] });
    }

    // 1. Gather IDs in specific priority order
    const priorityList = [];

    if (userProfile.partner) priorityList.push({ id: userProfile.partner, rel: 'Partner' });
    if (userProfile.father) priorityList.push({ id: userProfile.father, rel: 'Father' });
    if (userProfile.mother) priorityList.push({ id: userProfile.mother, rel: 'Mother' });

    if (userProfile.brothers && userProfile.brothers.length > 0) {
      userProfile.brothers.forEach(id => priorityList.push({ id, rel: 'Brother' }));
    }
    if (userProfile.sisters && userProfile.sisters.length > 0) {
      userProfile.sisters.forEach(id => priorityList.push({ id, rel: 'Sister' }));
    }
    if (userProfile.sons && userProfile.sons.length > 0) {
      userProfile.sons.forEach(id => priorityList.push({ id, rel: 'Son' }));
    }
    if (userProfile.daughters && userProfile.daughters.length > 0) {
      userProfile.daughters.forEach(id => priorityList.push({ id, rel: 'Daughter' }));
    }

    // 2. Take top 6 unique IDs
    const uniqueMap = new Map();
    const topMembers = [];

    for (const item of priorityList) {
      if (topMembers.length >= 6) break;
      const strId = item.id.toString();
      if (!uniqueMap.has(strId)) {
        uniqueMap.set(strId, true);
        topMembers.push(item);
      }
    }

    if (topMembers.length === 0) {
      return res.status(200).json({ success: true, members: [] });
    }

    const memberIds = topMembers.map(m => m.id);

    // 3. Fetch details
    // Need Name from User and Picture from Profile
    const [users, profiles] = await Promise.all([
      User.find({ _id: { $in: memberIds } }).select('firstname lastname'),
      Profile.find({ user: { $in: memberIds } }).select('user profilePicture')
    ]);

    // 4. Map back to ordered list
    const results = topMembers.map(member => {
      const user = users.find(u => u._id.toString() === member.id.toString());
      const profile = profiles.find(p => p.user.toString() === member.id.toString());

      if (!user) return null; // Should not happen ideally

      return {
        id: user._id,
        name: `${user.firstname} ${user.lastname}`,
        relation: member.rel,
        profilePicture: profile?.profilePicture || ""
      };
    }).filter(Boolean);

    return res.status(200).json({
      success: true,
      members: results
    });

  } catch (err) {
    console.error("Get Top Family Members Error:", err);
    next(err);
  }
};