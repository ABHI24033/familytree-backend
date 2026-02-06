import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = (req, res, next) => {
  try {
    // Try to get token from Authorization header first, then from cookies
    let token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      token = req.cookies?.accessToken;
    }

    if (!token)
      return res.status(401).json({ message: "Not authorized, token missing" });

    const blacklist = req.app.locals.blacklist || new Set();
    if (blacklist.has(token))
      return res.status(401).json({ message: "Token invalidated, please login again" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const superAdminOnly = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const user = await User.findById(userId);

    if (user && user.isSuperAdmin) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super Admin privileges required."
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error checking permissions"
    });
  }
};
