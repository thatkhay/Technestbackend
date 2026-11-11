// Counted stock (Product.stockQuantity): checks before an order and takes
// units off when a sale completes. Products without a count are untouched.
// Also keeps the flash-sale unit cap (sale.stockLimit / sale.sold).
const Product = require("../models/Product");

/**
 * @param {string} [condition] "uk-used" | "brand-new" — when given, a capped
 *   flash sale is checked too (only if this line gets the sale price)
 * @returns {string|null} why this quantity can't be ordered
 */
const stockProblem = (product, quantity, condition) => {
  if (product.stockQuantity != null && quantity > product.stockQuantity)
    return product.stockQuantity === 0
      ? `${product.name} is out of stock.`
      : `Only ${product.stockQuantity} ${product.name} left.`;
  if (condition && product.saleActive()) {
    const salePrice = condition === "brand-new" ? product.sale.priceBrandNew : product.sale.priceUkUsed;
    const left = product.saleUnitsLeft();
    if (salePrice && left !== null && quantity > left)
      return `Only ${left} ${product.name} left at the ${product.sale.label || "sale"} price.`;
  }
  return null;
};

/** Takes sold units off counted products; marks them out of stock at 0. */
const takeFromStock = async (lines) => {
  for (const { itemId, quantity } of lines) {
    const p = await Product.findOneAndUpdate(
      { slug: itemId, stockQuantity: { $ne: null } },
      [{ $set: { stockQuantity: { $max: [0, { $subtract: ["$stockQuantity", quantity] }] } } }],
      { returnDocument: "after", updatePipeline: true }
    );
    if (p && p.stockQuantity === 0 && p.inStock) await Product.updateOne({ _id: p._id }, { inStock: false });
  }
};

/**
 * Counts units sold at the flash-sale price towards sale.sold. A line counts
 * when the order was placed during the sale window and charged the sale
 * price, so an order completed after the sale ended still counts.
 * @param {{ itemId, quantity, unitPrice }[]} lines
 * @param {Date} placedAt when the order was placed
 */
const recordSaleUnits = async (lines, placedAt) => {
  for (const { itemId, quantity, unitPrice } of lines) {
    await Product.updateOne(
      {
        slug: itemId,
        "sale.startsAt": { $lte: placedAt },
        "sale.endsAt": { $gt: placedAt },
        $or: [{ "sale.priceUkUsed": unitPrice }, { "sale.priceBrandNew": unitPrice }],
      },
      { $inc: { "sale.sold": quantity } }
    );
  }
};

module.exports = { stockProblem, takeFromStock, recordSaleUnits };
