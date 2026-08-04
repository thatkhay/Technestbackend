const express = require("express");
const User = require("../models/User");
const Listing = require("../models/Listing");
const Notification = require("../models/Notification");
const { protect, restrictTo } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const { sendSuccess, sendError } = require("../utils/response");
const router = express.Router();

// Every route below requires a logged-in admin
router.use(protect, restrictTo("admin"));

/**
 * @swagger
 * /api/admin/vendors/pending:
 *   get:
 *     summary: List vendors who submitted a profile but aren't verified yet
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Pending vendors fetched
 *       403:
 *         description: Not permitted for this account type
 */
router.get("/vendors/pending", async (req, res, next) => {
  try {
    const pending = await User.find({
      userType: "vendor",
      vendorVerified: false,
      "vendorProfile.phone": { $exists: true, $ne: null },
    }).select("name email vendorProfile createdAt");

    sendSuccess(res, 200, "Pending vendors fetched", { vendors: pending });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/vendors:
 *   get:
 *     summary: List all vendor accounts (any status)
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Vendors fetched
 */
router.get("/vendors", async (req, res, next) => {
  try {
    const vendors = await User.find({ userType: "vendor" }).select(
      "name email vendorProfile vendorVerified createdAt"
    );
    sendSuccess(res, 200, "Vendors fetched", { vendors });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/vendors/{id}/approve:
 *   patch:
 *     summary: Approve a pending vendor
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vendor approved
 *       404:
 *         description: Vendor not found
 */
router.patch(
  "/vendors/:id/approve",
  verifyCsrfToken,
  async (req, res, next) => {
    try {
      const vendor = await User.findById(req.params.id);
      if (!vendor || vendor.userType !== "vendor")
        return sendError(res, 404, "Vendor not found");

      vendor.vendorVerified = true;
      await vendor.save();

      sendSuccess(res, 200, "Vendor approved", {
        id: vendor._id,
        name: vendor.name,
        email: vendor.email,
        vendorVerified: vendor.vendorVerified,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/admin/vendors/{id}/reject:
 *   patch:
 *     summary: Reject a pending vendor and clear their profile
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vendor rejected
 *       404:
 *         description: Vendor not found
 */
router.patch("/vendors/:id/reject", verifyCsrfToken, async (req, res, next) => {
  try {
    const vendor = await User.findById(req.params.id);
    if (!vendor || vendor.userType !== "vendor")
      return sendError(res, 404, "Vendor not found");

    vendor.vendorVerified = false;
    vendor.vendorProfile = undefined; // clear so they must resubmit
    await vendor.save();

    sendSuccess(res, 200, "Vendor rejected", {
      id: vendor._id,
      vendorVerified: vendor.vendorVerified,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/listings:
 *   get:
 *     summary: List all marketplace listings (any moderation status)
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Listings fetched
 */
router.get("/listings", async (req, res, next) => {
  try {
    const listings = await Listing.find({})
      .populate("owner", "name email")
      .sort({ createdAt: -1 });
    sendSuccess(res, 200, "Listings fetched", { listings });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/listings/pending:
 *   get:
 *     summary: List listings awaiting moderation
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Pending listings fetched
 */
router.get("/listings/pending", async (req, res, next) => {
  try {
    const pending = await Listing.find({ status: "pending_review" })
      .populate("owner", "name email")
      .sort({ createdAt: -1 });
    sendSuccess(res, 200, "Pending listings fetched", { listings: pending });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/listings/{id}/approve:
 *   patch:
 *     summary: Approve a listing, making it visible on the public marketplace
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Listing approved
 *       404:
 *         description: Listing not found
 */
router.patch(
  "/listings/:id/approve",
  verifyCsrfToken,
  async (req, res, next) => {
    try {
      const listing = await Listing.findById(req.params.id);
      if (!listing) return sendError(res, 404, "Listing not found");

      listing.status = "active";
      listing.rejectionReason = null;
      await listing.save();

      await Notification.create({
        recipientType: "all_vendors",
        type:
          listing.listingType === "swap"
            ? "new_swap_request"
            : "new_cash_listing",
        title:
          listing.listingType === "swap"
            ? "New swap request"
            : "New cash listing",
        message: `${listing.deviceName} was just listed${
          listing.listingType === "swap" ? " for swap" : " for sale"
        }`,
        listing: listing._id,
      });

      sendSuccess(res, 200, "Listing approved", {
        id: listing._id,
        status: listing.status,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/admin/listings/{id}/reject:
 *   patch:
 *     summary: Reject a listing with an optional reason
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Listing rejected
 *       404:
 *         description: Listing not found
 */
router.patch(
  "/listings/:id/reject",
  verifyCsrfToken,
  async (req, res, next) => {
    try {
      const listing = await Listing.findById(req.params.id);
      if (!listing) return sendError(res, 404, "Listing not found");

      listing.status = "rejected";
      listing.rejectionReason = req.body?.reason || null;
      await listing.save();

      sendSuccess(res, 200, "Listing rejected", {
        id: listing._id,
        status: listing.status,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
