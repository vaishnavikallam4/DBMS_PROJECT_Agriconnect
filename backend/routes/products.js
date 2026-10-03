const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/products -> all available listings, for the marketplace (any logged-in user)
router.get("/", authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.name AS farmer_name, u.location AS farmer_location, u.phone AS farmer_phone
    FROM products p
    JOIN users u ON u.id = p.farmer_id
    WHERE p.status = 'available'
    ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

// GET /api/products/compare?crop=Tomato -> every current listing for a crop,
// cheapest first, so a buyer can compare farmers at a glance.
router.get("/compare", authRequired, (req, res) => {
  const crop = req.query.crop;
  if (!crop) return res.status(400).json({ error: "crop query param is required." });
  const rows = db.prepare(`
    SELECT p.*, u.name AS farmer_name, u.location AS farmer_location
    FROM products p JOIN users u ON u.id = p.farmer_id
    WHERE p.status = 'available' AND LOWER(p.crop_name) = LOWER(?)
    ORDER BY p.price_per_unit ASC
  `).all(crop);
  const marketRef = db.prepare(`
    SELECT AVG(price_per_unit) AS avg_market_price, unit FROM market_prices
    WHERE LOWER(crop_name) = LOWER(?) AND price_date = (SELECT MAX(price_date) FROM market_prices WHERE LOWER(crop_name) = LOWER(?))
    GROUP BY unit LIMIT 1
  `).get(crop, crop);
  res.json({ crop, listings: rows, market_reference: marketRef || null });
});

// GET /api/products/mine -> farmer's own listings
router.get("/mine", authRequired, requireRole("farmer"), (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE farmer_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json(rows);
});

// POST /api/products -> farmer creates a listing
router.post("/", authRequired, requireRole("farmer"), (req, res) => {
  const { crop_name, quantity, unit, price_per_unit, description, client_ref } = req.body || {};
  if (!crop_name || !quantity || !price_per_unit) {
    return res.status(400).json({ error: "crop_name, quantity and price_per_unit are required." });
  }
  const info = db.prepare(`
    INSERT INTO products (farmer_id, crop_name, quantity, unit, price_per_unit, description, client_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, crop_name.trim(), quantity, unit || "kg", price_per_unit, description || null, client_ref || null);
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

// PUT /api/products/:id -> farmer updates own listing
router.put("/:id", authRequired, requireRole("farmer"), (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Listing not found." });
  if (existing.farmer_id !== req.user.id) return res.status(403).json({ error: "Not your listing." });

  const { crop_name, quantity, unit, price_per_unit, description, status } = req.body || {};
  db.prepare(`
    UPDATE products SET
      crop_name = COALESCE(?, crop_name),
      quantity = COALESCE(?, quantity),
      unit = COALESCE(?, unit),
      price_per_unit = COALESCE(?, price_per_unit),
      description = COALESCE(?, description),
      status = COALESCE(?, status)
    WHERE id = ?
  `).run(crop_name, quantity, unit, price_per_unit, description, status, req.params.id);

  res.json(db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id));
});

// DELETE /api/products/:id -> farmer removes own listing
router.delete("/:id", authRequired, requireRole("farmer"), (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Listing not found." });
  if (existing.farmer_id !== req.user.id) return res.status(403).json({ error: "Not your listing." });
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
