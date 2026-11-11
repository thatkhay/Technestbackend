const mongoose = require("mongoose");

// A rating left after a completed deal (see routes/reviews.js). Only the
// people in the deal can review, once each, so ratings reflect real trades.
//
// Two kinds:
//   - about a person (subject): device requests, swaps/sales, marketplace
//     listings bought through TechNest
//   - about a catalog product (product): each product in a completed
//     catalog order (paid online and delivered, or a completed WhatsApp
//     order) — once per product per order
const ReviewSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true }, // first name only is shown
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      required: function () {
        return !this.product;
      },
    },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },

    source: {
      type: { type: String, enum: ["device_request", "transaction", "order_request", "order"], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
      label: { type: String, default: null }, // e.g. "iPhone 13 Pro — buy request"
    },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500, default: null },
    reply: { type: String, trim: true, maxlength: 500, default: null },
    repliedAt: { type: Date, default: null },

    // Hidden reviews (abuse, spam) don't count towards the average
    status: { type: String, enum: ["visible", "hidden"], default: "visible" },
    hiddenReason: { type: String, trim: true, maxlength: 200, default: null },
  },
  { timestamps: true }
);

// One review per person per deal (per product, for catalog orders). This
// replaced an index without `product`; config/db.js syncs Review's indexes
// at startup so the old one is dropped.
ReviewSchema.index({ author: 1, "source.type": 1, "source.id": 1, product: 1 }, { unique: true });
ReviewSchema.index({ subject: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ product: 1, status: 1, createdAt: -1 }, { partialFilterExpression: { product: { $type: "objectId" } } });

module.exports = mongoose.model("Review", ReviewSchema);
