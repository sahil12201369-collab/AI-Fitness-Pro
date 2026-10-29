const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const filename = path.resolve(process.env.DATABASE_FILE || "./data/borrowbox.sqlite");
fs.mkdirSync(path.dirname(filename), { recursive: true });
const database = new Database(filename);
database.pragma("foreign_keys = ON");
database.pragma("journal_mode = WAL");
database.pragma("busy_timeout = 5000");

function initializeDatabase(db = database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      location TEXT NOT NULL DEFAULT '',
      contact_preference TEXT NOT NULL DEFAULT 'platform' CHECK(contact_preference IN ('platform','email')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
      description TEXT NOT NULL CHECK(length(description) BETWEEN 10 AND 3000),
      category TEXT NOT NULL,
      daily_price REAL NOT NULL CHECK(daily_price >= 0),
      deposit_amount REAL NOT NULL DEFAULT 0 CHECK(deposit_amount >= 0),
      location TEXT NOT NULL CHECK(length(location) BETWEEN 2 AND 120),
      image_path TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      available_from TEXT,
      available_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK(available_from IS NULL OR available_to IS NULL OR available_from <= available_to)
    );
    CREATE TABLE IF NOT EXISTS rental_requests (
      id INTEGER PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
      renter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      message TEXT NOT NULL CHECK(length(message) BETWEEN 5 AND 1000),
      rental_cost REAL NOT NULL CHECK(rental_cost >= 0),
      deposit_amount REAL NOT NULL CHECK(deposit_amount >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled','picked_up','returned','overdue')),
      deposit_refund_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK(deposit_refund_status IN ('not_applicable','held','refunded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK(start_date <= end_date)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY,
      rental_request_id INTEGER NOT NULL UNIQUE REFERENCES rental_requests(id) ON DELETE CASCADE,
      reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewed_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL CHECK(length(comment) BETWEEN 2 AND 1000),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_active_category ON items(is_active, category);
    CREATE INDEX IF NOT EXISTS idx_items_owner ON items(owner_id);
    CREATE INDEX IF NOT EXISTS idx_items_price ON items(daily_price);
    CREATE INDEX IF NOT EXISTS idx_rentals_item_dates_status ON rental_requests(item_id, start_date, end_date, status);
    CREATE INDEX IF NOT EXISTS idx_rentals_renter ON rental_requests(renter_id, status);
    CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(reviewed_user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);
}

module.exports = { database, initializeDatabase };
