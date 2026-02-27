import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from './routes/authRoutes.js'
import profileRoutes from './routes/profileRoutes.js'
import familyTreeRoutes from './routes/familyTreeRoutes.js'
import postsRoute from "./routes/postRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import noticeRoutes from "./routes/noticeRoutes.js";
import eventRoutes from "./routes/eventRoute.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import externalContactRoutes from "./routes/externalContactRoute.js";
import guestListRoutes from "./routes/guestListRoutes.js";
import knowledgeBankRoutes from "./routes/knowledgeBankRoutes.js";
import ritualCategoryRoutes from "./routes/ritualCategoryRoutes.js";
import personalDataRoutes from "./routes/personalDataRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import contactGroupRoutes from "./routes/contactGroupRoutes.js";
import systemSettingRoutes from "./routes/systemSettingRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import { initScheduler } from "./controllers/scheduler.js";
import { initializeSettings } from "./controllers/systemSettingController.js";

dotenv.config();

const app = express();
// connectDB(); // Removed top-level await for Vercel

// Middleware to ensure DB connection
app.use(async (req, res, next) => {
  // Skip DB connection for simple health check if you want, or just await it always
  if (req.path === '/') {
    return next();
  }

  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Middleware DB Connection Error:", error);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message
    });
  }
});

// Middleware
// CORS configuration - handle both development and production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) return callback(null, true);

    // Get allowed origins from environment variable
    const allowedOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
      : ["http://localhost:5173"];

    // Explicitly add Hostinger domain
    if (!allowedOrigins.includes("https://apps.sanyojan.in")) {
      allowedOrigins.push("https://apps.sanyojan.in");
    }

    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (origin.includes('vercel.app') && origin.startsWith('https://')) {
      // Allow any Vercel domain if FRONTEND_URL is set to a Vercel URL
      // This handles preview deployments automatically
      if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.includes('vercel.app')) {
        callback(null, true);
      } else {
        console.log('CORS: Vercel origin blocked - FRONTEND_URL not set to Vercel domain');
        callback(new Error('Not allowed by CORS'));
      }
    } else if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
      // In development, allow localhost origins
      callback(null, true);
    } else {
      // Log for debugging
      console.log('CORS blocked origin:', origin);
      console.log('Allowed origins:', allowedOrigins);
      console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For form-data support
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send('Welcome to family-tree API');
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/family-tree", familyTreeRoutes);
app.use("/api/posts", postsRoute);
app.use("/api/upload", uploadRoutes);
app.use("/api/notice", noticeRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/external-contacts", externalContactRoutes);
app.use("/api/guest-lists", guestListRoutes);
app.use("/api/knowledge-bank", knowledgeBankRoutes);
app.use("/api/ritual-categories", ritualCategoryRoutes);
app.use("/api/personal-data", personalDataRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/contact-groups", contactGroupRoutes);
app.use("/api/settings", systemSettingRoutes);
app.use("/api/reports", reportRoutes);

// Error Handler
app.use(errorHandler);

// Export app for Vercel serverless functions
export default app;

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    // Start cron only after server is alive
    try {
      initScheduler();
      console.log("⏰ Scheduler initialized");
    } catch (err) {
      console.error("Scheduler failed to start:", err);
    }
  });
}