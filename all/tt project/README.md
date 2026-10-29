# BorrowBox

BorrowBox is a local-first neighborhood rental and sharing marketplace built with HTML, CSS, vanilla JavaScript, Node.js, Express, and SQLite. It has no paid API or external service dependency. Uploaded listing photos and the SQLite database are stored on your computer.

## Requirements and setup (macOS)

Use Node.js 20 or newer. From the project folder in the VS Code terminal:

```sh
npm install
cp .env.example .env
npm run seed
npm start
```

Open [http://localhost:3000](http://localhost:3000). `npm run seed` initializes the schema and adds clearly identified demo accounts and listings. It is safe to run more than once. Demo passwords are for local development only; change them before sharing a deployment.

Seeded accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@borrowbox.local` | `ChangeMe123!` |
| Neighbor | `maya@borrowbox.local` | `Neighbor123!` |
| Neighbor | `jordan@borrowbox.local` | `Neighbor123!` |

Set `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` in `.env` before seeding to choose the admin credentials. Set `SESSION_SECRET` to a long random value and `NODE_ENV=production` when deploying behind HTTPS. In production, session cookies are marked secure. Local HTTP development uses non-secure, HTTP-only, SameSite=Lax cookies.

## Useful commands

```sh
npm start       # run the app at http://localhost:3000
npm run dev     # restart the server when source files change
npm run seed    # initialize the database and add demo data
npm test        # run API integration tests
```

The database defaults to `./data/borrowbox.sqlite`; configure `DATABASE_FILE` and `UPLOAD_DIR` to change local storage paths. Neither the database, uploaded files, `.env`, nor dependency folders are tracked by git.

## How rentals work

Rental dates are **inclusive**: a request from July 10 through July 12 is three days, and the rental total is daily price × 3. The listing's refundable deposit is recorded as an amount only; BorrowBox does not collect, hold, or transfer money. Approving a request records the deposit as held; a renter-confirmed return records it as refunded. These are tracking labels, not payment processing. A user's email is shared with the other rental participant only after approval and only when that user opts in via profile preferences.

The owner approves or declines a pending request and confirms pickup on or after the start date. The renter can cancel pending/approved requests and confirms the return. Picked-up rentals past their inclusive return date become overdue when dashboard, rental, or admin data is requested. An approved, picked-up, or overdue rental blocks overlapping approved dates; approval checks and records this within a SQLite write transaction.

## REST API

JSON errors use `{ "error": "..." }`. Authentication uses an HTTP-only session cookie. Fetch `GET /api/csrf` first and send its `csrfToken` as `X-CSRF-Token` for every state-changing request, including login and registration. Successful login/registration responds with a replacement CSRF token because the session is regenerated.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health`, `/api/csrf`, `/api/auth/me` | Health, CSRF token, current user |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Account and session lifecycle |
| GET/PUT | `/api/auth/profile` | Read/update contact preferences and profile |
| GET | `/api/items?q=&category=&location=&minPrice=&maxPrice=&from=&to=&sort=&page=` | Search, filter, sort, paginate |
| GET | `/api/items/:id`, `/api/items/mine` | Listing and owned listings |
| POST | `/api/items`, PUT `/api/items/:id` | Create/update listing (multipart form, optional `image`) |
| PATCH/DELETE | `/api/items/:id/active`, `/api/items/:id` | Manage an owned listing |
| POST/GET | `/api/rentals` | Create a request / view rentals where the user is a party |
| PATCH | `/api/rentals/:id/approve`, `/cancel`, `/pickup`, `/return` | Authorized rental transitions |
| GET | `/api/dashboard` | Dashboard stats, rentals, listings, notifications |
| POST | `/api/reviews` | Review a returned rental (once, by its renter) |
| GET | `/api/admin` | Admin statistics and moderation list |
| PATCH | `/api/admin/items/:id` | Admin listing moderation |

## Manual acceptance checklist

- Register an account; log out and log back in. Check that bad input, duplicate email, and incorrect password return useful errors.
- Create a listing, edit its price/details, filter/search/sort for it, pause it, and reactivate it. Try editing another user's listing and uploading a non-image.
- Sign in as a different neighbor and request a future date range. Confirm the inclusive-day price and deposit are shown on the dashboard.
- As the owner approve one request and attempt to approve a second overlapping request; the second must be rejected. Try rejecting a separate pending request and canceling one as its renter.
- Confirm pickup on/after its start date as owner, return it as renter, then submit a review. Try submitting a duplicate or reviewing before return.
- Mark a picked-up rental as past due in the local database (`UPDATE rental_requests SET end_date=date('now','-1 day') WHERE id=<id>;`) and open the dashboard to see overdue status. Returned rentals must no longer appear overdue.
- Try owner-only, renter-only, and admin-only operations from the wrong account. Refresh and verify your session survives navigation.

Run the integration suite with `npm test`; it covers authentication, listing CRUD/search, rental lifecycle, conflicting approvals, overdue detection, reviews, authorization, CSRF, and invalid input.

## Project layout

```text
server.js
src/db.js
src/session-store.js
src/middleware.js
src/routes/{auth,items,rentals,dashboard,reviews,admin}.js
public/index.html
public/css/style.css
public/js/app.js
scripts/seed.js
test/api.test.js
```

## Limitations

Deposits and refunds are bookkeeping states, not actual payment processing. There is no email/SMS delivery or external map service; pickup coordination is arranged between neighbors. Listings currently support one optional JPG, PNG, or WebP image up to 5 MB. No automated background job runs; overdue status is refreshed on data requests.
