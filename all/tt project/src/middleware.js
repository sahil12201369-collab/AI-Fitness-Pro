const crypto = require("node:crypto");

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") return res.status(403).json({ error: "Administrator access is required." });
  next();
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function safeEqual(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function notify(db, userId, message) {
  db.prepare("INSERT INTO notifications(user_id,message) VALUES(?,?)").run(userId, message);
}

function refreshOverdue(db) {
  db.prepare("UPDATE rental_requests SET status='overdue', updated_at=datetime('now') WHERE status='picked_up' AND end_date < date('now')").run();
}

module.exports = { requireAuth, requireAdmin, validDate, safeEqual, notify, refreshOverdue };
