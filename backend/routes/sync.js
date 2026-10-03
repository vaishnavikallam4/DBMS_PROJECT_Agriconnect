const express = require("express");
const db = require("../db/init");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// POST /api/sync
// Body: { actions: [ { type: 'add_product'|'add_expense'|'place_order', payload, client_ref } ] }
// Replays queued offline actions in order and reports what succeeded/failed,
// so the frontend can clear its local queue safely.
router.post("/", authRequired, (req, res) => {
  const { actions } = req.body || {};
  if (!Array.isArray(actions)) return res.status(400).json({ error: "actions must be an array." });

  const results = actions.map((action) => {
    try {
      switch (action.type) {
        case "add_product": {
          if (req.user.role !== "farmer") throw new Error("Only farmers can list produce.");
          const { crop_name, quantity, unit, price_per_unit, description } = action.payload || {};
          const info = db.prepare(`
            INSERT INTO products (farmer_id, crop_name, quantity, unit, price_per_unit, description, client_ref)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(req.user.id, crop_name, quantity, unit || "kg", price_per_unit, description || null, action.client_ref);
          return { client_ref: action.client_ref, status: "ok", id: info.lastInsertRowid };
        }
        case "add_expense": {
          if (req.user.role !== "farmer") throw new Error("Only farmers track expenses.");
          const { item, category, amount, expense_date, notes, crop_name } = action.payload || {};
          const info = db.prepare(`
            INSERT INTO expenses (farmer_id, item, category, amount, expense_date, notes, crop_name, client_ref)
            VALUES (?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?)
          `).run(req.user.id, item, category || "general", amount, expense_date || null, notes || null, crop_name || null, action.client_ref);
          return { client_ref: action.client_ref, status: "ok", id: info.lastInsertRowid };
        }
        case "add_my_crop": {
          if (req.user.role !== "farmer") throw new Error("Only farmers track crops.");
          const { crop_name, area, area_unit, planted_date, expected_harvest_date, status, notes } = action.payload || {};
          const info = db.prepare(`
            INSERT INTO my_crops (farmer_id, crop_name, area, area_unit, planted_date, expected_harvest_date, status, notes, client_ref)
            VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 'active'), ?, ?)
          `).run(req.user.id, crop_name, area || null, area_unit || "acre", planted_date, expected_harvest_date || null, status, notes || null, action.client_ref);
          return { client_ref: action.client_ref, status: "ok", id: info.lastInsertRowid };
        }
        case "add_inventory_item": {
          if (req.user.role !== "farmer") throw new Error("Only farmers manage inventory.");
          const { item_name, category, quantity, unit, low_stock_threshold } = action.payload || {};
          const info = db.prepare(`
            INSERT INTO inventory_items (farmer_id, item_name, category, quantity, unit, low_stock_threshold, client_ref)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(req.user.id, item_name, category || "general", quantity || 0, unit || "kg", low_stock_threshold || 0, action.client_ref);
          return { client_ref: action.client_ref, status: "ok", id: info.lastInsertRowid };
        }
        case "place_order": {
          if (req.user.role !== "seller") throw new Error("Only buyers place orders.");
          const { product_id, quantity } = action.payload || {};
          const product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
          if (!product || product.status !== "available") throw new Error("Listing no longer available.");
          const qty = Math.min(quantity, product.quantity);
          const total_price = Math.round(qty * product.price_per_unit * 100) / 100;
          const info = db.prepare(`
            INSERT INTO orders (product_id, buyer_id, quantity, total_price, client_ref)
            VALUES (?, ?, ?, ?, ?)
          `).run(product_id, req.user.id, qty, total_price, action.client_ref);
          const remaining = product.quantity - qty;
          db.prepare("UPDATE products SET quantity = ?, status = ? WHERE id = ?")
            .run(Math.max(remaining, 0), remaining <= 0 ? "sold" : "available", product_id);
          return { client_ref: action.client_ref, status: "ok", id: info.lastInsertRowid };
        }
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (err) {
      return { client_ref: action.client_ref, status: "error", error: err.message };
    }
  });

  res.json({ results });
});

module.exports = router;
