const express = require("express");
const db = require("../db/init");

const router = express.Router();

// GET /api/market-prices?crop=Onion -> latest price per market, plus 7-day history
router.get("/", (req, res) => {
  const crop = (req.query.crop || "").trim();

  const latestQuery = crop
    ? db.prepare(`
        SELECT crop_name, market_name, price_per_unit, unit, price_date, trend
        FROM market_prices
        WHERE crop_name = ?
        AND price_date = (SELECT MAX(price_date) FROM market_prices mp2 WHERE mp2.crop_name = market_prices.crop_name)
        ORDER BY market_name
      `).all(crop)
    : db.prepare(`
        SELECT crop_name, market_name, price_per_unit, unit, price_date, trend
        FROM market_prices
        WHERE price_date = (SELECT MAX(price_date) FROM market_prices mp2 WHERE mp2.crop_name = market_prices.crop_name)
        ORDER BY crop_name, market_name
      `).all();

  res.json(latestQuery);
});

// GET /api/market-prices/history?crop=Onion&market=Local Mandi
router.get("/history", (req, res) => {
  const { crop, market } = req.query;
  if (!crop) return res.status(400).json({ error: "crop is required" });
  const rows = market
    ? db.prepare("SELECT * FROM market_prices WHERE crop_name = ? AND market_name = ? ORDER BY price_date").all(crop, market)
    : db.prepare("SELECT * FROM market_prices WHERE crop_name = ? ORDER BY price_date").all(crop);
  res.json(rows);
});

module.exports = router;
