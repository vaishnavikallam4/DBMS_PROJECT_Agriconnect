const express = require("express");
const db = require("../db/init");
const { authRequired } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();

// GET /api/messages/threads -> one row per conversation, with the last
// message and an unread count, for whichever role is logged in.
router.get("/threads", authRequired, (req, res) => {
  const isFarmer = req.user.role === "farmer";
  const rows = db.prepare(`
    SELECT m.product_id, m.farmer_id, m.seller_id,
           p.crop_name,
           uf.name AS farmer_name, us.name AS seller_name,
           MAX(m.created_at) AS last_at,
           (SELECT body FROM messages m2 WHERE m2.product_id IS m.product_id AND m2.farmer_id = m.farmer_id AND m2.seller_id = m.seller_id ORDER BY m2.id DESC LIMIT 1) AS last_body,
           SUM(CASE WHEN m.is_read = 0 AND m.sender_role != ? THEN 1 ELSE 0 END) AS unread_count
    FROM messages m
    LEFT JOIN products p ON p.id = m.product_id
    JOIN users uf ON uf.id = m.farmer_id
    JOIN users us ON us.id = m.seller_id
    WHERE ${isFarmer ? "m.farmer_id = ?" : "m.seller_id = ?"}
    GROUP BY m.product_id, m.farmer_id, m.seller_id
    ORDER BY last_at DESC
  `).all(req.user.role, req.user.id);
  res.json(rows);
});

// GET /api/messages/thread?product_id=&counterpart_id= -> full conversation.
router.get("/thread", authRequired, (req, res) => {
  const productId = req.query.product_id || null;
  const counterpartId = Number(req.query.counterpart_id);
  const isFarmer = req.user.role === "farmer";
  const farmerId = isFarmer ? req.user.id : counterpartId;
  const sellerId = isFarmer ? counterpartId : req.user.id;

  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE farmer_id = ? AND seller_id = ? AND (product_id IS ? OR product_id = ?)
    ORDER BY id ASC
  `).all(farmerId, sellerId, productId, productId);

  db.prepare(`
    UPDATE messages SET is_read = 1
    WHERE farmer_id = ? AND seller_id = ? AND (product_id IS ? OR product_id = ?) AND sender_role != ?
  `).run(farmerId, sellerId, productId, productId, req.user.role);

  res.json(rows);
});

// POST /api/messages { product_id, counterpart_id (required if sender is farmer), body }
router.post("/", authRequired, (req, res) => {
  const { product_id, counterpart_id, body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "Message body is required." });

  let farmerId, sellerId;
  if (req.user.role === "seller") {
    const product = db.prepare("SELECT farmer_id FROM products WHERE id = ?").get(product_id);
    if (!product) return res.status(404).json({ error: "Listing not found." });
    farmerId = product.farmer_id;
    sellerId = req.user.id;
  } else {
    if (!counterpart_id) return res.status(400).json({ error: "counterpart_id is required." });
    farmerId = req.user.id;
    sellerId = Number(counterpart_id);
  }

  const info = db.prepare(`
    INSERT INTO messages (product_id, farmer_id, seller_id, sender_role, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(product_id || null, farmerId, sellerId, req.user.role, body.trim());

  const recipientId = req.user.role === "farmer" ? sellerId : farmerId;
  notify(recipientId, "message", `New message from ${req.user.name || "the other side"}: "${body.trim().slice(0, 60)}"`);

  res.status(201).json(db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid));
});

module.exports = router;
