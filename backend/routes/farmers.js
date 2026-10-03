const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, requireRole("seller"), (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.location, u.phone,
           (SELECT COUNT(*) FROM products p WHERE p.farmer_id = u.id AND p.status = 'available') AS active_listings,
           (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.farmer_id = u.id) AS average_rating,
           (SELECT COUNT(*) FROM reviews r WHERE r.farmer_id = u.id) AS review_count
    FROM users u
    WHERE u.role = 'farmer'
    ORDER BY active_listings DESC, u.name ASC
  `).all();
  res.json(rows);
});

module.exports = router;
