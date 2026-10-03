const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/mine", authRequired, requireRole("farmer"), (req, res) => {
  const rows = db.prepare("SELECT * FROM expenses WHERE farmer_id = ? ORDER BY expense_date DESC, id DESC").all(req.user.id);
  res.json(rows);
});

router.post("/", authRequired, requireRole("farmer"), (req, res) => {
  const { item, category, amount, expense_date, notes, crop_name, client_ref } = req.body || {};
  if (!item || !amount) return res.status(400).json({ error: "item and amount are required." });
  const info = db.prepare(`
    INSERT INTO expenses (farmer_id, item, category, amount, expense_date, notes, crop_name, client_ref)
    VALUES (?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?)
  `).run(req.user.id, item.trim(), category || "general", amount, expense_date || null, notes || null, crop_name || null, client_ref || null);
  res.status(201).json(db.prepare("SELECT * FROM expenses WHERE id = ?").get(info.lastInsertRowid));
});

router.delete("/:id", authRequired, requireRole("farmer"), (req, res) => {
  const existing = db.prepare("SELECT * FROM expenses WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Expense not found." });
  if (existing.farmer_id !== req.user.id) return res.status(403).json({ error: "Not yours." });
  db.prepare("DELETE FROM expenses WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
