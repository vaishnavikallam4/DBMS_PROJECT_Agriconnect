const express = require("express");
const db = require("../db/init");
const { authRequired, requireRole } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();

const STAGES = ["confirmed", "packed", "shipped", "delivered"];

// POST /api/orders -> seller buys a product from the marketplace
router.post("/", authRequired, requireRole("seller"), (req, res) => {
  const { product_id, quantity, client_ref } = req.body || {};
  if (!product_id || !quantity) {
    return res.status(400).json({ error: "product_id and quantity are required." });
  }
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
  if (!product || product.status !== "available") {
    return res.status(404).json({ error: "This listing is no longer available." });
  }
  if (quantity > product.quantity) {
    return res.status(400).json({ error: `Only ${product.quantity} ${product.unit} available.` });
  }

  const total_price = Math.round(quantity * product.price_per_unit * 100) / 100;

  const placeOrder = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO orders (product_id, buyer_id, quantity, total_price, client_ref)
      VALUES (?, ?, ?, ?, ?)
    `).run(product_id, req.user.id, quantity, total_price, client_ref || null);

    const remaining = product.quantity - quantity;
    if (remaining <= 0) {
      db.prepare("UPDATE products SET quantity = 0, status = 'sold' WHERE id = ?").run(product_id);
    } else {
      db.prepare("UPDATE products SET quantity = ? WHERE id = ?").run(remaining, product_id);
    }
    return info.lastInsertRowid;
  });

  const orderId = placeOrder();
  const order = db.prepare(`
    SELECT o.*, p.crop_name, p.unit, u.name AS farmer_name
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN users u ON u.id = p.farmer_id
    WHERE o.id = ?
  `).get(orderId);
  notify(product.farmer_id, "order", `New order: ${req.user.name} bought ${quantity} ${product.unit} of ${product.crop_name}.`);
  res.status(201).json(order);
});

// GET /api/orders/mine -> a seller's purchase history ("products sold" to them)
router.get("/mine", authRequired, requireRole("seller"), (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, p.crop_name, p.unit, u.name AS farmer_name, u.location AS farmer_location
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN users u ON u.id = p.farmer_id
    WHERE o.buyer_id = ?
    ORDER BY o.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// GET /api/orders/for-my-products -> a farmer's view of what's sold from their listings
router.get("/for-my-products", authRequired, requireRole("farmer"), (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, p.crop_name, p.unit, u.name AS buyer_name
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN users u ON u.id = o.buyer_id
    WHERE p.farmer_id = ?
    ORDER BY o.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// PATCH /api/orders/:id/status -> farmer advances an order through
// confirmed -> packed -> shipped -> delivered. Notifies the buyer.
router.patch("/:id/status", authRequired, requireRole("farmer"), (req, res) => {
  const { status } = req.body || {};
  if (!STAGES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STAGES.join(", ")}` });

  const order = db.prepare(`
    SELECT o.*, p.farmer_id, p.crop_name FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = ?
  `).get(req.params.id);
  if (!order || order.farmer_id !== req.user.id) return res.status(404).json({ error: "Order not found." });

  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  notify(order.buyer_id, "order_status", `Your order for ${order.crop_name} is now "${status}".`);
  res.json(db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id));
});

module.exports = router;
