// Ratings: who can review whom (only the people in a completed deal), and
// the averages shown on offers, the vendor directory and used in matching.
const mongoose = require("mongoose");
const Review = require("../models/Review");
const DeviceRequest = require("../models/DeviceRequest");
const Transaction = require("../models/Transaction");
const OrderRequest = require("../models/OrderRequest");
const Order = require("../models/Order");
const Product = require("../models/Product");

const REVIEW_WINDOW_DAYS = 30;

/** Average rating and count per user, visible reviews only. */
const ratingsFor = async (userIds) => {
  const ids = [...new Set(userIds.filter(Boolean).map(String))].map((id) => new mongoose.Types.ObjectId(id));
  if (!ids.length) return new Map();
  const rows = await Review.aggregate([
    { $match: { subject: { $in: ids }, status: "visible" } },
    { $group: { _id: "$subject", average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { average: Math.round(r.average * 10) / 10, count: r.count }]));
};

const recent = () => new Date(Date.now() - REVIEW_WINDOW_DAYS * 864e5);

/**
 * Recomputes a product's stored rating from its visible reviews (called
 * whenever one is added, hidden or shown). One decimal place; null when none.
 */
const refreshProductRating = async (productId) => {
  const [row] = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), status: "visible" } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  await Product.updateOne(
    { _id: productId },
    { rating: row ? { average: Math.round(row.average * 10) / 10, count: row.count } : { average: null, count: 0 } }
  );
};

// Catalog purchases a buyer can rate, per product:
//   - Paystack orders (Order kind "cart") once paid and delivered; the
//     window runs from the last update (delivery)
//   - WhatsApp orders (OrderRequest kind "cart") once staff complete them
const catalogLines = (doc) =>
  doc.items.filter((i) => i.itemType === "phone" || i.itemType === "gadget" || i.itemType === "product");

/**
 * The catalog order + product behind a product review, if this user may
 * review it. @returns {{ product, label } | { status, error }}
 */
const resolveProductDeal = async (user, type, id, productSlug) => {
  if (!mongoose.isValidObjectId(id)) return { status: 404, error: "Order not found" };
  const slug = String(productSlug || "").toLowerCase();
  const me = String(user._id);
  let doc, completedAt;
  if (type === "order") {
    doc = await Order.findById(id);
    if (!doc || String(doc.buyer) !== me || doc.kind !== "cart") return { status: 404, error: "Order not found" };
    if (doc.status !== "paid" || doc.fulfillmentStatus !== "delivered")
      return { status: 409, error: "You can review once your order is delivered." };
    completedAt = doc.updatedAt;
  } else if (type === "order_request") {
    doc = await OrderRequest.findById(id);
    if (!doc || String(doc.buyer) !== me || doc.kind !== "cart") return { status: 404, error: "Order not found" };
    if (doc.status !== "completed") return { status: 409, error: "You can review once your order is completed." };
    completedAt = doc.completedAt;
  } else {
    return { status: 400, error: "For a product review, source.type must be order or order_request" };
  }
  if (!catalogLines(doc).some((i) => i.itemId === slug)) return { status: 404, error: "That product isn't in this order." };
  if (completedAt && completedAt < recent()) return { status: 409, error: `Reviews close ${REVIEW_WINDOW_DAYS} days after delivery.` };
  const product = await Product.findOne({ slug });
  if (!product) return { status: 404, error: "Product not found" };
  return { product, label: `${product.name} — bought from TechNest` };
};

/**
 * The deal behind a review, if this user may review it.
 * @returns {{ subject, label } | { status, error }}
 */
const resolveDeal = async (user, type, id) => {
  if (!mongoose.isValidObjectId(id)) return { status: 404, error: "Deal not found" };
  const me = String(user._id);
  let subject = null, label = null, completedAt = null;

  if (type === "device_request") {
    const r = await DeviceRequest.findById(id);
    if (!r || String(r.customer) !== me) return { status: 404, error: "Deal not found" };
    if (r.status !== "completed") return { status: 409, error: "You can review once the deal is completed." };
    [subject, label, completedAt] = [r.acceptedVendor, `${r.deviceName} — ${r.type} request`, r.completedAt];
  } else if (type === "transaction") {
    const txn = await Transaction.findById(id);
    if (!txn || ![String(txn.buyer), String(txn.seller)].includes(me)) return { status: 404, error: "Deal not found" };
    if (txn.status !== "completed") return { status: 409, error: "You can review once the deal is completed." };
    subject = String(txn.buyer) === me ? txn.seller : txn.buyer;
    [label, completedAt] = [`${txn.listingDeviceName} — ${txn.type}`, txn.updatedAt];
  } else if (type === "order_request") {
    const o = await OrderRequest.findById(id).populate("listing", "owner deviceName");
    if (!o || String(o.buyer) !== me || !o.listing) return { status: 404, error: "Deal not found" };
    if (o.status !== "completed") return { status: 409, error: "You can review once the deal is completed." };
    [subject, label, completedAt] = [o.listing.owner, `${o.listing.deviceName} — bought through TechNest`, o.completedAt];
  } else {
    return { status: 400, error: "source.type must be device_request, transaction or order_request" };
  }
  if (!subject) return { status: 409, error: "There's nobody to review on this deal." };
  if (completedAt && completedAt < recent()) return { status: 409, error: `Reviews close ${REVIEW_WINDOW_DAYS} days after the deal.` };
  return { subject, label };
};

/** Completed deals this user can still review. */
const reviewableDeals = async (user) => {
  const since = recent();
  const [requests, txns, orders, cartOrders, cartRequests, done] = await Promise.all([
    DeviceRequest.find({ customer: user._id, status: "completed", completedAt: { $gte: since } }).populate("acceptedVendor", "name vendorProfile.businessName"),
    Transaction.find({ $or: [{ buyer: user._id }, { seller: user._id }], status: "completed", updatedAt: { $gte: since } }),
    OrderRequest.find({ buyer: user._id, status: "completed", kind: "listing", completedAt: { $gte: since } }).populate({ path: "listing", select: "deviceName owner", populate: { path: "owner", select: "name" } }),
    Order.find({ buyer: user._id, kind: "cart", status: "paid", fulfillmentStatus: "delivered", updatedAt: { $gte: since } }),
    OrderRequest.find({ buyer: user._id, status: "completed", kind: "cart", completedAt: { $gte: since } }),
    Review.find({ author: user._id }).select("source product"),
  ]);
  const reviewed = new Set(done.map((r) => `${r.source.type}:${r.source.id}${r.product ? `:${r.product}` : ""}`));
  // Product deals: one per product per order
  const slugs = [...new Set([...cartOrders, ...cartRequests].flatMap((o) => catalogLines(o).map((i) => i.itemId)))];
  const products = new Map((slugs.length ? await Product.find({ slug: { $in: slugs } }).select("slug name image") : []).map((p) => [p.slug, p]));
  const productDeals = [
    ...cartOrders.map((o) => ["order", o, o.updatedAt]),
    ...cartRequests.map((o) => ["order_request", o, o.completedAt]),
  ].flatMap(([type, o, completedAt]) =>
    [...new Set(catalogLines(o).map((i) => i.itemId))]
      .map((slug) => products.get(slug))
      .filter((p) => p && !reviewed.has(`${type}:${o._id}:${p._id}`))
      .map((p) => ({
        type,
        id: String(o._id),
        product: { id: p.slug, name: p.name, image: p.image || undefined },
        label: `${p.name} — bought from TechNest`,
        completedAt,
      }))
  );
  const me = String(user._id);
  return [
    ...requests.map((r) => ({ type: "device_request", id: String(r._id), subject: r.acceptedVendor && { id: String(r.acceptedVendor._id), name: r.acceptedVendor.vendorProfile?.businessName || r.acceptedVendor.name }, label: `${r.deviceName} — ${r.type} request`, completedAt: r.completedAt })),
    ...txns.map((t) => {
      const iAmBuyer = String(t.buyer) === me;
      return { type: "transaction", id: String(t._id), subject: { id: String(iAmBuyer ? t.seller : t.buyer), name: iAmBuyer ? t.sellerName : t.buyerName }, label: `${t.listingDeviceName} — ${t.type}`, completedAt: t.updatedAt };
    }),
    ...orders.map((o) => ({ type: "order_request", id: String(o._id), subject: o.listing?.owner && { id: String(o.listing.owner._id), name: o.listing.owner.name }, label: `${o.listing?.deviceName} — bought through TechNest`, completedAt: o.completedAt })),
  ]
    .filter((d) => d.subject && !reviewed.has(`${d.type}:${d.id}`))
    .concat(productDeals);
};

module.exports = { REVIEW_WINDOW_DAYS, ratingsFor, resolveDeal, resolveProductDeal, reviewableDeals, refreshProductRating };
