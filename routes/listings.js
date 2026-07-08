const express = require("express");
const Listing = require("../models/Listing");
const { protect } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const { sendSuccess, sendError } = require("../utils/response");
const router = express.Router();

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: List active listings
 *     tags: [Listings]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: deviceCategory
 *         schema: { type: string }
 *       - in: query
 *         name: listingType
 *         schema: { type: string, enum: [sell, swap] }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Listings fetched
 */
router.get("/", protect, async (req, res, next) => {
  try {
    const { deviceCategory, listingType, status } = req.query;

    const filter = { status: status || "active" };
    if (deviceCategory) filter.deviceCategory = deviceCategory;
    if (listingType) filter.listingType = listingType;

    const listings = await Listing.find(filter)
      .populate("owner", "name email vendorProfile")
      .sort({ createdAt: -1 });

    sendSuccess(res, 200, "Listings fetched", { listings });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/listings/{id}:
 *   get:
 *     summary: Get a single listing by ID
 *     tags: [Listings]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Listing fetched
 *       404:
 *         description: Listing not found
 */
router.get("/:id", protect, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id).populate(
      "owner",
      "name email vendorProfile"
    );
    if (!listing) return sendError(res, 404, "Listing not found");
    sendSuccess(res, 200, "Listing fetched", { listing });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/listings:
 *   post:
 *     summary: Create a new listing
 *     tags: [Listings]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userName, userPhone, deviceName, deviceCategory, subType, estimatedMin, estimatedMax]
 *             properties:
 *               userName: { type: string }
 *               userPhone: { type: string }
 *               deviceName: { type: string }
 *               deviceCategory: { type: string }
 *               subType: { type: string }
 *               storage: { type: string }
 *               batteryHealth: { type: string }
 *               simType: { type: string }
 *               faceIdStatus: { type: string }
 *               repairs: { type: array, items: { type: string } }
 *               mediaCount: { type: number }
 *               imeiVerified: { type: boolean }
 *               estimatedMin: { type: number }
 *               estimatedMax: { type: number }
 *               listingType: { type: string, enum: [sell, swap] }
 *               wantedDevice: { type: string }
 *     responses:
 *       201:
 *         description: Listing created
 *       400:
 *         description: Missing required fields
 */
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
      return sendError(res, 400, "Missing required fields");

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

    sendSuccess(res, 201, "Listing created", { listing });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/listings/{id}:
 *   patch:
 *     summary: Update a listing you own
 *     tags: [Listings]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Listing updated
 *       403:
 *         description: Not your listing
 *       404:
 *         description: Listing not found
 */
router.patch("/:id", protect, verifyCsrfToken, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return sendError(res, 404, "Listing not found");

    if (!listing.owner || listing.owner.toString() !== req.user._id.toString())
      return sendError(res, 403, "Not your listing");

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
    sendSuccess(res, 200, "Listing updated", { listing });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/listings/{id}:
 *   delete:
 *     summary: Delete a listing you own
 *     tags: [Listings]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Listing deleted
 *       403:
 *         description: Not your listing
 *       404:
 *         description: Listing not found
 */
router.delete("/:id", protect, verifyCsrfToken, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return sendError(res, 404, "Listing not found");

    if (!listing.owner || listing.owner.toString() !== req.user._id.toString())
      return sendError(res, 403, "Not your listing");

    await listing.deleteOne();
    sendSuccess(res, 200, "Listing deleted");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
