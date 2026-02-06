import mongoose from "mongoose";
import Post from "../models/Post.js";
import User from "../models/User.js";
import Poll from "../models/Poll.js";
import Profile from "../models/Profile.js";
import { deleteImageFromCloudinary, extractPublicIdFromUrl, uploadImageToCloudinary } from "../utils/cloudinaryUpload.js";
import { getUserId } from "../utils/common.js";
import Notification from "../models/Notification.js";

export const createPost = async (req, res) => {
  try {
    const userId = req?.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { text } = req.body;

    // Ensure either text or image exists
    if ((!text || text.trim() === "") && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Post cannot be empty. Provide text or images.",
      });
    }

    let uploadedImages = [];
    // ========== MULTIPLE IMAGE UPLOAD ==========
    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          const uploadResult = await uploadImageToCloudinary(file.buffer);
          uploadedImages.push(uploadResult.url);
        }
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: "Image upload failed",
          error: err.message,
        });
      }
    }

    // ========== FETCH USER PROFILE FOR TREE ID ==========
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile || !userProfile.treeId) {
      return res.status(400).json({
        success: false,
        message: "User does not belong to a family tree",
      });
    }

    // ========== CREATE POST DATA ==========
    const postData = {
      user: userId,
      treeId: userProfile.treeId,
      text: text || "",
      images: uploadedImages,
    };

    const post = await Post.create(postData);

    // [NEW] Create Notification
    // [NEW] Create Notification
    const user = await User.findById(userId);
    if (user) {
      await Notification.create({
        sender: userId,
        treeId: userProfile.treeId,
        type: "post",
        message: `${user.firstname} ${user.lastname} posted in the feed.`,
        referenceId: post._id,
      });
    }

    await post.populate("user", "firstname lastname avatar");

    return res.status(201).json({
      success: true,
      message: "Post created successfully",
      data: post,
    });

  } catch (err) {
    console.error("createPost Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
export const getFeed = async (req, res) => {
  try {
    const limit = Math.min(20, parseInt(req.query.limit || "10"));
    const cursor = req.query.cursor || null;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Fetch profile once
    const profile = await Profile.findOne({ user: userId });


    if (!profile || !profile.treeId) {
      return res.status(400).json({ success: false, message: "User profile or treeId not found" });
    }

    const matchStage = {
      treeId: profile.treeId,
      ...(cursor ? { _id: { $lt: new mongoose.Types.ObjectId(cursor) } } : {})
    };

    const pipeline = [
      { $match: matchStage },

      { $sort: { _id: -1 } },

      { $limit: limit },

      // JOIN POST AUTHOR (users collection)
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "authorData",
        },
      },
      { $unwind: "$authorData" },

      // JOIN POST AUTHOR PROFILE (profiles collection)
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

      // JOIN COMMENT AUTHORS
      {
        $lookup: {
          from: "users",
          localField: "comments.user",
          foreignField: "_id",
          as: "commentAuthors",
        },
      },

      // JOIN COMMENT AUTHOR PROFILES
      {
        $lookup: {
          from: "profiles",
          localField: "comments.user",
          foreignField: "user",
          as: "commentProfiles",
        },
      },

      // Add fields (counts, likedByMe, author info, comments info)
      {
        $addFields: {
          likesCount: { $size: "$likes" },
          commentsCount: { $size: "$comments" },
          likedByMe: { $in: [new mongoose.Types.ObjectId(userId), "$likes"] },
          isPoll: false, // Mark as regular post

          // FIXED: Correct post author with actual profile picture
          author: {
            _id: "$authorData._id",
            firstname: "$authorData.firstname",
            lastname: "$authorData.lastname",
            avatar: "$authorData.avatar",
            profilePicture: "$authorProfile.profilePicture",
          },

          comments: {
            $map: {
              input: "$comments",
              as: "cmt",
              in: {
                _id: "$$cmt._id",
                text: "$$cmt.text",
                createdAt: "$$cmt.createdAt",

                user: {
                  $let: {
                    vars: {
                      userObj: {
                        $first: {
                          $filter: {
                            input: "$commentAuthors",
                            as: "ca",
                            cond: { $eq: ["$$ca._id", "$$cmt.user"] },
                          },
                        },
                      },
                      profileObj: {
                        $first: {
                          $filter: {
                            input: "$commentProfiles",
                            as: "cp",
                            cond: { $eq: ["$$cp.user", "$$cmt.user"] },
                          },
                        },
                      },
                    },

                    in: {
                      _id: "$$userObj._id",
                      firstname: "$$userObj.firstname",
                      lastname: "$$userObj.lastname",
                      profilePicture: "$$profileObj.profilePicture", // FIXED
                    },
                  },
                },
              },
            },
          },
        },
      },

      // Remove unwanted fields
      {
        $project: {
          authorData: 0,
          authorProfile: 0,
          commentAuthors: 0,
          commentProfiles: 0,
        },
      },
    ];

    const posts = await Post.aggregate(pipeline);

    // ========== FETCH POLLS ==========
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
          hasVoted: { $in: [new mongoose.Types.ObjectId(userId), "$voters"] },

          author: {
            _id: "$authorData._id",
            firstname: "$authorData.firstname",
            lastname: "$authorData.lastname",
            avatar: "$authorData.avatar",
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

    // ========== MERGE AND SORT ==========
    const allItems = [...posts, ...polls].sort((a, b) => {
      // Sort by _id (which contains timestamp) in descending order
      return b._id.getTimestamp() - a._id.getTimestamp();
    }).slice(0, limit);

    const nextCursor = allItems.length > 0 ? allItems[allItems.length - 1]._id : null;

    return res.json({
      success: true,
      data: allItems,
      nextCursor,
      limit,
    });

  } catch (err) {
    console.error("Feed Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const getPostById = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: "Invalid Post ID" });
    }

    // Fetch user profile (for profilePicture)
    const profile = await Profile.findOne({ user: userId });

    const pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(postId) } },

      // JOIN POST AUTHOR DETAILS
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "authorData",
        },
      },
      { $unwind: "$authorData" },

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
      // JOIN COMMENT AUTHORS
      {
        $lookup: {
          from: "users",
          localField: "comments.user",
          foreignField: "_id",
          as: "commentAuthors",
        },
      },

      // Add computed fields
      {
        $addFields: {
          likesCount: { $size: "$likes" },
          commentsCount: { $size: "$comments" },
          likedByMe: { $in: [new mongoose.Types.ObjectId(userId), "$likes"] },

          author: {
            _id: "$authorData._id",
            firstname: "$authorData.firstname",
            lastname: "$authorData.lastname",
            profilePicture: "$authorProfile.profilePicture",
          },

          profilePicture: profile?.profilePicture || null,
          timeAgo: { $toString: "$createdAt" }
        },
      },

      // Clean response
      {
        $project: {
          authorData: 0,
          commentAuthors: 0,
        },
      },
    ];

    const post = await Post.aggregate(pipeline);

    if (!post || post.length === 0) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    return res.json({
      success: true,
      data: post[0],
      profile,
    });

  } catch (err) {
    console.error("Get Post Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// Toggle like/unlike
export const toggleLike = async (req, res) => {
  try {
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: "Invalid post id" });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const userId = req?.user?.id;

    // Check if user belongs to the same family tree
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile || !userProfile.treeId || (post.treeId && post.treeId.toString() !== userProfile.treeId.toString())) {
      return res.status(403).json({ success: false, message: "You can only like posts from your family tree" });
    }

    const likedIndex = post.likes.findIndex(uid => uid.toString() === userId.toString());

    if (likedIndex >= 0) {
      // unlike
      post.likes.splice(likedIndex, 1);
      await post.save();
      return res.json({ success: true, action: "unliked", likesCount: post.likes.length });
    } else {
      // like
      post.likes.push(userId);
      await post.save();
      return res.json({ success: true, action: "liked", likesCount: post.likes.length });
    }
  } catch (err) {
    console.error("toggleLike:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// Add comment to a post
export const addComment = async (req, res) => {
  try {
    const postId = req.params.id;
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "Comment cannot be empty" });
    }
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: "Invalid post id" });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    // Check if user belongs to the same family tree
    const userProfile = await Profile.findOne({ user: req.user.id });
    if (!userProfile || !userProfile.treeId || (post.treeId && post.treeId.toString() !== userProfile.treeId.toString())) {
      return res.status(403).json({ success: false, message: "You can only comment on posts from your family tree" });
    }

    const comment = { user: req.user.id, text: text.trim() };
    post.comments.push(comment);
    await post.save();
    await post.populate("comments.user", "name avatar");

    // return the newest comment (last)
    const newComment = post.comments[post.comments.length - 1];
    res.json({ success: true, data: newComment });
  } catch (err) {
    console.error("addComment:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// get comment
export const getComments = async (req, res) => {
  try {
    const postId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: "Invalid post id" });
    }

    const post = await Post.findById(postId)
      .select("comments")
      .populate({
        path: "comments.user",
        select: "firstname lastname",
        populate: {
          path: "profile",        // profile reference inside User model
          model: "Profile",
          select: "profilePicture"
        }
      });

    if (!post)
      return res.status(404).json({ success: false, message: "Post not found" });

    // Format comments to include profilePicture at top level
    const formattedComments = post.comments.map((c) => ({
      _id: c._id,
      text: c.text,
      createdAt: c.createdAt,
      user: {
        _id: c.user._id,
        firstname: c.user.firstname,
        lastname: c.user.lastname,
        profilePicture: c.user.profile?.profilePicture || null,
      }
    }));

    res.json({ success: true, data: formattedComments });

  } catch (err) {
    console.error("getComments:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// Delete a post (owner only)
export const deletePost = async (req, res) => {
  try {
    const postId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID",
      });
    }

    // Find post
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check ownership
    if (String(post.user) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this post",
      });
    }

    // Delete post
    await Post.findByIdAndDelete(postId);

    return res.json({
      success: true,
      message: "Post deleted successfully",
    });

  } catch (err) {
    console.error("deletePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: "Invalid postId or commentId" });
    }

    // Find Post
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // Find Comment
    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    // Authorization
    const userId = req.user.id.toString();
    const isCommentOwner = comment.user.toString() === userId;
    const isPostOwner = post.user.toString() === userId;

    if (!isCommentOwner && !isPostOwner) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this comment",
      });
    }

    // Remove comment
    post.comments.pull(commentId);
    await post.save();

    return res.json({
      success: true,
      message: "Comment deleted successfully",
    });

  } catch (error) {
    console.error("deleteComment Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting comment",
    });
  }
};

// Edit Comment
export const editComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;

    // Validate input
    if (!text || text.trim() === "") {
      return res.status(400).json({ success: false, message: "Comment text is required" });
    }

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: "Invalid postId or commentId" });
    }

    // Find post
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // Find comment
    const comment = post.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    // Authorization → Only comment owner can edit
    const userId = req.user.id.toString();
    const isCommentOwner = comment.user.toString() === userId;

    if (!isCommentOwner) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to edit this comment",
      });
    }

    // Update comment text
    comment.text = text;
    comment.edited = true; // optional: mark edited
    comment.updatedAt = new Date();

    await post.save();

    return res.json({
      success: true,
      message: "Comment updated successfully",
      comment,
    });

  } catch (error) {
    console.error("editComment Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while editing comment",
    });
  }
};


// Edit / Update Post
export const editPost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: "Invalid post ID" });
    }

    // Find Post
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // Check authorization
    if (String(post.user) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this post" });
    }
    // Extract body
    const { text, removeImages } = req.body;
    // -------------------------------
    // 1️⃣ UPDATE TEXT
    // -------------------------------
    if (text !== undefined) {
      post.text = text;
    }
    // -------------------------------
    // 2️⃣ NORMALIZE removeImages into an ARRAY of URLs
    // -------------------------------
    let removeList = [];

    if (removeImages) {
      if (Array.isArray(removeImages)) {
        removeList = removeImages;
      } else {
        try {
          // If backend receives JSON string
          const parsed = JSON.parse(removeImages);
          removeList = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          // Comma-separated fallback
          removeList = removeImages.split(",").map(s => s.trim());
        }
      }
    }
    removeList = removeList.map(String).filter(Boolean);
    // -------------------------------
    // 3️⃣ REMOVE FROM CLOUDINARY
    // -------------------------------
    if (removeList.length > 0) {

      for (const url of removeList) {
        const publicId = extractPublicIdFromUrl(url);
        if (publicId) {
          await deleteImageFromCloudinary(publicId);
        }
      }
      // -------------------------------
      // 4️⃣ REMOVE FROM DATABASE
      // Because DB stores string URLs
      // -------------------------------
      post.images = post.images.filter(
        (imgUrl) => !removeList.includes(imgUrl)
      );
    }
    // -------------------------------
    // 3️⃣ UPLOAD NEW IMAGES
    // -------------------------------
    let newImages = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploaded = await uploadImageToCloudinary(file.buffer);
        newImages.push(uploaded?.url);
      }
    }

    // Add newly uploaded images to post
    post.images = [...post.images, ...newImages];

    // -------------------------------
    // 4️⃣ SAVE UPDATED POST
    // -------------------------------
    await post.save();
    await post.populate("user", "firstname lastname avatar");

    return res.json({
      success: true,
      message: "Post updated successfully",
      data: post
    });

  } catch (err) {
    console.error("editPost Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while editing post"
    });
  }
};

// ======================================
// POLL CONTROLLERS
// ======================================

// Create Poll
export const createPoll = async (req, res) => {
  try {
    const userId = req?.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { question, options, duration } = req.body;

    // Validation
    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "Poll question is required",
      });
    }

    if (!options || !Array.isArray(options) || options.length < 2 || options.length > 5) {
      return res.status(400).json({
        success: false,
        message: "Poll must have between 2 and 5 options",
      });
    }

    // Validate all options have text
    const validOptions = options.filter(opt => opt && opt.trim());
    if (validOptions.length < 2) {
      return res.status(400).json({
        success: false,
        message: "At least 2 valid options required",
      });
    }

    if (!duration || duration < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid poll duration",
      });
    }

    // Fetch user profile for tree ID
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile || !userProfile.treeId) {
      return res.status(400).json({
        success: false,
        message: "User does not belong to a family tree",
      });
    }

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + duration);

    // Create poll data
    const pollData = {
      user: userId,
      treeId: userProfile.treeId,
      question: question.trim(),
      options: validOptions.map(opt => ({ text: opt.trim(), votes: [] })),
      duration,
      expiresAt,
      voters: [],
    };

    const poll = await Poll.create(pollData);
    await poll.populate("user", "firstname lastname avatar");

    // [NEW] Create Notification
    const user = await User.findById(userId);
    if (user) {
      await Notification.create({
        sender: userId,
        treeId: userProfile.treeId,
        recipient: null, // Broadcast to all tree members
        type: "poll",
        message: `${user.firstname} ${user.lastname} created a new poll: "${question}"`,
        referenceId: poll._id,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Poll created successfully",
      data: poll,
    });

  } catch (err) {
    console.error("createPoll Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Vote on Poll
export const votePoll = async (req, res) => {
  try {
    const pollId = req.params.id;
    const { optionIndex } = req.body;
    const userId = req?.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Validate poll ID
    if (!mongoose.Types.ObjectId.isValid(pollId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid poll ID",
      });
    }

    // Find poll
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({
        success: false,
        message: "Poll not found",
      });
    }

    // Check if poll is expired
    if (new Date() > poll.expiresAt) {
      return res.status(400).json({
        success: false,
        message: "Poll has expired",
      });
    }

    // Check if user belongs to same family tree
    const userProfile = await Profile.findOne({ user: userId });
    if (!userProfile || !userProfile.treeId || poll.treeId.toString() !== userProfile.treeId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only vote on polls from your family tree",
      });
    }

    // Check if user already voted
    if (poll.voters.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You have already voted on this poll",
      });
    }

    // Validate option index
    if (typeof optionIndex !== 'number' || optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid option index",
      });
    }

    // Add vote
    poll.options[optionIndex].votes.push(userId);
    poll.voters.push(userId);

    await poll.save();

    return res.json({
      success: true,
      message: "Vote recorded successfully",
      data: poll,
    });

  } catch (err) {
    console.error("votePoll Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};




export const getPollById = async (req, res) => {
  try {
    const pollId = req.params.id;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(pollId)) {
      return res.status(400).json({ success: false, message: "Invalid Poll ID" });
    }

    const pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(pollId) } },

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
          isPoll: true,
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
          hasVoted: { $in: [new mongoose.Types.ObjectId(userId), "$voters"] },

          author: {
            _id: "$authorData._id",
            firstname: "$authorData.firstname",
            lastname: "$authorData.lastname",
            avatar: "$authorData.avatar",
            profilePicture: "$authorProfile.profilePicture",
          },
        },
      },

      // Project
      {
        $project: {
          authorData: 0,
          authorProfile: 0,
        },
      },
    ];

    const poll = await Poll.aggregate(pipeline);

    if (!poll || poll.length === 0) {
      return res.status(404).json({ success: false, message: "Poll not found" });
    }

    return res.json({
      success: true,
      data: poll[0],
    });

  } catch (err) {
    console.error("Get Poll Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
