const express = require("express");
const cloudinary = require("../config/cloudinary");
const { protect } = require("../middleware/auth");
const { sendSuccess } = require("../utils/response");
const router = express.Router();

/**
 * @swagger
 * /api/uploads/signature:
 *   post:
 *     summary: Get a signed Cloudinary upload signature for direct browser upload
 *     tags: [Uploads]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Signature issued
 */
router.post("/signature", protect, (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = "technest/listings";

  // Only these params are signed — anything else the browser sends to
  // Cloudinary that isn't part of this signed set gets rejected by
  // Cloudinary itself, so this can't be tampered with to upload
  // somewhere else or bypass the folder scoping.
  const paramsToSign = { timestamp, folder };
  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  sendSuccess(res, 200, "Signature generated", {
    signature,
    timestamp,
    folder,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  });
});

module.exports = router;
