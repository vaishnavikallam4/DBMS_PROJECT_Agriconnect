const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/mine", authRequired, requireRole("farmer"), (req, res) => {
  const rows = db.prepare("SELECT * FROM soil_records WHERE farmer_id = ? ORDER BY recorded_at DESC, id DESC").all(req.user.id);
  res.json(rows);
});

router.post("/", authRequired, requireRole("farmer"), (req, res) => {
  const { crop_name, soil_type, ph, nitrogen, phosphorus, potassium, notes, client_ref } = req.body || {};
  const info = db.prepare(`
    INSERT INTO soil_records (farmer_id, crop_name, soil_type, ph, nitrogen, phosphorus, potassium, notes, client_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, crop_name || null, soil_type || null, ph || null, nitrogen || null, phosphorus || null, potassium || null, notes || null, client_ref || null);
  res.status(201).json(db.prepare("SELECT * FROM soil_records WHERE id = ?").get(info.lastInsertRowid));
});

router.delete("/:id", authRequired, requireRole("farmer"), (req, res) => {
  const existing = db.prepare("SELECT * FROM soil_records WHERE id = ?").get(req.params.id);
  if (!existing || existing.farmer_id !== req.user.id) return res.status(404).json({ error: "Not found." });
  db.prepare("DELETE FROM soil_records WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// GET /api/soil/recommend/:crop -> pull fertilizer + soil guidance straight
// from the crop advisory table, so this page gives real, crop-specific advice
// rather than generic filler.
router.get("/recommend/:crop", authRequired, requireRole("farmer"), (req, res) => {
  const crop = db.prepare("SELECT name, soil_type, fertilizer_info FROM crops WHERE LOWER(name) = LOWER(?)").get(req.params.crop);
  if (!crop) return res.status(404).json({ error: "No advisory data for that crop yet." });
  res.json(crop);
});

module.exports = router;
