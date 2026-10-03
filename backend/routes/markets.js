const express = require("express");
const db = require("../db/init");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, (req, res) => {
  const rows = db.prepare("SELECT * FROM markets ORDER BY distance_km ASC").all();
  res.json(rows);
});

module.exports = router;
