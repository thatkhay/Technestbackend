const express = require("express");
const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");
const { protect, restrictTo, requireVerified } = require("../middleware/auth");
const { verifyCsrfToken } = require("../middleware/csrf");
const { sendSuccess, sendError } = require("../utils/response");
const { notify } = require("../utils/notify");
const {
  ratingsFor,
  resolveDeal,
  resolveProductDeal,
  reviewableDeals,
  refreshProductRating,
  REVIEW_WINDOW_DAYS,
} = require("../utils/reviews");
const router = express.Router();

const publicReview = (r) => ({
  id: String(r._id),
  rating: r.rating,
  comment: r.comment || undefined,
  authorName: r.authorName,
  deal: r.source.label || undefined,
  reply: r.reply || undefined,
  repliedAt: r.repliedAt || undefined,
  createdAt: r.createdAt,
});

/**
 * @swagger
 * /api/reviews/pending:
 *   get:
 *     summary: Completed deals you can still review (within 30 days)
 *     tags: [Reviews]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: >
 *           data.deals: [{ type, id, subject?: { id, name }, product?: { id, name, image }, label, completedAt }].
 *           A deal has either `subject` (rate the person) or `product` (rate a catalog product you bought);
 *           send type + id as source, plus source.productId = product.id for a product.
 */
router.get("/pending", protect, async (req, res, next) => {
  try {
    sendSuccess(res, 200, "Deals to review", { deals: await reviewableDeals(req.user), windowDays: REVIEW_WINDOW_DAYS });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Rate the other person on a completed deal, or a catalog product you bought (once each)
 *     description: >
 *       Product ratings come from buyers of completed catalog orders: Paystack
 *       orders (source.type "order") once paid and delivered, WhatsApp orders
 *       (source.type "order_request") once completed. One rating per product
 *       per order, within 30 days. They feed `rating` on GET /api/products.
 *     tags: [Reviews]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source, rating]
 *             properties:
 *               source:
 *                 type: object
 *                 properties:
 *                   type: { type: string, enum: [device_request, transaction, order_request, order] }
 *                   id: { type: string }
 *                   productId: { type: string, description: "Product slug — rates that catalog product instead of a person" }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string, maxLength: 500 }
 *     responses:
 *       201:
 *         description: data.review
 *       404:
 *         description: Not your deal
 *       409:
 *         description: Not completed, already reviewed, or past the 30-day window
 */
router.post("/", protect, requireVerified, verifyCsrfToken, async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return sendError(res, 400, "Give a rating from 1 to 5 stars.");
    const { type, id } = req.body.source || {};
    const productId = req.body.source?.productId ?? req.body.productId;
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim().slice(0, 500) || null : null;
    const base = { author: req.user._id, authorName: req.user.name.split(" ")[0], rating, comment };

    if (productId) {
      const deal = await resolveProductDeal(req.user, type, id, productId);
      if (deal.error) return sendError(res, deal.status, deal.error);
      let review;
      try {
        review = await Review.create({ ...base, product: deal.product._id, source: { type, id, label: deal.label } });
      } catch (err) {
        if (err.code === 11000) return sendError(res, 409, "You've already reviewed this product for this order.");
        throw err;
      }
      await refreshProductRating(deal.product._id);
      return sendSuccess(res, 201, "Thanks for your review", { review: publicReview(review) });
    }

    const deal = await resolveDeal(req.user, type, id);
    if (deal.error) return sendError(res, deal.status, deal.error);
    if (String(deal.subject) === String(req.user._id)) return sendError(res, 400, "You can't review yourself.");

    let review;
    try {
      review = await Review.create({ ...base, subject: deal.subject, source: { type, id, label: deal.label } });
    } catch (err) {
      if (err.code === 11000) return sendError(res, 409, "You've already reviewed this deal.");
      throw err;
    }
    await notify({
      recipient: deal.subject,
      type: "review_received",
      title: `New ${rating}★ review`,
      message: `${review.authorName} rated your ${deal.label} ${rating} out of 5${review.comment ? `: "${review.comment.slice(0, 200)}"` : "."}`,
    });
    sendSuccess(res, 201, "Thanks for your review", { review: publicReview(review) });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/reviews/users/{userId}:
 *   get:
 *     summary: A user's (usually a vendor's) rating and reviews — public
 *     tags: [Reviews]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: "data: { average, count, stars: { 5: n, 4: n, ... }, reviews, page, pages }"
 */
router.get("/users/:userId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return sendError(res, 404, "User not found");
    const subject = new mongoose.Types.ObjectId(req.params.userId);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const [summary, stars, reviews, total] = await Promise.all([
      ratingsFor([subject]),
      Review.aggregate([{ $match: { subject, status: "visible" } }, { $group: { _id: "$rating", n: { $sum: 1 } } }]),
      Review.find({ subject, status: "visible" }).sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20),
      Review.countDocuments({ subject, status: "visible" }),
    ]);
    const s = summary.get(String(subject)) || { average: null, count: 0 };
    sendSuccess(res, 200, "Reviews fetched", {
      ...s,
      stars: Object.fromEntries([5, 4, 3, 2, 1].map((n) => [n, stars.find((x) => x._id === n)?.n || 0])),
      reviews: reviews.map(publicReview),
      page,
      pages: Math.ceil(total / 20),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/reviews/products/{id}:
 *   get:
 *     summary: A catalog product's rating and reviews — public
 *     tags: [Reviews]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Product slug (or _id)
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: "data: { average, count, stars: { 5: n, 4: n, ... }, reviews, page, pages } — average is null with no reviews"
 */
router.get("/products/:id", async (req, res, next) => {
  try {
    const key = String(req.params.id);
    const product = await Product.findOne(
      mongoose.isValidObjectId(key) ? { $or: [{ slug: key.toLowerCase() }, { _id: key }] } : { slug: key.toLowerCase() }
    ).select("_id rating isActive");
    if (!product || !product.isActive) return sendError(res, 404, "Product not found");
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const match = { product: product._id, status: "visible" };
    const [stars, reviews, total] = await Promise.all([
      Review.aggregate([{ $match: match }, { $group: { _id: "$rating", n: { $sum: 1 } } }]),
      Review.find(match).sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20),
      Review.countDocuments(match),
    ]);
    sendSuccess(res, 200, "Reviews fetched", {
      average: product.rating?.count ? product.rating.average : null,
      count: product.rating?.count || 0,
      stars: Object.fromEntries([5, 4, 3, 2, 1].map((n) => [n, stars.find((x) => x._id === n)?.n || 0])),
      reviews: reviews.map(publicReview),
      page,
      pages: Math.ceil(total / 20),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/reviews/{id}/reply:
 *   post:
 *     summary: Reply to a review about you (once)
 *     tags: [Reviews]
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
 *             required: [reply]
 *             properties:
 *               reply: { type: string, maxLength: 500 }
 *     responses:
 *       200:
 *         description: data.review
 *       409:
 *         description: Already replied
 */
router.post("/:id/reply", protect, verifyCsrfToken, async (req, res, next) => {
  try {
    const reply = typeof req.body.reply === "string" ? req.body.reply.trim().slice(0, 500) : "";
    if (!reply) return sendError(res, 400, "Write a reply.");
    if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 404, "Review not found");
    const review = await Review.findOne({ _id: req.params.id, subject: req.user._id });
    if (!review) return sendError(res, 404, "Review not found");
    if (review.reply) return sendError(res, 409, "You've already replied to this review.");
    review.reply = reply;
    review.repliedAt = new Date();
    await review.save();
    sendSuccess(res, 200, "Reply posted", { review: publicReview(review) });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/reviews/admin:
 *   get:
 *     summary: Admin — recent reviews, lowest ratings first when filtering
 *     tags: [Reviews]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [visible, hidden] }
 *       - in: query
 *         name: maxRating
 *         schema: { type: integer, description: "e.g. 2 to see complaints" }
 *     responses:
 *       200:
 *         description: data.reviews (with author/subject names and emails)
 * /api/reviews/admin/{id}:
 *   patch:
 *     summary: Admin — hide or show a review
 *     tags: [Reviews]
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [visible, hidden] }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: data.review
 */
router.get("/admin", protect, restrictTo("admin"), async (req, res, next) => {
  try {
    const filter = {};
    if (["visible", "hidden"].includes(req.query.status)) filter.status = req.query.status;
    const max = parseInt(req.query.maxRating);
    if (max >= 1 && max <= 5) filter.rating = { $lte: max };
    const reviews = await Review.find(filter)
      .populate("author", "name email")
      .populate("subject", "name email vendorProfile.businessName")
      .populate("product", "slug name")
      .sort(filter.rating ? { rating: 1, createdAt: -1 } : { createdAt: -1 })
      .limit(200);
    sendSuccess(res, 200, "Reviews fetched", { reviews });
  } catch (err) {
    next(err);
  }
});

router.patch("/admin/:id", protect, restrictTo("admin"), verifyCsrfToken, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["visible", "hidden"].includes(status)) return sendError(res, 400, "status must be visible or hidden");
    if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 404, "Review not found");
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status, hiddenReason: status === "hidden" ? String(req.body.reason || "").slice(0, 200) || null : null },
      { returnDocument: "after" }
    );
    if (!review) return sendError(res, 404, "Review not found");
    if (review.product) await refreshProductRating(review.product);
    sendSuccess(res, 200, "Review updated", { review });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
