const express = require("express");
const { Gadget } = require("../models/Gadget");
const { protect } = require("../middleware/auth");
const { sendSuccess, sendError } = require("../utils/response");
const router = express.Router();

/**
 * @swagger
 * /api/recommendations:
 *   get:
 *     summary: Get cheaper or similarly-priced alternatives for a gadget
 *     tags: [Recommendations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: gadgetId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Recommendations fetched
 *       400:
 *         description: gadgetId is required
 *       404:
 *         description: Gadget not found
 */
router.get("/", protect, async (req, res, next) => {
  try {
    const { gadgetId } = req.query;
    if (!gadgetId) return sendError(res, 400, "gadgetId is required");

    const source = await Gadget.findById(gadgetId);
    if (!source) return sendError(res, 404, "Gadget not found");

    const alternatives = await Gadget.find({
      category: source.category,
      _id: { $ne: source._id },
      currentPrice: { $lte: source.currentPrice * 1.15 },
    })
      .sort({ currentPrice: 1 })
      .limit(5);

    sendSuccess(res, 200, "Recommendations fetched", {
      source: {
        id: source._id,
        name: source.name,
        brand: source.brand,
        currentPrice: source.currentPrice,
        category: source.category,
      },
      alternatives,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
