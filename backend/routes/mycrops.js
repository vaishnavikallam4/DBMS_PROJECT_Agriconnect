const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/mine", authRequired, requireRole("farmer"), (req, res) => {
  const rows = db.prepare("SELECT * FROM my_crops WHERE farmer_id = ? ORDER BY planted_date DESC").all(req.user.id);
  res.json(rows);
});

// POST /api/my-crops -> plan/add a crop being grown.
// If expected_harvest_date isn't supplied, try to estimate it from the
// crops advisory table's duration_days (first number found in that text).
router.post("/", authRequired, requireRole("farmer"), (req, res) => {
  const { crop_name, area, area_unit, planted_date, expected_harvest_date, notes, client_ref } = req.body || {};
  if (!crop_name || !planted_date) {
    return res.status(400).json({ error: "crop_name and planted_date are required." });
  }

  let harvestDate = expected_harvest_date || null;
  if (!harvestDate) {
    const cropRef = db.prepare("SELECT duration_days FROM crops WHERE LOWER(name) = LOWER(?)").get(crop_name);
    const match = cropRef && cropRef.duration_days && cropRef.duration_days.match(/(\d+)/g);
    if (match) {
      const days = Math.max(...match.map(Number));
      const d = new Date(planted_date);
      d.setDate(d.getDate() + days);
      harvestDate = d.toISOString().slice(0, 10);
    }
  }

  const info = db.prepare(`
    INSERT INTO my_crops (farmer_id, crop_name, area, area_unit, planted_date, expected_harvest_date, notes, client_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, crop_name.trim(), area || null, area_unit || "acre", planted_date, harvestDate, notes || null, client_ref || null);

  res.status(201).json(db.prepare("SELECT * FROM my_crops WHERE id = ?").get(info.lastInsertRowid));
});

router.put("/:id", authRequired, requireRole("farmer"), (req, res) => {
  const existing = db.prepare("SELECT * FROM my_crops WHERE id = ?").get(req.params.id);
  if (!existing || existing.farmer_id !== req.user.id) return res.status(404).json({ error: "Not found." });
  const { status, notes } = req.body || {};
  db.prepare("UPDATE my_crops SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?")
    .run(status, notes, req.params.id);
  res.json(db.prepare("SELECT * FROM my_crops WHERE id = ?").get(req.params.id));
});

router.delete("/:id", authRequired, requireRole("farmer"), (req, res) => {
  const existing = db.prepare("SELECT * FROM my_crops WHERE id = ?").get(req.params.id);
  if (!existing || existing.farmer_id !== req.user.id) return res.status(404).json({ error: "Not found." });
  db.prepare("DELETE FROM my_crops WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
