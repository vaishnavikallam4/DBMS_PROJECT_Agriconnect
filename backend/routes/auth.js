const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db/init");
const { authRequired, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

router.post("/register", (req, res) => {
  const { name, email, password, role, phone, location } = req.body || {};

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Name, email, password and role are required." });
  }
  if (!["farmer", "seller"].includes(role)) {
    return res.status(400).json({ error: "Role must be 'farmer' or 'seller'." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, phone, location)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name.trim(), email.toLowerCase().trim(), password_hash, role, phone || null, location || null);

  const user = { id: info.lastInsertRowid, name, email: email.toLowerCase().trim(), role };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ token, user });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user });
});

router.get("/me", authRequired, (req, res) => {
  const row = db.prepare("SELECT id, name, email, role, phone, location, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!row) return res.status(404).json({ error: "User not found." });
  res.json(row);
});

module.exports = router;
