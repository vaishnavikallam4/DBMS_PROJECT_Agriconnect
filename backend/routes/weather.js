const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/weather?location=Warangal  (defaults to the farmer's saved profile location)
// Uses Open-Meteo's free, keyless geocoding + forecast APIs. Requires the
// server machine to have internet access; fails gracefully otherwise.
router.get("/", authRequired, requireRole("farmer"), async (req, res) => {
  const location = req.query.location || db.prepare("SELECT location FROM users WHERE id = ?").get(req.user.id).location;
  if (!location) return res.status(400).json({ error: "Add a village/town to your profile first, or pass ?location=" });

  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
    const geo = await geoRes.json();
    if (!geo.results || !geo.results.length) return res.status(404).json({ error: `Couldn't find "${location}" — try a nearby larger town.` });
    const { latitude, longitude, name, country } = geo.results[0];

    const forecastRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=5`
    );
    const forecast = await forecastRes.json();

    res.json({
      resolved_location: `${name}${country ? ", " + country : ""}`,
      current: forecast.current,
      daily: forecast.daily,
    });
  } catch (err) {
    res.status(502).json({ error: "Couldn't reach the weather service. Check your internet connection and try again." });
  }
});

module.exports = router;
