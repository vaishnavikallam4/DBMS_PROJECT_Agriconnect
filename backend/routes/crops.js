const express = require("express");
const db = require("../db/init");

const router = express.Router();

// GET /api/crops  -> list of names + category, for search/autocomplete
router.get("/", (req, res) => {
  const q = (req.query.q || "").trim();
  let rows;
  if (q) {
    rows = db.prepare("SELECT id, name, category, season FROM crops WHERE name LIKE ? ORDER BY name")
      .all(`%${q}%`);
  } else {
    rows = db.prepare("SELECT id, name, category, season FROM crops ORDER BY name").all();
  }
  res.json(rows);
});

// GET /api/crops/:name -> full seeding-to-selling info
router.get("/:name", (req, res) => {
  const row = db.prepare("SELECT * FROM crops WHERE LOWER(name) = LOWER(?)").get(req.params.name);
  if (!row) return res.status(404).json({ error: "No advisory info found for that crop yet." });
  res.json(row);
});

module.exports = router;
