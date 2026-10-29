const express = require("express");
const { database: db } = require("../db");
const { requireAuth, validDate, notify, refreshOverdue } = require("../middleware");

const router = express.Router();
const rentalFields = `rr.*,i.title AS item_title,i.image_path,i.owner_id,i.location AS item_location,owner.name AS owner_name,renter.name AS renter_name`;
const rentalJoins = `FROM rental_requests rr JOIN items i ON i.id=rr.item_id JOIN users owner ON owner.id=i.owner_id JOIN users renter ON renter.id=rr.renter_id`;

router.post("/", requireAuth, (req, res) => {
  const itemId = Number(req.body.item_id);
  const start = req.body.start_date;
  const end = req.body.end_date;
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!Number.isSafeInteger(itemId) || itemId < 1) return res.status(400).json({ error: "Choose a valid listing." });
  if (!validDate(start) || !validDate(end) || start < new Date().toISOString().slice(0, 10) || end < start) return res.status(400).json({ error: "Choose valid future rental dates. The end date must be on or after the start date." });
  if (message.length < 5 || message.length > 1000) return res.status(400).json({ error: "Your message must be 5–1,000 characters." });
  const item = db.prepare("SELECT * FROM items WHERE id=? AND is_active=1").get(itemId);
  if (!item) return res.status(404).json({ error: "This listing is not available." });
  if (item.owner_id === req.session.user.id) return res.status(403).json({ error: "You cannot request your own listing." });
  if ((item.available_from && start < item.available_from) || (item.available_to && end > item.available_to)) return res.status(409).json({ error: "Those dates are outside the listing's availability window." });
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  const createRequest = db.transaction(() => {
    const result = db.prepare("INSERT INTO rental_requests(item_id,renter_id,start_date,end_date,message,rental_cost,deposit_amount) VALUES(?,?,?,?,?,?,?)")
      .run(itemId, req.session.user.id, start, end, message, days * item.daily_price, item.deposit_amount);
    notify(db, item.owner_id, `New rental request for “${item.title}”.`);
    return result;
  });
  const result = createRequest();
  const rental = db.prepare(`SELECT ${rentalFields} ${rentalJoins} WHERE rr.id=?`).get(result.lastInsertRowid);
  res.status(201).json({ rental, days, end_date_inclusive: true });
});

router.get("/", requireAuth, (req, res) => {
  refreshOverdue(db);
  const userId = req.session.user.id;
  const rentals = db.prepare(`SELECT ${rentalFields} ${rentalJoins} WHERE rr.renter_id=? OR i.owner_id=? ORDER BY rr.created_at DESC`).all(userId, userId);
  res.json({ rentals });
});

router.patch("/:id/approve", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const approve = db.transaction(() => {
    const rental = db.prepare(`SELECT ${rentalFields} ${rentalJoins} WHERE rr.id=?`).get(id);
    if (!rental) return { status: 404, error: "Rental request not found." };
    if (rental.owner_id !== req.session.user.id) return { status: 403, error: "Only the listing owner can decide this request." };
    if (rental.status !== "pending") return { status: 409, error: "Only pending requests can be approved." };
    if (typeof req.body.approve !== "boolean") return { status: 400, error: "Set approve to true or false." };
    if (req.body.approve) {
      const item = db.prepare("SELECT is_active FROM items WHERE id=?").get(rental.item_id);
      if (!item?.is_active) return { status: 409, error: "This listing is inactive." };
      const conflict = db.prepare(`SELECT 1 FROM rental_requests WHERE item_id=? AND id<>? AND status IN ('approved','picked_up','overdue') AND start_date<=? AND end_date>=? LIMIT 1`)
        .get(rental.item_id, id, rental.end_date, rental.start_date);
      if (conflict) return { status: 409, error: "Those dates overlap an existing approved rental." };
      db.prepare("UPDATE rental_requests SET status='approved',deposit_refund_status=CASE WHEN deposit_amount>0 THEN 'held' ELSE 'not_applicable' END,updated_at=datetime('now') WHERE id=?").run(id);
      notify(db, rental.renter_id, `Your request for “${rental.item_title}” was approved.`);
    } else {
      db.prepare("UPDATE rental_requests SET status='rejected',updated_at=datetime('now') WHERE id=?").run(id);
      notify(db, rental.renter_id, `Your request for “${rental.item_title}” was declined.`);
    }
    return { status: 200, rental: db.prepare(`SELECT ${rentalFields} ${rentalJoins} WHERE rr.id=?`).get(id) };
  });
  const result = approve.immediate();
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ rental: result.rental });
});

router.patch("/:id/cancel", requireAuth, (req, res) => {
  const rental = db.prepare(`SELECT ${rentalFields} ${rentalJoins} WHERE rr.id=?`).get(Number(req.params.id));
  if (!rental) return res.status(404).json({ error: "Rental request not found." });
  if (rental.renter_id !== req.session.user.id) return res.status(403).json({ error: "Only the renter can cancel this request." });
  if (!["pending", "approved"].includes(rental.status)) return res.status(409).json({ error: "This rental can no longer be cancelled." });
  db.prepare("UPDATE rental_requests SET status='cancelled',deposit_refund_status=CASE WHEN deposit_refund_status='held' THEN 'refunded' ELSE deposit_refund_status END,updated_at=datetime('now') WHERE id=?").run(rental.id);
  notify(db, rental.owner_id, `A rental request for “${rental.item_title}” was cancelled.`);
  res.json({ ok: true, status: "cancelled" });
});

router.patch("/:id/pickup", requireAuth, (req, res) => {
  const rental = db.prepare(`SELECT ${rentalFields} ${rentalJoins} WHERE rr.id=?`).get(Number(req.params.id));
  if (!rental) return res.status(404).json({ error: "Rental request not found." });
  if (rental.owner_id !== req.session.user.id) return res.status(403).json({ error: "Only the listing owner can confirm pickup." });
  if (rental.status !== "approved") return res.status(409).json({ error: "Only approved rentals can be picked up." });
  if (rental.start_date > new Date().toISOString().slice(0, 10)) return res.status(409).json({ error: "Pickup can only be confirmed on or after the start date." });
  db.prepare("UPDATE rental_requests SET status='picked_up',updated_at=datetime('now') WHERE id=?").run(rental.id);
  notify(db, rental.renter_id, `Pickup was confirmed for “${rental.item_title}”.`);
  res.json({ ok: true, status: "picked_up" });
});

router.patch("/:id/return", requireAuth, (req, res) => {
  const rental = db.prepare(`SELECT ${rentalFields} ${rentalJoins} WHERE rr.id=?`).get(Number(req.params.id));
  if (!rental) return res.status(404).json({ error: "Rental request not found." });
  if (rental.renter_id !== req.session.user.id) return res.status(403).json({ error: "Only the renter can confirm return." });
  refreshOverdue(db);
  const current = db.prepare("SELECT status FROM rental_requests WHERE id=?").get(rental.id);
  if (!["picked_up", "overdue"].includes(current.status)) return res.status(409).json({ error: "Only picked-up rentals can be returned." });
  db.prepare("UPDATE rental_requests SET status='returned',deposit_refund_status=CASE WHEN deposit_amount>0 THEN 'refunded' ELSE 'not_applicable' END,updated_at=datetime('now') WHERE id=?").run(rental.id);
  notify(db, rental.owner_id, `“${rental.item_title}” was marked returned. The recorded deposit can now be refunded.`);
  res.json({ ok: true, status: "returned", deposit_refund_status: rental.deposit_amount > 0 ? "refunded" : "not_applicable" });
});

module.exports = router;
