// db/init.js
// Sets up the SQLite database (file-based, zero external server needed).
// Schema is plain SQL, so porting to MySQL/PostgreSQL later only means
// swapping the driver in this file — every route uses plain SQL strings.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "agriconnect.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('farmer','seller')),
  phone TEXT,
  location TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  season TEXT,
  duration_days TEXT,
  soil_type TEXT,
  seeding_info TEXT,
  spacing_info TEXT,
  watering_info TEXT,
  fertilizer_info TEXT,
  pest_control TEXT,
  harvesting_info TEXT,
  selling_tips TEXT
);

CREATE TABLE IF NOT EXISTS market_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crop_name TEXT NOT NULL,
  market_name TEXT NOT NULL,
  price_per_unit REAL NOT NULL,
  unit TEXT DEFAULT 'quintal',
  price_date TEXT DEFAULT (date('now')),
  trend TEXT DEFAULT 'stable'
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'kg',
  price_per_unit REAL NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'available' CHECK(status IN ('available','sold','removed')),
  created_at TEXT DEFAULT (datetime('now')),
  client_ref TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  total_price REAL NOT NULL,
  status TEXT DEFAULT 'confirmed',
  created_at TEXT DEFAULT (datetime('now')),
  client_ref TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  amount REAL NOT NULL,
  expense_date TEXT DEFAULT (date('now')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  client_ref TEXT
);

-- ---- "My Crops" / Crop Planner: crop instances a farmer is actively growing ----
CREATE TABLE IF NOT EXISTS my_crops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL,
  area REAL,
  area_unit TEXT DEFAULT 'acre',
  planted_date TEXT NOT NULL,
  expected_harvest_date TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('planned','active','harvested','abandoned')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  client_ref TEXT
);

-- ---- Soil & Fertilizer logs ----
CREATE TABLE IF NOT EXISTS soil_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name TEXT,
  soil_type TEXT,
  ph REAL,
  nitrogen TEXT,
  phosphorus TEXT,
  potassium TEXT,
  notes TEXT,
  recorded_at TEXT DEFAULT (date('now')),
  client_ref TEXT
);

-- ---- Farm Inventory (seeds, fertilizer stock, tools) ----
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'kg',
  low_stock_threshold REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  client_ref TEXT
);

-- ---- Notifications (both roles) ----
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'general',
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- Nearby markets (reference directory, seeded) ----
CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  market_type TEXT,
  distance_km REAL,
  contact TEXT,
  crops_traded TEXT
);

-- ---- Seller's saved/wishlisted listings ----
CREATE TABLE IF NOT EXISTS saved_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(seller_id, product_id)
);

-- ---- Messages between a farmer and a seller, scoped to a listing ----
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  farmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('farmer','seller')),
  body TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  client_ref TEXT
);

-- ---- Reviews left by sellers on completed orders ----
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farmer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  client_ref TEXT,
  UNIQUE(order_id)
);
`);

// Older DBs created before this update won't have the new "updated_at"/status
// columns on orders — add them if missing (SQLite ALTER TABLE is additive-only).
const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
if (!orderCols.includes("updated_at")) {
  db.exec("ALTER TABLE orders ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))");
}

// Expenses gained an optional crop_name tag later (used by the profit
// calculator to attribute spend to a specific crop) — add it if missing.
const expenseCols = db.prepare("PRAGMA table_info(expenses)").all().map((c) => c.name);
if (!expenseCols.includes("crop_name")) {
  db.exec("ALTER TABLE expenses ADD COLUMN crop_name TEXT");
}

// ---- Seed crop advisory data (only once) ----
const cropCount = db.prepare("SELECT COUNT(*) c FROM crops").get().c;
if (cropCount === 0) {
  const insertCrop = db.prepare(`
    INSERT INTO crops
    (name, category, season, duration_days, soil_type, seeding_info, spacing_info,
     watering_info, fertilizer_info, pest_control, harvesting_info, selling_tips)
    VALUES (@name, @category, @season, @duration_days, @soil_type, @seeding_info, @spacing_info,
     @watering_info, @fertilizer_info, @pest_control, @harvesting_info, @selling_tips)
  `);

  const crops = [
    {
      name: "Rice", category: "Cereal", season: "Kharif (Jun–Jul sowing)", duration_days: "110–150 days",
      soil_type: "Clayey loam that retains water well.",
      seeding_info: "Raise nursery seedlings for 20–25 days, then transplant into puddled, flooded fields. Direct seeding is also common in water-scarce areas.",
      spacing_info: "Transplant at roughly 20cm x 15cm spacing.",
      watering_info: "Needs standing water of 2–5cm through most of the vegetative stage; drain the field about 2 weeks before harvest.",
      fertilizer_info: "Apply basal NPK before transplanting, with a nitrogen top-dressing at tillering and panicle initiation stages.",
      pest_control: "Watch for stem borer, leaf folder, and blast disease. Use resistant varieties and neem-based sprays before resorting to chemical pesticides.",
      harvesting_info: "Harvest when 80–85% of grains turn golden-yellow and moisture is around 20–25%. Dry to 12–14% moisture before storage.",
      selling_tips: "Prices are usually best right after milling season starts and lowest right after the main harvest floods the market — consider short-term storage if you can."
    },
    {
      name: "Wheat", category: "Cereal", season: "Rabi (Oct–Dec sowing)", duration_days: "110–130 days",
      soil_type: "Well-drained loamy soil with neutral pH.",
      seeding_info: "Sow seeds 4–5cm deep in well-prepared, moist soil using a seed drill for even spacing.",
      spacing_info: "Row spacing of about 20cm.",
      watering_info: "Needs 4–6 irrigations: at crown root initiation, tillering, jointing, flowering, milking, and dough stages.",
      fertilizer_info: "Apply full phosphorus and potash at sowing; split nitrogen between sowing, first irrigation, and second irrigation.",
      pest_control: "Common threats are aphids and rust disease; monitor weekly and use resistant varieties where possible.",
      harvesting_info: "Harvest when grains are hard and straw turns golden-brown, generally when moisture is around 20%.",
      selling_tips: "Government procurement (MSP) centers are usually the most stable option; private mandi prices can spike a few weeks after harvest."
    },
    {
      name: "Tomato", category: "Vegetable", season: "Year-round in most regions (best in Jul–Sep or Oct–Dec sowing)", duration_days: "60–90 days after transplant",
      soil_type: "Well-drained sandy loam rich in organic matter.",
      seeding_info: "Raise seedlings in a nursery for 25–30 days before transplanting.",
      spacing_info: "Transplant at 60cm x 45cm spacing for good airflow.",
      watering_info: "Regular light watering; avoid waterlogging which causes root rot. Drip irrigation works very well.",
      fertilizer_info: "Needs balanced NPK with extra potassium during fruiting for better size and shelf life.",
      pest_control: "Watch for fruit borer and early/late blight. Stake plants to improve airflow and reduce fungal issues.",
      harvesting_info: "Pick at the 'breaker' stage (starting to color) if the market is far away, or fully ripe for local/immediate sale.",
      selling_tips: "Highly perishable — sell fast or arrange cold storage. Prices swing sharply with weather-driven supply gluts."
    },
    {
      name: "Potato", category: "Vegetable", season: "Rabi (Oct–Nov planting)", duration_days: "90–120 days",
      soil_type: "Loose, well-drained sandy loam.",
      seeding_info: "Plant healthy, sprouted seed tubers 5–7cm deep.",
      spacing_info: "Rows 60cm apart, tubers 20cm apart within the row.",
      watering_info: "Light, frequent irrigation; critical stages are tuber initiation and bulking.",
      fertilizer_info: "Needs high potassium for tuber quality along with balanced N and P.",
      pest_control: "Late blight is the biggest risk in humid weather; watch for aphids that spread viral disease.",
      harvesting_info: "Harvest once the vines yellow and dry down, then cure tubers in shade for a few days before storage.",
      selling_tips: "Cold storage lets you sell months after harvest when off-season prices are much higher."
    },
    {
      name: "Onion", category: "Vegetable", season: "Rabi (Nov–Dec) or Kharif (Jun–Jul)", duration_days: "100–150 days",
      soil_type: "Well-drained loamy soil with good organic content.",
      seeding_info: "Raise seedlings in a nursery for about 6 weeks before transplanting.",
      spacing_info: "Transplant at 15cm x 10cm spacing.",
      watering_info: "Regular light irrigation; stop watering 2–3 weeks before harvest to help bulbs cure.",
      fertilizer_info: "Needs sulfur along with NPK for better bulb pungency and size.",
      pest_control: "Thrips and purple blotch disease are the main threats; rotate crops to reduce soil-borne disease.",
      harvesting_info: "Harvest when the tops fall over and dry naturally; cure bulbs in shade for 1–2 weeks.",
      selling_tips: "Onion prices are famously volatile — well-cured, well-stored bulbs let you wait out low-price periods."
    },
    {
      name: "Cotton", category: "Cash Crop", season: "Kharif (Apr–Jun sowing)", duration_days: "150–180 days",
      soil_type: "Deep black cotton soil (regur) or well-drained loam.",
      seeding_info: "Sow directly in the field after the first good monsoon rain.",
      spacing_info: "Row spacing of 90–120cm depending on variety.",
      watering_info: "Mostly rain-fed; supplemental irrigation helps at flowering and boll formation.",
      fertilizer_info: "Balanced NPK with extra nitrogen split across the growing season.",
      pest_control: "Bollworm is the major pest — use pheromone traps and resistant (Bt) varieties.",
      harvesting_info: "Picked in 3–4 rounds as bolls open, over 3–4 months.",
      selling_tips: "Grade cotton by staple length and cleanliness before selling — clean, well-graded cotton earns a real premium."
    },
    {
      name: "Maize", category: "Cereal", season: "Kharif (Jun–Jul) or Rabi (Oct–Nov)", duration_days: "90–110 days",
      soil_type: "Well-drained sandy loam to loam.",
      seeding_info: "Direct-seed at 3–5cm depth once soil moisture is adequate.",
      spacing_info: "Rows 60–75cm apart, plants 20–25cm apart.",
      watering_info: "Sensitive to water stress at tasseling and silking; irrigate at these stages if rain is short.",
      fertilizer_info: "Heavy nitrogen feeder — split doses at sowing, knee-high, and tasseling stages.",
      pest_control: "Fall armyworm is a serious modern threat; scout fields weekly during early growth.",
      harvesting_info: "Harvest when husks dry and kernels are hard, at roughly 20–25% grain moisture.",
      selling_tips: "Drying grain to 14% moisture before sale avoids price deductions for excess moisture."
    },
    {
      name: "Sugarcane", category: "Cash Crop", season: "Planted Feb–Mar or Oct–Nov", duration_days: "10–18 months",
      soil_type: "Deep, well-drained loamy soil.",
      seeding_info: "Plant healthy 2–3 budded setts in furrows.",
      spacing_info: "Row spacing of 90–120cm.",
      watering_info: "Heavy water requirement; irrigate every 7–10 days depending on climate.",
      fertilizer_info: "High NPK demand, applied in split doses across the long growing cycle.",
      pest_control: "Watch for early shoot borer and red rot disease; use disease-free setts.",
      harvesting_info: "Harvest when sucrose content peaks, usually indicated by the cane turning yellowish and less juicy at the tip.",
      selling_tips: "Contracts with local sugar mills are the usual sales route — confirm the mill's crushing schedule before harvesting."
    },
    {
      name: "Chilli", category: "Vegetable/Spice", season: "Jun–Jul or Nov–Dec sowing", duration_days: "150–180 days",
      soil_type: "Well-drained sandy loam with good organic matter.",
      seeding_info: "Raise nursery seedlings for 30–35 days before transplanting.",
      spacing_info: "Transplant at 45cm x 45cm spacing.",
      watering_info: "Regular moderate irrigation; avoid waterlogging.",
      fertilizer_info: "Balanced NPK with micronutrients like calcium and boron to reduce fruit drop.",
      pest_control: "Thrips, mites, and fruit rot are common — rotate crops and avoid excess humidity around plants.",
      harvesting_info: "Pick green chillies as needed, or let pods fully redden and dry for the dry-chilli market.",
      selling_tips: "Dried chilli commands better long-term storage value than fresh; grade by color and size for premium buyers."
    },
    {
      name: "Groundnut", category: "Oilseed", season: "Kharif (Jun–Jul) or Rabi (Jan–Feb)", duration_days: "100–130 days",
      soil_type: "Well-drained sandy loam, avoid heavy clay.",
      seeding_info: "Direct-seed pods 5cm deep after treating seed with fungicide.",
      spacing_info: "Rows 30cm apart, plants 10cm apart.",
      watering_info: "Critical irrigation stages are flowering, pegging, and pod development.",
      fertilizer_info: "Needs gypsum (calcium) at flowering for good pod filling, along with basal NPK.",
      pest_control: "Leaf miner and collar rot are common problems; ensure good field drainage.",
      harvesting_info: "Harvest when the inside of the pod shell shows dark veining and leaves start yellowing.",
      selling_tips: "Sun-dry pods to below 8% moisture — buyers pay a premium for well-dried, aflatoxin-free groundnut."
    }
  ];

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insertCrop.run(row);
  });
  insertMany(crops);
}

// ---- Seed a few days of market price history (only once) ----
const priceCount = db.prepare("SELECT COUNT(*) c FROM market_prices").get().c;
if (priceCount === 0) {
  const insertPrice = db.prepare(`
    INSERT INTO market_prices (crop_name, market_name, price_per_unit, unit, price_date, trend)
    VALUES (?, ?, ?, ?, date('now', ?), ?)
  `);
  const basePrices = {
    Rice: 2100, Wheat: 2350, Tomato: 1800, Potato: 1400, Onion: 1900,
    Cotton: 6800, Maize: 1950, Sugarcane: 340, Chilli: 14500, Groundnut: 6200
  };
  const markets = ["Local Mandi", "District APMC"];
  const insertMany = db.transaction(() => {
    Object.entries(basePrices).forEach(([crop, base]) => {
      markets.forEach((market) => {
        for (let d = 6; d >= 0; d--) {
          const drift = Math.round((Math.random() - 0.5) * base * 0.06);
          const price = Math.max(50, base + drift);
          const trend = drift > base * 0.01 ? "up" : drift < -base * 0.01 ? "down" : "stable";
          insertPrice.run(crop, market, price, crop === "Sugarcane" ? "ton" : "quintal", `-${d} days`, trend);
        }
      });
    });
  });
  insertMany();
}

// ---- Seed a nearby-markets directory (only once) ----
const marketCount = db.prepare("SELECT COUNT(*) c FROM markets").get().c;
if (marketCount === 0) {
  const insertMarket = db.prepare(`
    INSERT INTO markets (name, location, market_type, distance_km, contact, crops_traded)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const seedMarkets = [
    ["District APMC Yard", "District HQ", "Wholesale (APMC)", 8.4, "040-2345-6789", "Rice, Wheat, Cotton, Maize"],
    ["Local Mandi", "Town Center", "Local mandi", 2.1, "040-2233-4455", "Vegetables, Onion, Potato, Tomato"],
    ["Farmers' Cooperative Hub", "Cooperative Society Road", "Cooperative", 5.6, "040-2211-9988", "All crops (member pricing)"],
    ["Riverside Weekly Bazaar", "Riverside Road", "Weekly market", 3.9, "N/A", "Vegetables, Fruits, Spices"],
    ["Regional Cold Storage & Market", "Industrial Area", "Cold storage + trading", 14.2, "040-2777-1122", "Potato, Onion, Chilli"],
  ];
  const insertMany = db.transaction((rows) => rows.forEach((r) => insertMarket.run(...r)));
  insertMany(seedMarkets);
}

module.exports = db;
