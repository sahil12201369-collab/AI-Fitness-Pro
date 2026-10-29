const express = require("express");
const { database: db } = require("../db");
const { requireAdmin, refreshOverdue } = require("../middleware");
const router = express.Router();

router.use(requireAdmin);
router.get("/", (_req, res) => {
  refreshOverdue(db);
  const counts = {
    users: db.prepare("SELECT count(*) AS count FROM users").get().count,
    listings: db.prepare("SELECT count(*) AS count FROM items WHERE is_active=1").get().count,
    requests: db.prepare("SELECT count(*) AS count FROM rental_requests").get().count,
    overdue: db.prepare("SELECT count(*) AS count FROM rental_requests WHERE status='overdue'").get().count
  };
  const items = db.prepare("SELECT i.id,i.title,i.category,i.location,i.is_active,u.name AS owner_name FROM items i JOIN users u ON u.id=i.owner_id ORDER BY i.created_at DESC LIMIT 30").all();
  res.json({ counts, items });
});

router.patch("/items/:id", (req, res) => {
  const id = Number(req.params.id);
  if (typeof req.body.active !== "boolean") return res.status(400).json({ error: "active must be true or false." });
  const result = db.prepare("UPDATE items SET is_active=?,updated_at=datetime('now') WHERE id=?").run(req.body.active ? 1 : 0, id);
  if (!result.changes) return res.status(404).json({ error: "Listing not found." });
  res.json({ ok: true, active: req.body.active });
});

module.exports = router;
