const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

function withLowStock(row) {
  return { ...row, low_stock: row.low_stock_threshold > 0 && row.quantity <= row.low_stock_threshold };
}

router.get("/mine", authRequired, requireRole("farmer"), (req, res) => {
  const rows = db.prepare("SELECT * FROM inventory_items WHERE farmer_id = ? ORDER BY item_name").all(req.user.id);
  res.json(rows.map(withLowStock));
});

router.post("/", authRequired, requireRole("farmer"), (req, res) => {
  const { item_name, category, quantity, unit, low_stock_threshold, client_ref } = req.body || {};
  if (!item_name) return res.status(400).json({ error: "item_name is required." });
  const info = db.prepare(`
    INSERT INTO inventory_items (farmer_id, item_name, category, quantity, unit, low_stock_threshold, client_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, item_name.trim(), category || "general", quantity || 0, unit || "kg", low_stock_threshold || 0, client_ref || null);
  res.status(201).json(withLowStock(db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(info.lastInsertRowid)));
});

router.put("/:id", authRequired, requireRole("farmer"), (req, res) => {
  const existing = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(req.params.id);
  if (!existing || existing.farmer_id !== req.user.id) return res.status(404).json({ error: "Not found." });
  const { quantity, low_stock_threshold, category } = req.body || {};
  db.prepare(`
    UPDATE inventory_items SET
      quantity = COALESCE(?, quantity),
      low_stock_threshold = COALESCE(?, low_stock_threshold),
      category = COALESCE(?, category),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(quantity, low_stock_threshold, category, req.params.id);
  res.json(withLowStock(db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(req.params.id)));
});

router.delete("/:id", authRequired, requireRole("farmer"), (req, res) => {
  const existing = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(req.params.id);
  if (!existing || existing.farmer_id !== req.user.id) return res.status(404).json({ error: "Not found." });
  db.prepare("DELETE FROM inventory_items WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
