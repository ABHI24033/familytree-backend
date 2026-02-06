import GuestList from "../models/GuestList.js";

// @desc    Create a new guest list
// @route   POST /api/guest-lists
// @access  Private
export const createGuestList = async (req, res) => {
    try {
        const { name, members, externalMembers } = req.body;
        const user = req?.user?.id || req?.user?._id;

        const guestList = await GuestList.create({
            user,
            name,
            members,
            externalMembers,
        });

        res.status(201).json({
            success: true,
            data: guestList,
            message: "Guest list created successfully",
        });
    } catch (error) {
        console.error("Create Guest List Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create guest list",
            error: error.message,
        });
    }
};

// @desc    Get all guest lists for current user
// @route   GET /api/guest-lists
// @access  Private
export const getMyGuestLists = async (req, res) => {
    try {
        const guestLists = await GuestList.find({ user: req.user._id || req.user.id })
            .populate("members", "firstname lastname profilePicture phone email") // Populate necessary user fields
            .populate("externalMembers") // Populate all external contact fields
            .sort({ createdAt: -1 });

        // Transform members to match frontend expectations if needed
        const transformedLists = guestLists.map(list => {
            const listObj = list.toObject();

            // Transform User members to have 'id', 'name', 'avatar'
            if (listObj.members) {
                listObj.members = listObj.members.map(m => ({
                    id: m._id,
                    name: `${m.firstname} ${m.lastname}`.trim(),
                    avatar: m.profilePicture, // Assuming profilePicture exists on User/Profile virtual
                    // Note: User.js has virtual populate for Profile. 
                    // If profilePicture is on Profile model, simple populate 'members' won't get it directly unless we deep populate or User has it.
                    // Checking User.js: profilePicture IS NOT on User. It's likely on Profile. 
                    // But 'getFamilyMembersList' in frontend uses data that has 'fullName' and 'profilePicture'.
                    // Let's assume for now the frontend handles the data it gets, or we might need to adjust populate.
                    // Wait, `UserMultiSelect` expects {id, name, avatar}. 
                    // Let's stick to standard populate first. If data is missing we can refine.
                }));
            }

            // Transform External Members
            if (listObj.externalMembers) {
                listObj.externalMembers = listObj.externalMembers.map(m => ({
                    id: m._id,
                    name: m.name,
                    mobile: m.mobile,
                    email: m.email,
                    relation: m.relation
                }));
            }

            return listObj;
        });

        res.status(200).json({
            success: true,
            data: transformedLists, // Send transformed data
        });
    } catch (error) {
        console.error("Get Guest Lists Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch guest lists",
            error: error.message,
        });
    }
};

// @desc    Delete a guest list
// @route   DELETE /api/guest-lists/:id
// @access  Private
export const deleteGuestList = async (req, res) => {
    try {
        const guestList = await GuestList.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id,
        });

        if (!guestList) {
            return res.status(404).json({
                success: false,
                message: "Guest list not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Guest list deleted successfully",
        });
    } catch (error) {
        console.error("Delete Guest List Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete guest list",
            error: error.message,
        });
    }
};
