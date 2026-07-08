const express = require("express");
const Listing = require("../models/Listing");
const { protect } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { deviceCategory, listingType, status } = req.query;

    const filter = { status: status || "active" };
    if (deviceCategory) filter.deviceCategory = deviceCategory;
    if (listingType) filter.listingType = listingType;

    const listings = await Listing.find(filter)
      .populate("owner", "name email vendorProfile")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { listings } });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id).populate(
      "owner",
      "name email vendorProfile"
    );
    if (!listing)
      return res
        .status(404)
        .json({ success: false, error: "Listing not found" });
    res.json({ success: true, data: { listing } });
  } catch (err) {
    next(err);
  }
});

router.post("/", protect, verifyCsrfToken, async (req, res, next) => {
  try {
    const {
      userName,
      userPhone,
      deviceName,
      deviceCategory,
      subType,
      storage,
      batteryHealth,
      simType,
      faceIdStatus,
      repairs,
      mediaCount,
      imeiVerified,
      estimatedMin,
      estimatedMax,
      listingType,
      wantedDevice,
    } = req.body;

    if (
      !userName ||
      !userPhone ||
      !deviceName ||
      !deviceCategory ||
      !subType ||
      estimatedMin === undefined ||
      estimatedMax === undefined
    )
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields" });

    const listing = await Listing.create({
      userName,
      userPhone,
      deviceName,
      deviceCategory,
      subType,
      storage,
      batteryHealth,
      simType,
      faceIdStatus,
      repairs: repairs || [],
      mediaCount: mediaCount || 0,
      imeiVerified: !!imeiVerified,
      estimatedMin,
      estimatedMax,
      listingType: listingType || "sell",
      wantedDevice: listingType === "swap" ? wantedDevice : null,
      owner: req.user._id,
    });

    res.status(201).json({ success: true, data: { listing } });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", protect, verifyCsrfToken, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing)
      return res
        .status(404)
        .json({ success: false, error: "Listing not found" });

    if (!listing.owner || listing.owner.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ success: false, error: "Not your listing" });

    const updatable = [
      "userName",
      "userPhone",
      "deviceName",
      "deviceCategory",
      "subType",
      "storage",
      "batteryHealth",
      "simType",
      "faceIdStatus",
      "repairs",
      "mediaCount",
      "imeiVerified",
      "estimatedMin",
      "estimatedMax",
      "listingType",
      "wantedDevice",
      "status",
    ];

    for (const field of updatable) {
      if (req.body[field] !== undefined) listing[field] = req.body[field];
    }

    await listing.save();
    res.json({ success: true, data: { listing } });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", protect, verifyCsrfToken, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing)
      return res
        .status(404)
        .json({ success: false, error: "Listing not found" });

    if (!listing.owner || listing.owner.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ success: false, error: "Not your listing" });

    await listing.deleteOne();
    res.json({ success: true, data: { message: "Listing deleted" } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
