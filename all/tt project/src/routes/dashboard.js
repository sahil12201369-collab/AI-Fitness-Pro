const express = require("express");
const { database: db } = require("../db");
const { requireAuth, refreshOverdue } = require("../middleware");
const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  refreshOverdue(db);
  const id = req.session.user.id;
  const incoming = db.prepare(`SELECT rr.id,rr.item_id,rr.renter_id,rr.start_date,rr.end_date,rr.message,rr.rental_cost,rr.deposit_amount,rr.status,rr.deposit_refund_status,rr.created_at,i.title AS item_title,i.image_path,r.name AS renter_name,CASE WHEN rr.status IN ('approved','picked_up','overdue','returned') AND r.contact_preference='email' THEN r.email ELSE NULL END AS renter_email FROM rental_requests rr JOIN items i ON i.id=rr.item_id JOIN users r ON r.id=rr.renter_id WHERE i.owner_id=? ORDER BY rr.created_at DESC`).all(id);
  const outgoing = db.prepare(`SELECT rr.id,rr.item_id,rr.renter_id,rr.start_date,rr.end_date,rr.message,rr.rental_cost,rr.deposit_amount,rr.status,rr.deposit_refund_status,rr.created_at,i.title AS item_title,i.image_path,o.name AS owner_name,CASE WHEN rr.status IN ('approved','picked_up','overdue','returned') AND o.contact_preference='email' THEN o.email ELSE NULL END AS owner_email FROM rental_requests rr JOIN items i ON i.id=rr.item_id JOIN users o ON o.id=i.owner_id WHERE rr.renter_id=? ORDER BY rr.created_at DESC`).all(id);
  const listings = db.prepare("SELECT * FROM items WHERE owner_id=? ORDER BY created_at DESC LIMIT 8").all(id);
  const notifications = db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 8").all(id);
  res.json({ incoming, outgoing, listings, notifications, stats: {
    activeRentals: outgoing.filter(r => ["approved", "picked_up", "overdue"].includes(r.status)).length,
    pendingRequests: incoming.filter(r => r.status === "pending").length,
    activeListings: listings.filter(item => item.is_active).length,
    overdueRentals: incoming.concat(outgoing).filter(r => r.status === "overdue").length
  } });
});

module.exports = router;
