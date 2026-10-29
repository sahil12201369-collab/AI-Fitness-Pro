const express = require("express");
const { database: db } = require("../db");
const { requireAuth } = require("../middleware");
const router = express.Router();

router.post("/", requireAuth, (req, res) => {
  const rentalId = Number(req.body.rental_request_id);
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
  if (!Number.isSafeInteger(rentalId) || rentalId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 2 || comment.length > 1000) return res.status(400).json({ error: "Provide a rental, a 1–5 star rating, and a 2–1,000 character review." });
  const rental = db.prepare("SELECT rr.*,i.owner_id FROM rental_requests rr JOIN items i ON i.id=rr.item_id WHERE rr.id=?").get(rentalId);
  if (!rental) return res.status(404).json({ error: "Rental not found." });
  if (rental.renter_id !== req.session.user.id) return res.status(403).json({ error: "Only the renter can review this rental." });
  if (rental.status !== "returned") return res.status(409).json({ error: "Reviews are available after the item is returned." });
  try {
    const result = db.prepare("INSERT INTO reviews(rental_request_id,reviewer_id,reviewed_user_id,rating,comment) VALUES(?,?,?,?,?)")
      .run(rentalId, req.session.user.id, rental.owner_id, rating, comment);
    res.status(201).json({ id: result.lastInsertRowid, message: "Thanks for helping the community!" });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "You have already reviewed this rental." });
    throw error;
  }
});

module.exports = router;
