const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
    // Review's unique index gained `product` (one review per product per
    // order); syncIndexes drops the old version so a second product in the
    // same order can be reviewed. Small collection, quick and idempotent.
    require("../models/Review")
      .syncIndexes()
      .catch((err) => console.error("Review index sync failed:", err.message));
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
