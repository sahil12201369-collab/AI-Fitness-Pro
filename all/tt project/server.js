try { require("dotenv").config(); } catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const path = require("node:path");
const fs = require("node:fs");
const { rateLimit } = require("express-rate-limit");
const { initializeDatabase, database } = require("./src/db");
const { SqliteSessionStore } = require("./src/session-store");
const { safeEqual } = require("./src/middleware");
const authRoutes = require("./src/routes/auth");
const itemRoutes = require("./src/routes/items");
const rentalRoutes = require("./src/routes/rentals");
const dashboardRoutes = require("./src/routes/dashboard");
const reviewRoutes = require("./src/routes/reviews");
const adminRoutes = require("./src/routes/admin");

initializeDatabase();
const app = express();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
fs.mkdirSync(uploadDir, { recursive: true });

app.disable("x-powered-by");
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      ...(process.env.NODE_ENV === "production" ? { upgradeInsecureRequests: [] } : {})
    }
  }
}));
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));
app.use(session({
  name: "borrowbox.sid",
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? undefined : "local-development-secret-change-before-deploy"),
  store: new SqliteSessionStore({ db: database }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use("/api", (req, res, next) => {
  if (!writeMethods.has(req.method)) return next();
  const token = req.get("x-csrf-token");
  if (!safeEqual(token, req.session.csrfToken)) return res.status(403).json({ error: "Invalid or missing CSRF token. Refresh and try again." });
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." }
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.get("/api/csrf", (req, res) => {
  const crypto = require("node:crypto");
  req.session.csrfToken ||= crypto.randomBytes(32).toString("hex");
  res.json({ csrfToken: req.session.csrfToken });
});
app.use("/uploads", express.static(uploadDir, { dotfiles: "deny", index: false, maxAge: "1d" }));

app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/rentals", rentalRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.get("/{*path}", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Image must be 5 MB or smaller." });
  if (err.code === "LIMIT_UNEXPECTED_FILE") return res.status(400).json({ error: "Only one image can be uploaded at a time." });
  const status = Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: status === 500 ? "An unexpected server error occurred." : err.message });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`BorrowBox is running at http://localhost:${port}`));
}

module.exports = app;
