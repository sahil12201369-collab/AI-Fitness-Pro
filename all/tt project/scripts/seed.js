require("dotenv").config();
const bcrypt = require("bcryptjs");
const { database: db, initializeDatabase } = require("../src/db");

async function seed() {
  initializeDatabase();
  const password = process.env.DEMO_ADMIN_PASSWORD || "ChangeMe123!";
  const hash = await bcrypt.hash(password, 12);
  const addUser = db.prepare("INSERT INTO users(name,email,password_hash,role,location) VALUES(?,?,?,?,?) ON CONFLICT(email) DO NOTHING");
  addUser.run("BorrowBox Admin", process.env.DEMO_ADMIN_EMAIL || "admin@borrowbox.local", hash, "admin", "Portland");
  const addDemoUser = db.prepare("INSERT INTO users(name,email,password_hash,location) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING");
  const demoHash = await bcrypt.hash("Neighbor123!", 12);
  addDemoUser.run("Maya Chen", "maya@borrowbox.local", demoHash, "Portland");
  addDemoUser.run("Jordan Lee", "jordan@borrowbox.local", demoHash, "Portland");
  const owner = db.prepare("SELECT id FROM users WHERE email='maya@borrowbox.local'").get().id;
  const addItem = db.prepare(`INSERT INTO items(owner_id,title,description,category,daily_price,deposit_amount,location,available_from,available_to) SELECT ?,?,?,?,?,?,?,date('now'),date('now','+180 days') WHERE NOT EXISTS(SELECT 1 FROM items WHERE title=?)`);
  [
    ["Cordless drill kit", "A reliable drill and driver set with two batteries, charger, and a tidy case. Great for weekend home projects.", "Tools", 12, 35, "Portland, OR"],
    ["Instant film camera", "A beginner-friendly instant camera, carefully stored and ready for your next celebration or creative project.", "Cameras", 9, 25, "Portland, OR"],
    ["Weekend camping tent", "Roomy, weather-ready two-person tent with footprint. Easy to set up and freshly cleaned after each trip.", "Sports", 15, 50, "Portland, OR"],
    ["Beginner telescope", "A portable tabletop telescope with tripod and a quick-start guide for stargazing nights.", "Other", 8, 20, "Portland, OR"],
    ["Portable projector", "Compact HD projector with HDMI cable and carry pouch for backyard movies and presentations.", "Electronics", 18, 60, "Portland, OR"],
    ["The neighborhood cookbook", "A much-loved collection of seasonal recipes. Borrow it for inspiration and return it in the same condition.", "Books", 2, 0, "Portland, OR"]
  ].forEach(([title, description, category, price, deposit, location]) =>
    addItem.run(owner, title, description, category, price, deposit, location, title));
  console.log("Seed complete. Admin: " + (process.env.DEMO_ADMIN_EMAIL || "admin@borrowbox.local") + " / " + password);
  console.log("Demo renter: maya@borrowbox.local / Neighbor123! and jordan@borrowbox.local / Neighbor123!");
  db.close();
}

seed().catch((error) => { console.error(error); process.exitCode = 1; });
