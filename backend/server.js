const express = require("express");
const cors = require("cors");
const path = require("path");

require("./db/init"); // ensures DB file + tables + seed data exist

const authRoutes = require("./routes/auth");
const cropRoutes = require("./routes/crops");
const marketRoutes = require("./routes/market");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const expenseRoutes = require("./routes/expenses");
const profileRoutes = require("./routes/profile");
const syncRoutes = require("./routes/sync");
const myCropsRoutes = require("./routes/mycrops");
const soilRoutes = require("./routes/soil");
const inventoryRoutes = require("./routes/inventory");
const notificationRoutes = require("./routes/notifications");
const marketsDirRoutes = require("./routes/markets");
const savedRoutes = require("./routes/saved");
const messageRoutes = require("./routes/messages");
const reviewRoutes = require("./routes/reviews");
const analyticsRoutes = require("./routes/analytics");
const weatherRoutes = require("./routes/weather");
const farmersRoutes = require("./routes/farmers");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/crops", cropRoutes);
app.use("/api/market-prices", marketRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/my-crops", myCropsRoutes);
app.use("/api/soil", soilRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/markets", marketsDirRoutes);
app.use("/api/saved", savedRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/farmers", farmersRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Optional: serve the frontend folder directly so the whole project
// can run from a single "node server.js" with no separate static server.
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`AgriConnect API running at http://localhost:${PORT}`);
  console.log(`Frontend also served at http://localhost:${PORT}/login.html`);
});
