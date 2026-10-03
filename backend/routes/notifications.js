const express = require("express");
const db = require("../db/init");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, (req, res) => {
  const stored = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(req.user.id);

  let lowStock = [];
  if (req.user.role === "farmer") {
    lowStock = db.prepare(`
      SELECT id, item_name, quantity, unit, low_stock_threshold
      FROM inventory_items
      WHERE farmer_id = ? AND low_stock_threshold > 0 AND quantity <= low_stock_threshold
    `).all(req.user.id).map((i) => ({
      id: `lowstock-${i.id}`,
      type: "low_stock",
      message: `Running low on ${i.item_name} — ${i.quantity} ${i.unit} left (alert at ${i.low_stock_threshold}).`,
      is_read: 0,
      created_at: new Date().toISOString(),
      live: true,
    }));
  }

  const merged = [...lowStock, ...stored].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  res.json(merged);
});

router.put("/:id/read", authRequired, (req, res) => {
  if (String(req.params.id).startsWith("lowstock-")) return res.json({ success: true }); // live item, nothing to persist
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  res.json({ success: true });
});

router.put("/read-all", authRequired, (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
  res.json({ success: true });
});

module.exports = router;
