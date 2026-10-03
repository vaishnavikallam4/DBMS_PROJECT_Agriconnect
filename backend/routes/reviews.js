const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();

// POST /api/reviews { order_id, rating, comment }
router.post("/", authRequired, requireRole("seller"), (req, res) => {
  const { order_id, rating, comment, client_ref } = req.body || {};
  if (!order_id || !rating) return res.status(400).json({ error: "order_id and rating are required." });

  const order = db.prepare(`
    SELECT o.*, p.farmer_id, p.crop_name FROM orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.id = ?
  `).get(order_id);
  if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ error: "Order not found." });

  try {
    const info = db.prepare(`
      INSERT INTO reviews (order_id, seller_id, farmer_id, rating, comment, client_ref)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(order_id, req.user.id, order.farmer_id, Math.max(1, Math.min(5, rating)), comment || null, client_ref || null);
    notify(order.farmer_id, "review", `${req.user.name} left a ${rating}-star review for your ${order.crop_name}.`);
    res.status(201).json(db.prepare("SELECT * FROM reviews WHERE id = ?").get(info.lastInsertRowid));
  } catch {
    res.status(409).json({ error: "You've already reviewed this order." });
  }
});

router.get("/mine", authRequired, requireRole("seller"), (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, p.crop_name, u.name AS farmer_name
    FROM reviews r
    JOIN orders o ON o.id = r.order_id
    JOIN products p ON p.id = o.product_id
    JOIN users u ON u.id = r.farmer_id
    WHERE r.seller_id = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

router.get("/farmer/:farmerId", authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT r.rating, r.comment, r.created_at, p.crop_name, u.name AS seller_name
    FROM reviews r
    JOIN orders o ON o.id = r.order_id
    JOIN products p ON p.id = o.product_id
    JOIN users u ON u.id = r.seller_id
    WHERE r.farmer_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.farmerId);
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null;
  res.json({ average_rating: avg ? Math.round(avg * 10) / 10 : null, count: rows.length, reviews: rows });
});

module.exports = router;
