import ContactGroup from "../models/ContactGroup.js";
import User from "../models/User.js";
import ExternalContact from "../models/ExternalContact.js";
import { getUserId } from "../utils/common.js";

// Create a new contact group
export const createGroup = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { name, description, members } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Group name is required" });
        }

        const group = await ContactGroup.create({
            user: userId,
            name,
            description,
            members: members || []
        });

        res.status(201).json({
            message: "Group created successfully",
            data: group
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "A group with this name already exists" });
        }
        next(error);
    }
};

// Get all groups for the authenticated user
export const getGroups = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const groups = await ContactGroup.find({ user: userId }).lean();

        // Manual population for each group
        for (let group of groups) {
            const populatedMembers = [];
            for (let member of group.members) {
                let memberData = null;
                if (member.memberType === "User") {
                    memberData = await User.findById(member.memberId).select("firstname lastname").lean();
                    if (memberData) {
                        populatedMembers.push({
                            ...member,
                            name: `${memberData.firstname} ${memberData.lastname}`
                        });
                    }
                } else {
                    memberData = await ExternalContact.findById(member.memberId).select("name").lean();
                    if (memberData) {
                        populatedMembers.push({
                            ...member,
                            name: memberData.name
                        });
                    }
                }
            }
            group.members = populatedMembers;
        }

        res.status(200).json({
            message: "Groups retrieved successfully",
            data: groups
        });
    } catch (error) {
        next(error);
    }
};

// Get a specific group with member details
export const getGroupById = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { id } = req.params;

        const group = await ContactGroup.findOne({ _id: id, user: userId }).lean();
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        const populatedMembers = [];
        for (let member of group.members) {
            let memberData = null;
            if (member.memberType === "User") {
                memberData = await User.findById(member.memberId).select("firstname lastname").lean();
                if (memberData) {
                    populatedMembers.push({
                        ...member,
                        name: `${memberData.firstname} ${memberData.lastname}`
                    });
                }
            } else {
                memberData = await ExternalContact.findById(member.memberId).select("name").lean();
                if (memberData) {
                    populatedMembers.push({
                        ...member,
                        name: memberData.name
                    });
                }
            }
        }
        group.members = populatedMembers;

        res.status(200).json({
            message: "Group retrieved successfully",
            data: group
        });
    } catch (error) {
        next(error);
    }
};

// Update a group
export const updateGroup = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { id } = req.params;
        const { name, description, members } = req.body;

        const group = await ContactGroup.findOneAndUpdate(
            { _id: id, user: userId },
            { $set: { name, description, members } },
            { new: true, runValidators: true }
        );

        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        res.status(200).json({
            message: "Group updated successfully",
            data: group
        });
    } catch (error) {
        next(error);
    }
};

// Delete a group
export const deleteGroup = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { id } = req.params;

        const group = await ContactGroup.findOneAndDelete({ _id: id, user: userId });
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        res.status(200).json({
            message: "Group deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};
