// @access  Private
import ExternalContact from "../models/ExternalContact.js";
import { getUserId } from "../utils/common.js";

export const getMyContacts = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const contacts = await ExternalContact.find({ user: userId }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            data: contacts
        });
    } catch (error) {
        console.error("Get Contacts Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @desc    Create a new external contact
// @route   POST /api/external-contacts
// @access  Private
export const createContact = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const { name, mobile, email, relation, foodPreference } = req.body;

        if (!name || !mobile || !relation) {
            return res.status(400).json({ success: false, message: "Name, Mobile and Relation are required" });
        }

        // Check duplicate (handled by index, but good to check explicitly for clear error)
        const existing = await ExternalContact.findOne({ user: userId, mobile });
        if (existing) {
            return res.status(400).json({ success: false, message: "Contact with this mobile number already exists" });
        }

        const newContact = await ExternalContact.create({
            user: userId,
            name,
            mobile,
            email,
            email,
            relation,
            foodPreference
        });

        res.status(201).json({
            success: true,
            message: "Contact added successfully",
            data: newContact
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Contact with this mobile number already exists" });
        }
        console.error("Create Contact Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @desc    Delete external contact
// @route   DELETE /api/external-contacts/:id
// @access  Private
export const deleteContact = async (req, res) => {
    try {
        const userId = getUserId(req);
        const contactId = req.params.id;

        const contact = await ExternalContact.findOne({ _id: contactId, user: userId });

        if (!contact) {
            return res.status(404).json({ success: false, message: "Contact not found" });
        }

        await ExternalContact.deleteOne({ _id: contactId });

        res.status(200).json({
            success: true,
            message: "Contact deleted successfully"
        });
    } catch (error) {
        console.error("Delete Contact Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};
