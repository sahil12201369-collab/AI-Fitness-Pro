const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "borrowbox-test-"));
process.env.DATABASE_FILE = path.join(temp, "test.sqlite");
process.env.UPLOAD_DIR = path.join(temp, "uploads");
process.env.SESSION_SECRET = "test-session-secret-with-sufficient-length";
process.env.NODE_ENV = "test";
const { initializeDatabase, database: db } = require("../src/db");
initializeDatabase();
const app = require("../server");
const ownerAgent = request.agent(app);
const renterAgent = request.agent(app);
const otherAgent = request.agent(app);
const adminAgent = request.agent(app);
let ownerId;
let renterId;
let itemId;
let firstRentalId;
let alternateRentalId;
const future = (offset) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
async function setupAgent(agent, email, name, role = "user") {
  let token = (await agent.get("/api/csrf").expect(200)).body.csrfToken;
  if (role === "admin") {
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash("AdminPassword123!", 4);
    const result = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)").run(name, email, hash, "admin");
    const login = await agent.post("/api/auth/login").set("X-CSRF-Token", token).send({ email, password: "AdminPassword123!" }).expect(200);
    token = login.body.csrfToken;
    return { token, id: result.lastInsertRowid };
  }
  const response = await agent.post("/api/auth/register").set("X-CSRF-Token", token).send({
    name, email, password: "NeighborPassword123!", location: "Testville"
  }).expect(201);
  return { token: response.body.csrfToken, id: response.body.user.id };
}
function write(agent, token, endpoint, body, method = "post") {
  return agent[method](endpoint).set("X-CSRF-Token", token).send(body);
}

before(async () => {
  const owner = await setupAgent(ownerAgent, "owner@example.test", "Owner Neighbor");
  ownerId = owner.id;
  global.ownerToken = owner.token;
  const renter = await setupAgent(renterAgent, "renter@example.test", "Renter Neighbor");
  renterId = renter.id;
  global.renterToken = renter.token;
  const other = await setupAgent(otherAgent, "other@example.test", "Other Neighbor");
  global.otherToken = other.token;
  const admin = await setupAgent(adminAgent, "admin@example.test", "Admin", "admin");
  global.adminToken = admin.token;
});

after(() => {
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("registration, session persistence, invalid credentials and logout/login", async () => {
  const me = await ownerAgent.get("/api/auth/me").expect(200);
  assert.equal(me.body.user.id, ownerId);
  await ownerAgent.post("/api/auth/logout").set("X-CSRF-Token", global.ownerToken).expect(200);
  await ownerAgent.get("/api/auth/me").expect(200).expect(({ body }) => assert.equal(body.user, null));
  const csrf = (await ownerAgent.get("/api/csrf")).body.csrfToken;
  await ownerAgent.post("/api/auth/login").set("X-CSRF-Token", csrf).send({ email: "owner@example.test", password: "wrong-password" }).expect(401);
  const login = await ownerAgent.post("/api/auth/login").set("X-CSRF-Token", csrf).send({ email: "owner@example.test", password: "NeighborPassword123!" }).expect(200);
  global.ownerToken = login.body.csrfToken;
  assert.equal(login.body.user.password_hash, undefined);
  const duplicate = await write(otherAgent, global.otherToken, "/api/auth/register", { name: "Other", email: "owner@example.test", password: "NeighborPassword123!" });
  assert.equal(duplicate.status, 409);
});

test("CSRF and authenticated listing creation, editing, search, validation and permissions", async () => {
  const noToken = await ownerAgent.post("/api/items").send({});
  assert.equal(noToken.status, 403);
  const created = await write(ownerAgent, global.ownerToken, "/api/items", {
    title: "Community power drill", description: "A sturdy cordless drill with battery and case for home projects.",
    category: "Tools", daily_price: 10, deposit_amount: 30, location: "Testville"
  });
  assert.equal(created.status, 201, created.body.error);
  itemId = created.body.item.id;
  const invalid = await write(ownerAgent, global.ownerToken, "/api/items", {
    title: "x", description: "short", category: "Tools", daily_price: -1, deposit_amount: -1, location: "x"
  });
  assert.equal(invalid.status, 400);
  const edited = await write(ownerAgent, global.ownerToken, `/api/items/${itemId}`, {
    title: "Updated community drill", description: "A sturdy cordless drill with battery, charger and case.",
    category: "Tools", daily_price: 12, deposit_amount: 35, location: "Testville"
  }, "put");
  assert.equal(edited.status, 200);
  assert.equal(edited.body.item.daily_price, 12);
  const results = await renterAgent.get("/api/items?q=Updated&category=Tools&location=Testville&minPrice=10&maxPrice=15&sort=price_low").expect(200);
  assert.equal(results.body.total, 1);
  const forbidden = await write(renterAgent, global.renterToken, `/api/items/${itemId}`, {
    title: "Hacked listing", description: "Attempting to edit another neighbor's listing.",
    category: "Tools", daily_price: 2, deposit_amount: 0, location: "Testville"
  }, "put");
  assert.equal(forbidden.status, 403);
});

test("rental request validation, ownership, approval conflict, rejection and cancellation", async () => {
  const dates = { item_id: itemId, start_date: future(2), end_date: future(3), message: "I would love to borrow it." };
  const own = await write(ownerAgent, global.ownerToken, "/api/rentals", dates);
  assert.equal(own.status, 403);
  const invalid = await write(renterAgent, global.renterToken, "/api/rentals", { ...dates, start_date: "yesterday" });
  assert.equal(invalid.status, 400);
  const first = await write(renterAgent, global.renterToken, "/api/rentals", dates);
  assert.equal(first.status, 201, first.body.error);
  firstRentalId = first.body.rental.id;
  assert.equal(first.body.days, 2);
  assert.equal(first.body.rental.rental_cost, 24);
  const profile = await write(ownerAgent, global.ownerToken, "/api/auth/profile", {
    name: "Owner Neighbor", location: "Testville", contact_preference: "email"
  }, "put");
  assert.equal(profile.body.user.contact_preference, "email");
  const second = await write(otherAgent, global.otherToken, "/api/rentals", { ...dates, message: "Could I borrow the drill?" });
  assert.equal(second.status, 201);
  alternateRentalId = second.body.rental.id;
  assert.equal((await write(renterAgent, global.renterToken, `/api/rentals/${firstRentalId}/approve`, { approve: true }, "patch")).status, 403);
  assert.equal((await write(ownerAgent, global.ownerToken, `/api/rentals/${firstRentalId}/approve`, { approve: "true" }, "patch")).status, 400);
  const approved = await write(ownerAgent, global.ownerToken, `/api/rentals/${firstRentalId}/approve`, { approve: true }, "patch");
  assert.equal(approved.status, 200, approved.body.error);
  await renterAgent.get("/api/dashboard").expect(200).expect(({ body }) => {
    assert.equal(body.outgoing.find(rental => rental.id === firstRentalId).owner_email, "owner@example.test");
  });
  const blockedDates = await renterAgent.get(`/api/items?from=${dates.start_date}&to=${dates.end_date}`).expect(200);
  assert.equal(blockedDates.body.items.some(item => item.id === itemId), false);
  const conflict = await write(ownerAgent, global.ownerToken, `/api/rentals/${alternateRentalId}/approve`, { approve: true }, "patch");
  assert.equal(conflict.status, 409);

  const third = await write(otherAgent, global.otherToken, "/api/rentals", {
    item_id: itemId, start_date: future(7), end_date: future(7), message: "A separate request please."
  });
  assert.equal(third.status, 201);
  const rejected = await write(ownerAgent, global.ownerToken, `/api/rentals/${third.body.rental.id}/approve`, { approve: false }, "patch");
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.rental.status, "rejected");
  const cancel = await write(otherAgent, global.otherToken, `/api/rentals/${alternateRentalId}/cancel`, {}, "patch");
  assert.equal(cancel.status, 200);
  assert.equal((await write(renterAgent, global.renterToken, `/api/rentals/${firstRentalId}/cancel`, {}, "patch")).status, 200);
});

test("pickup, return, overdue status, reviews, and transition permissions", async () => {
  const todayRequest = await write(renterAgent, global.renterToken, "/api/rentals", {
    item_id: itemId, start_date: future(0), end_date: future(0), message: "I can pick up today."
  });
  assert.equal(todayRequest.status, 201);
  const rentalId = todayRequest.body.rental.id;
  await write(ownerAgent, global.ownerToken, `/api/rentals/${rentalId}/approve`, { approve: true }, "patch").expect(200);
  assert.equal((await write(renterAgent, global.renterToken, `/api/rentals/${rentalId}/pickup`, {}, "patch")).status, 403);
  await write(ownerAgent, global.ownerToken, `/api/rentals/${rentalId}/pickup`, {}, "patch").expect(200);
  const beforeReturnReview = await write(renterAgent, global.renterToken, "/api/reviews", { rental_request_id: rentalId, rating: 5, comment: "Good" });
  assert.equal(beforeReturnReview.status, 409);
  await write(renterAgent, global.renterToken, `/api/rentals/${rentalId}/return`, {}, "patch").expect(200);
  const review = await write(renterAgent, global.renterToken, "/api/reviews", { rental_request_id: rentalId, rating: 5, comment: "Friendly neighbor and a great drill." });
  assert.equal(review.status, 201, review.body.error);
  assert.equal((await write(renterAgent, global.renterToken, "/api/reviews", { rental_request_id: rentalId, rating: 5, comment: "Second review." })).status, 409);
  assert.equal((await write(otherAgent, global.otherToken, "/api/reviews", { rental_request_id: rentalId, rating: 4, comment: "Not my rental." })).status, 403);

  const overdueRequest = await write(renterAgent, global.renterToken, "/api/rentals", {
    item_id: itemId, start_date: future(8), end_date: future(9), message: "I'll return after this trip."
  });
  assert.equal(overdueRequest.status, 201);
  await write(ownerAgent, global.ownerToken, `/api/rentals/${overdueRequest.body.rental.id}/approve`, { approve: true }, "patch").expect(200);
  db.prepare("UPDATE rental_requests SET status='picked_up',start_date=date('now','-2 day'),end_date=date('now','-1 day') WHERE id=?").run(overdueRequest.body.rental.id);
  await renterAgent.get("/api/dashboard").expect(200).expect(({ body }) => {
    assert.ok(body.outgoing.some(rental => rental.id === overdueRequest.body.rental.id && rental.status === "overdue"));
    assert.ok(body.stats.overdueRentals > 0);
  });
  await write(renterAgent, global.renterToken, `/api/rentals/${overdueRequest.body.rental.id}/return`, {}, "patch").expect(200);
});

test("admin authorization and moderation", async () => {
  assert.equal((await renterAgent.get("/api/admin")).status, 403);
  assert.equal((await adminAgent.get("/api/admin")).status, 200);
  await write(adminAgent, global.adminToken, `/api/admin/items/${itemId}`, { active: false }, "patch").expect(200);
  await renterAgent.get("/api/items").expect(200).expect(({ body }) => assert.equal(body.items.some(item => item.id === itemId), false));
  await write(adminAgent, global.adminToken, `/api/admin/items/${itemId}`, { active: true }, "patch").expect(200);
});
