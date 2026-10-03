const express = require("express");
const db = require("../db/init");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, (req, res) => {
  const row = db.prepare("SELECT id, name, email, role, phone, location, created_at FROM users WHERE id = ?").get(req.user.id);
  res.json(row);
});

router.put("/", authRequired, (req, res) => {
  const { name, phone, location } = req.body || {};
  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      location = COALESCE(?, location)
    WHERE id = ?
  `).run(name, phone, location, req.user.id);
  res.json(db.prepare("SELECT id, name, email, role, phone, location, created_at FROM users WHERE id = ?").get(req.user.id));
});

module.exports = router;
