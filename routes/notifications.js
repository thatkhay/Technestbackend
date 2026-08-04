const express = require("express");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const { sendSuccess, sendError } = require("../utils/response");
const router = express.Router();

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get notifications relevant to the logged-in user
 *     tags: [Notifications]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Notifications fetched
 */
router.get("/", protect, async (req, res, next) => {
  try {
    const orClauses = [
      { recipientType: "all_users" },
      { recipientType: "specific", recipient: req.user._id },
    ];
    if (req.user.userType === "vendor") {
      orClauses.push({ recipientType: "all_vendors" });
    }

    const notifications = await Notification.find({ $or: orClauses })
      .sort({ createdAt: -1 })
      .limit(50);

    sendSuccess(res, 200, "Notifications fetched", { notifications });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/notifications:
 *   patch:
 *     summary: Mark a notification (or all) as read
 *     tags: [Notifications]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id: { type: string, description: "notification _id, or the literal string 'all'" }
 *     responses:
 *       200:
 *         description: Marked read
 */
router.patch("/", protect, verifyCsrfToken, async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) return sendError(res, 400, "id is required");

    if (id === "all") {
      const orClauses = [
        { recipientType: "all_users" },
        { recipientType: "specific", recipient: req.user._id },
      ];
      if (req.user.userType === "vendor") {
        orClauses.push({ recipientType: "all_vendors" });
      }
      await Notification.updateMany({ $or: orClauses }, { read: true });
      return sendSuccess(res, 200, "All notifications marked read");
    }

    const notif = await Notification.findById(id);
    if (!notif) return sendError(res, 404, "Notification not found");

    notif.read = true;
    await notif.save();
    sendSuccess(res, 200, "Notification marked read", { id: notif._id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
