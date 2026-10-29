const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const { database: db } = require("../db");
const { requireAuth } = require("../middleware");

const router = express.Router();
const publicUser = ({ id, name, email, role, location, contact_preference, created_at }) =>
  ({ id, name, email, role, location, contact_preference, created_at });

router.post("/register", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body.password;
    const location = typeof req.body.location === "string" ? req.body.location.trim().slice(0, 120) : "";
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be 2–80 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
    if (typeof password !== "string" || password.length < 10 || password.length > 128) return res.status(400).json({ error: "Password must be 10–128 characters." });
    const hash = await bcrypt.hash(password, 12);
    let result;
    try {
      result = db.prepare("INSERT INTO users(name,email,password_hash,location) VALUES(?,?,?,?)").run(name, email, hash, location);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "An account with that email already exists." });
      throw error;
    }
    const user = publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid));
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = user;
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
      res.status(201).json({ user, csrfToken: req.session.csrfToken });
    });
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body.password;
    if (!email || typeof password !== "string") return res.status(400).json({ error: "Email and password are required." });
    const row = db.prepare("SELECT * FROM users WHERE email=?").get(email);
    const match = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!match) return res.status(401).json({ error: "Email or password is incorrect." });
    const user = publicUser(row);
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = user;
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
      res.json({ user, csrfToken: req.session.csrfToken });
    });
  } catch (error) { next(error); }
});

router.post("/logout", requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("borrowbox.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => res.json({ user: req.session.user || null }));

router.get("/profile", requireAuth, (req, res) => {
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.session.user.id)) });
});

router.put("/profile", requireAuth, (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const location = typeof req.body.location === "string" ? req.body.location.trim() : "";
  const preference = req.body.contact_preference;
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Name must be 2–80 characters." });
  if (location.length > 120 || !["platform", "email"].includes(preference)) return res.status(400).json({ error: "Check your location and contact preference." });
  db.prepare("UPDATE users SET name=?, location=?, contact_preference=? WHERE id=?").run(name, location, preference, req.session.user.id);
  req.session.user = { ...req.session.user, name, location, contact_preference: preference };
  res.json({ user: req.session.user });
});

module.exports = router;
