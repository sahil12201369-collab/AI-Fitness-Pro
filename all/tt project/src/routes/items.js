const express = require("express");
const multer = require("multer");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { database: db } = require("../db");
const { requireAuth, validDate } = require("../middleware");

const router = express.Router();
const categories = ["Books", "Tools", "Sports", "Cameras", "Electronics", "Home & Garden", "Other"];
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] };
    if (!allowed[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) {
      return cb(Object.assign(new Error("Upload a JPG, PNG, or WebP image."), { status: 400 }));
    }
    cb(null, true);
  }
});

const itemFields = `i.id,i.owner_id,i.title,i.description,i.category,i.daily_price,i.deposit_amount,i.location,i.image_path,i.is_active,i.available_from,i.available_to,i.created_at,i.updated_at,u.name AS owner_name,u.location AS owner_location,COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.reviewed_user_id=u.id),0) AS owner_rating`;
function parseItem(body) {
  const v = (key) => typeof body[key] === "string" ? body[key].trim() : body[key];
  const item = {
    title: v("title"), description: v("description"), category: v("category"),
    daily_price: Number(v("daily_price")), deposit_amount: Number(v("deposit_amount")),
    location: v("location"), available_from: v("available_from") || null, available_to: v("available_to") || null
  };
  if (typeof item.title !== "string" || item.title.length < 3 || item.title.length > 100) return "Title must be 3–100 characters.";
  if (typeof item.description !== "string" || item.description.length < 10 || item.description.length > 3000) return "Description must be 10–3,000 characters.";
  if (!categories.includes(item.category)) return "Choose a valid category.";
  if (!Number.isFinite(item.daily_price) || item.daily_price < 0 || item.daily_price > 10000) return "Daily price must be between $0 and $10,000.";
  if (!Number.isFinite(item.deposit_amount) || item.deposit_amount < 0 || item.deposit_amount > 100000) return "Deposit must be between $0 and $100,000.";
  if (typeof item.location !== "string" || item.location.length < 2 || item.location.length > 120) return "Location must be 2–120 characters.";
  if ((item.available_from && !validDate(item.available_from)) || (item.available_to && !validDate(item.available_to)) ||
      (item.available_from && item.available_to && item.available_from > item.available_to)) return "Enter a valid availability date range.";
  return item;
}

function verifyImage(req, res, next) {
  if (!req.file) return next();
  const buffer = fs.readFileSync(req.file.path);
  const valid = req.file.mimetype === "image/jpeg" ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : req.file.mimetype === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : req.file.mimetype === "image/webp" ? buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"
        : false;
  if (!valid) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "The image contents do not match a supported JPG, PNG, or WebP format." });
  }
  next();
}

router.get("/", (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const category = categories.includes(req.query.category) ? req.query.category : "";
  const location = typeof req.query.location === "string" ? req.query.location.trim().slice(0, 100) : "";
  const min = req.query.minPrice === undefined ? null : Number(req.query.minPrice);
  const max = req.query.maxPrice === undefined ? null : Number(req.query.maxPrice);
  const from = req.query.from || "";
  const to = req.query.to || "";
  const sortMap = { newest: "i.created_at DESC", price_low: "i.daily_price ASC", price_high: "i.daily_price DESC", popular: "owner_rating DESC, i.created_at DESC" };
  const sort = sortMap[req.query.sort] || sortMap.newest;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(24, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0)) ||
    (min !== null && max !== null && min > max) || (from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
    return res.status(400).json({ error: "Invalid price range or availability date." });
  }
  const conditions = ["i.is_active=1"];
  const values = [];
  if (query) { conditions.push("(i.title LIKE ? OR i.description LIKE ? OR i.category LIKE ?)"); values.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  if (category) { conditions.push("i.category=?"); values.push(category); }
  if (location) { conditions.push("i.location LIKE ?"); values.push(`%${location}%`); }
  if (min !== null) { conditions.push("i.daily_price>=?"); values.push(min); }
  if (max !== null) { conditions.push("i.daily_price<=?"); values.push(max); }
  if (from) { conditions.push("(i.available_from IS NULL OR i.available_from<=?)"); values.push(from); }
  if (to) { conditions.push("(i.available_to IS NULL OR i.available_to>=?)"); values.push(to); }
  if (from || to) {
    conditions.push("NOT EXISTS (SELECT 1 FROM rental_requests booked WHERE booked.item_id=i.id AND booked.status IN ('approved','picked_up','overdue') AND booked.start_date<=? AND booked.end_date>=?)");
    values.push(to || from, from || to);
  }
  if (req.query.featured === "1") conditions.push("i.created_at>=datetime('now','-30 days')");
  const where = conditions.join(" AND ");
  const total = db.prepare(`SELECT count(*) AS count FROM items i WHERE ${where}`).get(...values).count;
  const items = db.prepare(`SELECT ${itemFields} FROM items i JOIN users u ON u.id=i.owner_id WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`)
    .all(...values, limit, (page - 1) * limit);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit), categories });
});

router.get("/mine", requireAuth, (req, res) => {
  const items = db.prepare(`SELECT ${itemFields} FROM items i JOIN users u ON u.id=i.owner_id WHERE i.owner_id=? ORDER BY i.created_at DESC`).all(req.session.user.id);
  res.json({ items });
});

router.get("/:id", (req, res) => {
  const item = db.prepare(`SELECT ${itemFields} FROM items i JOIN users u ON u.id=i.owner_id WHERE i.id=?`).get(Number(req.params.id));
  if (!item || (!item.is_active && item.owner_id !== req.session.user?.id && req.session.user?.role !== "admin")) return res.status(404).json({ error: "Listing not found." });
  const reviews = db.prepare("SELECT r.rating,r.comment,r.created_at,u.name AS reviewer_name FROM reviews r JOIN users u ON u.id=r.reviewer_id JOIN rental_requests rr ON rr.id=r.rental_request_id WHERE rr.item_id=? ORDER BY r.created_at DESC LIMIT 10").all(item.id);
  res.json({ item, reviews });
});

router.post("/", requireAuth, upload.single("image"), verifyImage, (req, res, next) => saveItem(req, res, next, false));
router.put("/:id", requireAuth, upload.single("image"), verifyImage, (req, res, next) => saveItem(req, res, next, true));

function saveItem(req, res, next, editing) {
  const item = parseItem(req.body);
  if (typeof item === "string") {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: item });
  }
  try {
    const id = Number(req.params.id);
    let old;
    if (editing) {
      old = db.prepare("SELECT * FROM items WHERE id=?").get(id);
      if (!old) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Listing not found." });
      }
      if (old.owner_id !== req.session.user.id && req.session.user.role !== "admin") {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ error: "You can only edit your own listings." });
      }
    }
    const imagePath = req.file ? `/uploads/${path.basename(req.file.filename)}` : old?.image_path || null;
    if (editing) {
      db.prepare(`UPDATE items SET title=?,description=?,category=?,daily_price=?,deposit_amount=?,location=?,available_from=?,available_to=?,image_path=?,updated_at=datetime('now') WHERE id=?`)
        .run(item.title, item.description, item.category, item.daily_price, item.deposit_amount, item.location, item.available_from, item.available_to, imagePath, id);
    } else {
      const result = db.prepare(`INSERT INTO items(owner_id,title,description,category,daily_price,deposit_amount,location,available_from,available_to,image_path) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(req.session.user.id, item.title, item.description, item.category, item.daily_price, item.deposit_amount, item.location, item.available_from, item.available_to, imagePath);
      req.params.id = String(result.lastInsertRowid);
    }
    const saved = db.prepare(`SELECT ${itemFields} FROM items i JOIN users u ON u.id=i.owner_id WHERE i.id=?`).get(Number(req.params.id));
    res.status(editing ? 200 : 201).json({ item: saved });
  } catch (error) { next(error); }
}

router.patch("/:id/active", requireAuth, (req, res) => {
  if (typeof req.body.active !== "boolean") return res.status(400).json({ error: "active must be true or false." });
  const item = db.prepare("SELECT * FROM items WHERE id=?").get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Listing not found." });
  if (item.owner_id !== req.session.user.id && req.session.user.role !== "admin") return res.status(403).json({ error: "You can only manage your own listings." });
  if (!req.body.active && db.prepare("SELECT 1 FROM rental_requests WHERE item_id=? AND status IN ('approved','picked_up','overdue') LIMIT 1").get(item.id)) return res.status(409).json({ error: "This item has an active rental and cannot be deactivated." });
  db.prepare("UPDATE items SET is_active=?,updated_at=datetime('now') WHERE id=?").run(req.body.active ? 1 : 0, item.id);
  res.json({ ok: true, active: req.body.active });
});

router.delete("/:id", requireAuth, (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id=?").get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Listing not found." });
  if (item.owner_id !== req.session.user.id && req.session.user.role !== "admin") return res.status(403).json({ error: "You can only remove your own listings." });
  if (db.prepare("SELECT 1 FROM rental_requests WHERE item_id=? LIMIT 1").get(item.id)) return res.status(409).json({ error: "Listings with rental history cannot be deleted. Deactivate the listing instead." });
  db.prepare("DELETE FROM items WHERE id=?").run(item.id);
  res.json({ ok: true });
});

module.exports = router;
