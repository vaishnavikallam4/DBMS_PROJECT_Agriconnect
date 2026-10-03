const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

/* ---------- Farm Analytics (farmer) ---------- */
router.get("/farm", authRequired, requireRole("farmer"), (req, res) => {
  const expenseByCategory = db.prepare(`
    SELECT category, SUM(amount) AS total FROM expenses WHERE farmer_id = ? GROUP BY category ORDER BY total DESC
  `).all(req.user.id);

  const expenseByMonth = db.prepare(`
    SELECT strftime('%Y-%m', expense_date) AS month, SUM(amount) AS total
    FROM expenses WHERE farmer_id = ? GROUP BY month ORDER BY month ASC LIMIT 12
  `).all(req.user.id);

  const revenueByMonth = db.prepare(`
    SELECT strftime('%Y-%m', o.created_at) AS month, SUM(o.total_price) AS total
    FROM orders o JOIN products p ON p.id = o.product_id
    WHERE p.farmer_id = ? GROUP BY month ORDER BY month ASC LIMIT 12
  `).all(req.user.id);

  const revenueByCrop = db.prepare(`
    SELECT p.crop_name, SUM(o.total_price) AS total, SUM(o.quantity) AS quantity_sold
    FROM orders o JOIN products p ON p.id = o.product_id
    WHERE p.farmer_id = ? GROUP BY p.crop_name ORDER BY total DESC
  `).all(req.user.id);

  const totals = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE farmer_id = ?) AS total_expenses,
      (SELECT COALESCE(SUM(o.total_price),0) FROM orders o JOIN products p ON p.id = o.product_id WHERE p.farmer_id = ?) AS total_revenue
  `).get(req.user.id, req.user.id);

  res.json({
    totals: { ...totals, profit: totals.total_revenue - totals.total_expenses },
    expenseByCategory, expenseByMonth, revenueByMonth, revenueByCrop,
  });
});

/* ---------- Profit Calculator + Break-even (farmer) ---------- */
router.get("/profit", authRequired, requireRole("farmer"), (req, res) => {
  const crop = req.query.crop;
  if (!crop) return res.status(400).json({ error: "crop query param is required." });

  const totalExpenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE farmer_id = ? AND LOWER(crop_name) = LOWER(?)
  `).get(req.user.id, crop).total;

  const salesRow = db.prepare(`
    SELECT COALESCE(SUM(o.total_price),0) AS revenue, COALESCE(SUM(o.quantity),0) AS units_sold
    FROM orders o JOIN products p ON p.id = o.product_id
    WHERE p.farmer_id = ? AND LOWER(p.crop_name) = LOWER(?)
  `).get(req.user.id, crop);

  const priceOverride = req.query.price ? Number(req.query.price) : null;
  const avgPriceRow = db.prepare(`
    SELECT AVG(price_per_unit) AS avg_price FROM products WHERE farmer_id = ? AND LOWER(crop_name) = LOWER(?)
  `).get(req.user.id, crop);
  const pricePerUnit = priceOverride || avgPriceRow.avg_price || null;

  const profit = salesRow.revenue - totalExpenses;
  const breakEvenUnits = pricePerUnit ? Math.max(0, totalExpenses / pricePerUnit) : null;
  const unitsRemaining = breakEvenUnits !== null ? Math.max(0, breakEvenUnits - salesRow.units_sold) : null;

  res.json({
    crop,
    total_expenses: totalExpenses,
    total_revenue: salesRow.revenue,
    units_sold: salesRow.units_sold,
    price_per_unit_used: pricePerUnit,
    profit,
    break_even_units: breakEvenUnits,
    units_remaining_to_break_even: unitsRemaining,
    has_broken_even: breakEvenUnits !== null ? salesRow.units_sold >= breakEvenUnits : null,
  });
});

/* ---------- Purchase Analytics (seller) ---------- */
router.get("/purchases", authRequired, requireRole("seller"), (req, res) => {
  const totals = db.prepare(`
    SELECT COALESCE(SUM(total_price),0) AS total_spent, COUNT(*) AS order_count,
           COALESCE(AVG(total_price),0) AS avg_order_value
    FROM orders WHERE buyer_id = ?
  `).get(req.user.id);

  const byCrop = db.prepare(`
    SELECT p.crop_name, SUM(o.total_price) AS total, SUM(o.quantity) AS quantity
    FROM orders o JOIN products p ON p.id = o.product_id
    WHERE o.buyer_id = ? GROUP BY p.crop_name ORDER BY total DESC
  `).all(req.user.id);

  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS month, SUM(total_price) AS total
    FROM orders WHERE buyer_id = ? GROUP BY month ORDER BY month ASC LIMIT 12
  `).all(req.user.id);

  res.json({ totals, byCrop, byMonth });
});

module.exports = router;
