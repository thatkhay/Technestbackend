require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const connectDB = require("../config/db");

const run = async () => {
  await connectDB();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Super Admin";

  if (!email || !password) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running this script"
    );
    process.exit(1);
  }

  const exists = await User.findOne({ email });
  if (exists) {
    console.log("Admin already exists:", email);
    process.exit(0);
  }

  const admin = await User.create({
    name,
    email,
    password,
    userType: "admin",
  });

  console.log("Super admin created:", admin.email);
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
