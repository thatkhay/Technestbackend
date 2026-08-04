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
      images,
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

    // images should just be Cloudinary secure_urls — cap defensively even
    // though the frontend already limits to 10, since this is untrusted input
    const safeImages = Array.isArray(images)
      ? images.filter((u) => typeof u === "string").slice(0, 10)
      : [];

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
      images: safeImages,
      imeiVerified: !!imeiVerified,
      estimatedMin,
      estimatedMax,
      listingType: listingType || "sell",
      wantedDevice: listingType === "swap" ? wantedDevice : null,
      owner: req.user._id,
      // status defaults to "pending_review" from the schema — new
      // listings are invisible on the public marketplace until an admin
      // approves them
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

    const contentFields = [
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
      "images",
      "imeiVerified",
      "estimatedMin",
      "estimatedMax",
      "listingType",
      "wantedDevice",
    ];

    for (const field of contentFields) {
      if (req.body[field] !== undefined) listing[field] = req.body[field];
    }

    // Editing listing content sends it back through moderation rather than
    // letting an owner slip changes past review on an already-approved
    // listing.
    if (contentFields.some((f) => req.body[f] !== undefined)) {
      listing.status = "pending_review";
      listing.rejectionReason = null;
    }

    // Status transitions like marking sold/swapped/removed stay entirely
    // owner-controlled and don't need re-review — only admin-gated
    // transitions (pending_review/rejected → active) require the separate
    // admin approve/reject routes.
    const ownerSettableStatuses = ["active", "sold", "swapped", "removed"];
    if (
      req.body.status !== undefined &&
      ownerSettableStatuses.includes(req.body.status) &&
      listing.status !== "pending_review"
    ) {
      listing.status = req.body.status;
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
