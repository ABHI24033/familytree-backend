import Notice from "../models/Notice.js";
import Notification from "../models/Notification.js";
import Profile from "../models/Profile.js"; // Needed to get user name for message
import User from "../models/User.js"; // Needed if profile not sufficient
import { uploadPdfToCloudinary, deletePdfFromCloudinary } from "../utils/PdfUploadToCloudaniry.js";

// ============================
// Create a new Notice
// ============================
export const createNotice = async (req, res) => {
  try {
    const {
      title,
      category,
      description,
      isPinned,
      startDate,
      endDate,
      status,
      createdBy,
    } = req.body;

    let pdfData = { url: null, public_id: null };
    if (req.file) {
      pdfData = await uploadPdfToCloudinary(req.file.buffer);
    }


    const newNotice = await Notice.create({
      title,
      category,
      description,
      isPinned: isPinned || false,
      startDate: startDate || new Date(),
      endDate: endDate || null,
      status: status || "Active",
      createdBy,
      pdfUrl: pdfData.url,
      pdfPublicId: pdfData.public_id,
    });

    const userProfile = await Profile.findOne({ user: createdBy });

    // [NEW] Create Notification
    if (userProfile && userProfile.treeId) {
      await Notification.create({
        sender: createdBy,
        treeId: userProfile.treeId,
        type: "notice",
        message: `New Notice: ${title}`,
        referenceId: newNotice._id,
      });
    }

    res.status(201).json({
      success: true,
      message: "Notice created successfully",
      notice: newNotice,
    });
  } catch (error) {
    console.error("Create Notice Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================
// Get Notices for ADMIN (Full Access)
// ============================
export const getAllNoticesForAdmin = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      date = "",
      startDate = "",
      endDate = "",
      sort = "latest",
      status = "",
    } = req.query;

    console.log("Admin Notices Query Params:", { search, date, status });

    page = Number(page);
    limit = Number(limit);

    // Sorting
    let sortStage = { createdAt: -1 };
    if (sort === "oldest") sortStage = { createdAt: 1 };

    // Auto-expire logic (admin should also know)
    await Notice.updateMany(
      { endDate: { $lt: new Date() }, status: { $ne: "Expired" } },
      { status: "Expired", isActive: false }
    );

    // ADMIN can see everything
    const matchStage = {};

    if (search) {
      matchStage.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }
    if (status) matchStage.status = status;

    // Date range filter (preferred)
    if ((startDate && startDate !== "null" && startDate !== "undefined" && startDate !== "") ||
      (endDate && endDate !== "null" && endDate !== "undefined" && endDate !== "")) {
      let range = {};

      if (startDate && startDate !== "null" && startDate !== "undefined" && startDate !== "") {
        const dStart = new Date(startDate);
        if (!isNaN(dStart.getTime())) {
          dStart.setHours(0, 0, 0, 0);
          range.$gte = dStart;
        }
      }

      if (endDate && endDate !== "null" && endDate !== "undefined" && endDate !== "") {
        const dEnd = new Date(endDate);
        if (!isNaN(dEnd.getTime())) {
          dEnd.setHours(23, 59, 59, 999);
          range.$lte = dEnd;
        }
      }

      if (Object.keys(range).length > 0) {
        matchStage.startDate = range;
      }
    } else if (date && date !== "null" && date !== "undefined" && date !== "") {
      // Backwards compatibility: single date filter
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        const startOfDay = new Date(d);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(d);
        endOfDay.setHours(23, 59, 59, 999);
        matchStage.startDate = { $gte: startOfDay, $lte: endOfDay };
      }
    }

    const pipeline = [
      { $match: matchStage },
      { $sort: { isPinned: -1, ...sortStage } },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          notices: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ];

    const result = await Notice.aggregate(pipeline);

    const total = result[0].totalCount[0]?.count || 0;

    res.status(200).json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      notices: result[0].notices, // contains all fields
    });

  } catch (error) {
    console.error("Admin Get Notices Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// ============================
// Get Notices for USERS
// ============================
export const getAllNoticesForUsers = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      date = "",
      startDate = "",
      endDate = "",
      sort = "latest",
    } = req.query;

    console.log("User Notices Query Params:", { search, date });

    page = Number(page);
    limit = Number(limit);

    // Sorting
    let sortStage = { createdAt: -1 };
    if (sort === "oldest") sortStage = { createdAt: 1 };

    // Auto-expire notices
    await Notice.updateMany(
      { endDate: { $lt: new Date() }, status: { $ne: "Expired" } },
      { status: "Expired", isActive: false }
    );

    // USER only sees active + not expired
    const matchStage = {
      isActive: true,
      status: { $ne: "Expired" },
    };

    if (search) {
      matchStage.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    // Date range filter (preferred)
    if ((startDate && startDate !== "null" && startDate !== "undefined" && startDate !== "") ||
      (endDate && endDate !== "null" && endDate !== "undefined" && endDate !== "")) {
      let range = {};

      if (startDate && startDate !== "null" && startDate !== "undefined" && startDate !== "") {
        const dStart = new Date(startDate);
        if (!isNaN(dStart.getTime())) {
          dStart.setHours(0, 0, 0, 0);
          range.$gte = dStart;
        }
      }

      if (endDate && endDate !== "null" && endDate !== "undefined" && endDate !== "") {
        const dEnd = new Date(endDate);
        if (!isNaN(dEnd.getTime())) {
          dEnd.setHours(23, 59, 59, 999);
          range.$lte = dEnd;
        }
      }

      if (Object.keys(range).length > 0) {
        matchStage.startDate = range;
      }
    } else if (date && date !== "null" && date !== "undefined" && date !== "") {
      // Backwards compatibility: single date filter
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        const startOfDay = new Date(d);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(d);
        endOfDay.setHours(23, 59, 59, 999);
        matchStage.startDate = { $gte: startOfDay, $lte: endOfDay };
      }
    }

    const pipeline = [
      { $match: matchStage },
      { $sort: { isPinned: -1, ...sortStage } },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          notices: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ];

    const result = await Notice.aggregate(pipeline);

    const total = result[0].totalCount[0]?.count || 0;

    res.status(200).json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      notices: result[0].notices,
    });

  } catch (error) {
    console.error("User Get Notices Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// ============================
// Get notices with pagination + filtering + search + sorting
// ============================
export const getAllNotices = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      date = "",
      sort = "latest",
      status = "",
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    // Sorting
    let sortStage = { createdAt: -1 };
    if (sort === "oldest") sortStage = { createdAt: 1 };

    // Match conditions
    const matchStage = { isActive: true };

    if (search) {
      matchStage.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    if (status) {
      matchStage.status = status;
    }

    if (date && date !== "null" && date !== "undefined" && date !== "") {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        const startOfDay = new Date(d);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(d);
        endOfDay.setHours(23, 59, 59, 999);
        matchStage.startDate = { $gte: startOfDay, $lte: endOfDay };
      }
    }

    // Auto-expire logic: update status for expired notices
    await Notice.updateMany(
      { endDate: { $lt: new Date() }, status: { $ne: "Expired" } },
      { status: "Expired", isActive: false }
    );

    const pipeline = [
      { $match: matchStage },

      // Pinned first
      { $sort: { isPinned: -1, ...sortStage } },

      // Pagination
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          notices: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ];

    const result = await Notice.aggregate(pipeline);

    const total = result[0].totalCount[0]?.count || 0;

    res.status(200).json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      notices: result[0].notices,
    });
  } catch (error) {
    console.error("Get Notices Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================
// Get Single Notice
// ============================
export const getSingleNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    // Auto-expire check
    if (notice.endDate && notice.endDate < new Date()) {
      notice.status = "Expired";
      notice.isActive = false;
      await notice.save();
    }

    res.status(200).json({
      success: true,
      notice,
    });
  } catch (error) {
    console.error("Get Notice Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================
// Update Notice
// ============================
export const updateNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    let updateData = { ...req.body };

    if (req.file) {
      // Delete old PDF if exists
      if (notice.pdfPublicId) {
        await deletePdfFromCloudinary(notice.pdfPublicId);
      }
      const pdfData = await uploadPdfToCloudinary(req.file.buffer);
      updateData.pdfUrl = pdfData.url;
      updateData.pdfPublicId = pdfData.public_id;
    }

    const updated = await Notice.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // Auto-expire check
    if (updated.endDate && updated.endDate < new Date()) {
      updated.status = "Expired";
      await updated.save();
    }

    res.status(200).json({
      success: true,
      message: "Notice updated successfully",
      notice: updated,
    });
  } catch (error) {
    console.error("Update Notice Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================
// Permanently Delete Notice
// ============================
export const deleteNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    // Delete PDF from Cloudinary
    if (notice.pdfPublicId) {
      await deletePdfFromCloudinary(notice.pdfPublicId);
    }

    await Notice.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Notice deleted successfully",
    });
  } catch (error) {
    console.error("Delete Notice Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================
// Soft Delete / Restore Notice
// ============================
export const toggleNoticeActive = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    notice.isActive = !notice.isActive;
    await notice.save();

    res.status(200).json({
      success: true,
      message: `Notice ${notice.isActive ? "restored" : "removed"}`,
      notice,
    });
  } catch (error) {
    console.error("Toggle Notice Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ============================
// Pin / Unpin Notice
// ============================
export const toggleNoticePin = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    notice.isPinned = !notice.isPinned;
    await notice.save();

    res.status(200).json({
      success: true,
      message: notice.isPinned ? "Notice pinned" : "Notice unpinned",
      notice,
    });
  } catch (error) {
    console.error("Pin Toggle Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
