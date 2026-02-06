import mongoose from "mongoose";
import process from "node:process";

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    // console.log("Using cached database connection");
    return cached.conn;
  }

  if (!cached.promise) {
    const options = {
      bufferCommands: false, // Disable Mongoose buffering
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    console.log("Initiating new database connection...");
    cached.promise = mongoose.connect(process.env.MONGO_URI, options).then((mongoose) => {
      console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error("❌ Database connection failed:", e.message);
    throw e;
  }

  return cached.conn;
};

export default connectDB;

