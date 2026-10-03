const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, requireRole("seller"), (req, res) => {
  const rows = db.prepare(`
    SELECT s.id AS saved_id, s.created_at AS saved_at, p.*, u.name AS farmer_name, u.location AS farmer_location
    FROM saved_items s
    JOIN products p ON p.id = s.product_id
    JOIN users u ON u.id = p.farmer_id
    WHERE s.seller_id = ?
    ORDER BY s.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

router.post("/", authRequired, requireRole("seller"), (req, res) => {
  const { product_id } = req.body || {};
  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(product_id);
  if (!product) return res.status(404).json({ error: "Listing not found." });
  try {
    db.prepare("INSERT INTO saved_items (seller_id, product_id) VALUES (?, ?)").run(req.user.id, product_id);
  } catch {
    return res.status(409).json({ error: "Already saved." });
  }
  res.status(201).json({ success: true });
});

router.delete("/:productId", authRequired, requireRole("seller"), (req, res) => {
  db.prepare("DELETE FROM saved_items WHERE seller_id = ? AND product_id = ?").run(req.user.id, req.params.productId);
  res.json({ success: true });
});

module.exports = router;
