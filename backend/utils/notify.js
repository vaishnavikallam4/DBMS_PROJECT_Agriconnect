const db = require("../db/init");

function notify(userId, type, message) {
  db.prepare(`INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)`).run(userId, type, message);
}

module.exports = { notify };
