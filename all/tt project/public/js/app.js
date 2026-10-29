(() => {
  "use strict";

  const app = document.querySelector("#app");
  let user = null;
  let csrfToken = "";
  let toastTimer;
  const categories = ["Books", "Tools", "Sports", "Cameras", "Electronics", "Home & Garden", "Other"];
  const categoryEmoji = { Books: "📚", Tools: "🛠️", Sports: "🚲", Cameras: "📷", Electronics: "🎧", "Home & Garden": "🪴", Other: "🧺" };
  const params = () => new URLSearchParams(location.search);
  const page = () => params().get("page") || "home";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const money = (value) => `$${Number(value || 0).toFixed(Number(value) % 1 ? 2 : 0)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const url = (target, values = {}) => {
    const query = new URLSearchParams({ page: target, ...values });
    return `/?${query.toString()}`;
  };
  function notify(message, error = false) {
    const node = document.querySelector("#toast");
    node.textContent = message;
    node.classList.toggle("error", error);
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
  }
  async function api(endpoint, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrfToken && options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())) headers.set("X-CSRF-Token", csrfToken);
    if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(endpoint, { credentials: "same-origin", ...options, headers });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      if (response.status === 401 && page() !== "login" && page() !== "register") user = null;
      throw new Error(data.error || `Request failed (${response.status}).`);
    }
    return data;
  }
  async function init() {
    const [csrf, me] = await Promise.all([api("/api/csrf"), api("/api/auth/me")]);
    csrfToken = csrf.csrfToken;
    user = me.user;
    await render();
  }
  function renderHeader() {
    const active = page();
    const link = (target, text) => `<a href="${url(target)}" class="${active === target ? "active" : ""}">${text}</a>`;
    document.querySelector("#site-header").innerHTML = `
      <nav class="topbar"><div class="nav-wrap">
        <a class="brand" href="${url("home")}"><span class="brand-mark">B</span>BorrowBox</a>
        <div class="nav-links">${link("browse", "Browse items")}${user ? link("dashboard", "Dashboard") : ""}<a href="${url("home")}#how">How it works</a></div>
        <div class="nav-actions">${user
          ? `<a class="btn btn-light" href="${url("new-listing")}">＋ List an item</a><a class="btn btn-primary" href="${url("dashboard")}">${escapeHtml(user.name.split(" ")[0])} ↗</a>`
          : `<a class="btn btn-light" href="${url("login")}">Log in</a><a class="btn btn-primary" href="${url("register")}">Join BorrowBox</a>`}
          <button class="mobile-toggle" type="button" aria-label="Toggle navigation" data-action="mobile-menu">☰</button>
        </div>
        <div class="mobile-nav">${link("browse", "Browse items")}${user ? `${link("dashboard", "Dashboard")}${link("new-listing", "List an item")}${link("my-listings", "My listings")}${link("profile", "Profile")}` : `${link("login", "Log in")}${link("register", "Create an account")}`}${user?.role === "admin" ? link("admin", "Admin dashboard") : ""}</div>
      </div></nav>`;
  }
  function renderFooter() {
    document.querySelector("#site-footer").innerHTML = `<footer class="footer"><div class="container">
      <div class="footer-inner"><div><a class="brand" href="${url("home")}" style="color:white"><span class="brand-mark" style="background:#fff;color:var(--green)">B</span>BorrowBox</a><p>A little more sharing makes a whole lot more neighborhood. Find what you need, lend what you love.</p></div>
      <div class="footer-links"><a href="${url("browse")}">Explore items</a><a href="${url(user ? "new-listing" : "register")}">List something</a><a href="${url("dashboard")}">Your rentals</a></div></div>
      <div class="footer-bottom">© ${new Date().getFullYear()} BorrowBox · Made for neighbors, not transactions.</div>
    </div></footer>`;
  }
  function itemCard(item) {
    const image = item.image_path
      ? `<img src="${escapeHtml(item.image_path)}" alt="${escapeHtml(item.title)}" loading="lazy">`
      : `<span class="placeholder" aria-hidden="true">${categoryEmoji[item.category] || "🧺"}</span>`;
    return `<a class="item-card" href="${url("item", { id: item.id })}"><div class="item-image">${image}<span class="item-category">${escapeHtml(item.category)}</span></div>
      <div class="item-body"><div class="item-location">⌖ ${escapeHtml(item.location)}</div><div class="item-title">${escapeHtml(item.title)}</div>
      <div class="item-meta"><span>★ ${Number(item.owner_rating || 0).toFixed(1)} · ${escapeHtml(item.owner_name || "Neighbor")}</span><span class="price">${money(item.daily_price)}<small style="font-size:11px;font-weight:500;color:var(--muted)"> / day</small></span></div></div></a>`;
  }
  function empty(icon, title, copy, action = "") {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p>${action}</div>`;
  }
  async function home() {
    const { items } = await api("/api/items?limit=3&sort=popular");
    app.innerHTML = `<section class="hero"><div class="container hero-grid"><div><div class="eyebrow">Good things are closer than you think</div>
      <h1>Borrow a little.<br><em>Live a lot.</em></h1><p class="hero-copy">The drill you need for a day. The camera for a weekend. Find useful things from good neighbors right around the corner.</p>
      <form class="search-box" data-form="home-search"><span class="search-icon">⌕</span><input name="q" aria-label="Search for an item" placeholder="What are you looking for?"><button class="btn btn-primary">Find an item →</button></form>
      <div class="trust-row"><span><b>✓</b> Neighbor to neighbor</span><span><b>✓</b> No subscriptions</span><span><b>✓</b> Keep more, waste less</span></div></div>
      <div class="hero-art" aria-hidden="true"><div class="hero-orbit"></div><div class="hero-tile main"><span class="tile-emoji">📷</span><span class="tile-caption">Make room for good memories</span></div><div class="hero-tile side"><span class="tile-emoji">🛠️</span><span class="tile-caption">Borrow the right tool</span></div><div class="floating-note">A good neighbor thing<span>Shared right around you ♡</span></div></div></div></section>
      <section class="section"><div class="container"><div class="section-heading"><div><div class="eyebrow">Find your next favorite</div><h2>Browse by category</h2><p>All the useful things you don't need to own.</p></div><a class="btn btn-ghost" href="${url("browse")}">Explore everything →</a></div>
      <div class="category-grid">${categories.slice(0, 6).map(category => `<a class="category-card" href="${url("browse", { category })}"><span class="category-emoji">${categoryEmoji[category]}</span><strong>${category}</strong></a>`).join("")}</div></div></section>
      <section class="section" style="padding-top:12px"><div class="container"><div class="section-heading"><div><div class="eyebrow">Good finds nearby</div><h2>Recently shared</h2><p>Fresh listings from neighbors like you.</p></div><a class="btn btn-ghost" href="${url("browse")}">See all items →</a></div>
      ${items.length ? `<div class="item-grid">${items.map(itemCard).join("")}</div>` : empty("🧺", "Your neighborhood is getting started", "Be the first to share something useful.", `<a class="btn btn-primary" href="${url(user ? "new-listing" : "register")}">List an item</a>`)}</div></section>
      <section id="how" class="section"><div class="container"><div class="section-heading"><div><div class="eyebrow">Easy as asking next door</div><h2>Sharing just makes sense</h2></div></div>
      <div class="steps"><article class="step-card"><div class="step-num">01</div><h3>Find your thing</h3><p>Search local listings and choose the dates that work for you.</p></article><article class="step-card"><div class="step-num">02</div><h3>Say hello</h3><p>Send a request to your neighbor. They’ll confirm your dates and pickup.</p></article><article class="step-card"><div class="step-num">03</div><h3>Make good use</h3><p>Pick it up, enjoy it, then return it on time. Easy, friendly, done.</p></article></div></div></section>
      <section class="section" style="padding-top:0"><div class="container"><div class="cta"><div><h2>Have something gathering dust?</h2><p>Someone nearby could use it. Make their day and earn a little too.</p></div><a class="btn" href="${url(user ? "new-listing" : "register")}">Share an item →</a></div></div></section>`;
  }
  async function browse() {
    const p = params();
    const query = new URLSearchParams();
    for (const key of ["q", "category", "location", "minPrice", "maxPrice", "from", "to", "sort", "page"]) if (p.has(key)) query.set(key, p.get(key));
    const data = await api(`/api/items?${query}`);
    const option = (values, selected, title) => `<option value="">${title}</option>${values.map(v => `<option ${v === selected ? "selected" : ""} value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}`;
    app.innerHTML = `<div class="container"><div class="page-top"><div class="eyebrow">Your neighborhood has good stuff</div><h1>Find something useful.</h1><p>Borrow what you need. Return it ready for the next neighbor.</p></div>
      <div class="browse-layout"><form class="filter-panel" data-form="filters"><h3>Find your fit</h3>
        <div class="field"><label for="q">Search</label><input id="q" name="q" value="${escapeHtml(p.get("q") || "")}" placeholder="Try “drill” or “camera”"></div>
        <div class="field"><label for="category">Category</label><select id="category" name="category">${option(categories, p.get("category"), "All categories")}</select></div>
        <div class="field"><label for="location">Neighborhood</label><input id="location" name="location" value="${escapeHtml(p.get("location") || "")}" placeholder="City or neighborhood"></div>
        <div class="field"><label>Price per day</label><div class="field-row"><input type="number" min="0" name="minPrice" aria-label="Minimum daily price" placeholder="Min $" value="${escapeHtml(p.get("minPrice") || "")}"><input type="number" min="0" name="maxPrice" aria-label="Maximum daily price" placeholder="Max $" value="${escapeHtml(p.get("maxPrice") || "")}"></div></div>
        <div class="field"><label>Available for your dates</label><div class="field-row"><input type="date" name="from" aria-label="Start date" value="${escapeHtml(p.get("from") || "")}"><input type="date" name="to" aria-label="End date" value="${escapeHtml(p.get("to") || "")}"></div></div>
        <button class="btn btn-primary" style="width:100%">Apply filters</button><a class="btn btn-ghost" style="width:100%;margin-top:5px" href="${url("browse")}">Clear all</a>
      </form><div><div class="results-bar"><span>${data.total} ${data.total === 1 ? "item" : "items"} to borrow</span><label>Sort <select data-action="sort">${["newest", "price_low", "price_high", "popular"].map((sort, i) => `<option value="${sort}" ${sort === (p.get("sort") || "newest") ? "selected" : ""}>${["Recently added", "Price: low to high", "Price: high to low", "Neighbor rated"][i]}</option>`).join("")}</select></label></div>
      ${data.items.length ? `<div class="item-grid">${data.items.map(itemCard).join("")}</div>` : empty("🔎", "No items found", "Try widening your search or clearing a filter.")}
      ${data.pages > 1 ? `<div class="pagination"><a class="btn btn-light btn-small" href="${url("browse", Object.fromEntries([...p, ["page", String(Math.max(1, data.page - 1))]]))}">← Previous</a><span>Page ${data.page} of ${data.pages}</span><a class="btn btn-light btn-small" href="${url("browse", Object.fromEntries([...p, ["page", String(Math.min(data.pages, data.page + 1))]]))}">Next →</a></div>` : ""}</div></div></div>`;
  }
  async function itemDetail() {
    const id = Number(params().get("id"));
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("That listing could not be found.");
    const { item, reviews } = await api(`/api/items/${id}`);
    const image = item.image_path ? `<img src="${escapeHtml(item.image_path)}" alt="${escapeHtml(item.title)}">` : `<span class="placeholder">${categoryEmoji[item.category] || "🧺"}</span>`;
    const owner = user && user.id === item.owner_id;
    app.innerHTML = `<div class="container"><div class="page-top"><a class="btn btn-ghost btn-small" href="${url("browse")}">← Back to browsing</a></div>
      <div class="detail-grid"><div><div class="detail-image">${image}</div><div class="eyebrow" style="margin-top:24px">${escapeHtml(item.category)} · ${escapeHtml(item.location)}</div><h1 class="detail-title">${escapeHtml(item.title)}</h1>
      <p class="detail-desc">${escapeHtml(item.description)}</p><div class="owner-card" style="margin-top:23px"><h3>Meet your neighbor</h3><div class="owner-line"><div class="avatar">${escapeHtml(item.owner_name.slice(0, 1).toUpperCase())}</div><div><strong>${escapeHtml(item.owner_name)}</strong><small>⌖ ${escapeHtml(item.owner_location || item.location)} · ★ ${Number(item.owner_rating).toFixed(1)}</small></div></div><p style="font-size:12px;color:var(--muted);margin:12px 0 0">Keep it neighborly. Coordinate pickup and return details through your rental request.</p></div>
      <section style="margin-top:28px"><h2 style="font-size:22px;margin-bottom:12px">Neighbor reviews</h2>${reviews.length ? reviews.map(r => `<div class="review"><div class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div><strong>${escapeHtml(r.reviewer_name)}</strong><p>${escapeHtml(r.comment)}</p></div>`).join("") : `<p style="color:var(--muted)">No reviews yet. Be the first to share your experience.</p>`}</section></div>
      <aside class="owner-card rent-panel"><div class="rent-price">${money(item.daily_price)} <small>/ day</small></div><div class="detail-stats"><div><span>Refundable deposit</span><strong>${money(item.deposit_amount)}</strong></div><div><span>Availability</span><strong>Neighbor listed</strong></div></div>
      ${owner ? `<p style="color:var(--muted)">This is your listing. Manage it from My Listings.</p><a class="btn btn-primary" href="${url("edit-listing", { id: item.id })}" style="width:100%">Edit listing</a>` : user ? `<form data-form="rental-request"><input type="hidden" name="item_id" value="${item.id}"><div class="field"><label for="start_date">Pickup date</label><input required type="date" min="${item.available_from && item.available_from > today() ? item.available_from : today()}" ${item.available_to ? `max="${item.available_to}"` : ""} name="start_date" id="start_date"></div><div class="field"><label for="end_date">Return date <small>(inclusive)</small></label><input required type="date" min="${today()}" name="end_date" id="end_date" ${item.available_to ? `max="${item.available_to}"` : ""}></div><div class="field"><label for="message">Message your neighbor</label><textarea required minlength="5" maxlength="1000" name="message" id="message" placeholder="Say hello and tell them a little about your plans…"></textarea></div><p style="font-size:11px;color:var(--muted)">Rental total is calculated for every calendar day, including both pickup and return dates. Deposit is recorded only; no payment is processed.</p><button class="btn btn-primary" style="width:100%">Request to borrow</button></form>` : `<p style="color:var(--muted)">Sign in to request this item from your neighbor.</p><a class="btn btn-primary" href="${url("login")}" style="width:100%">Sign in to borrow</a>`}</aside></div></div>`;
    const start = document.querySelector("#start_date");
    const end = document.querySelector("#end_date");
    if (start && end) {
      start.addEventListener("change", () => { end.min = start.value; if (end.value && end.value < start.value) end.value = start.value; });
      if (item.available_to) end.max = item.available_to;
    }
  }
  function authPage(register) {
    app.innerHTML = `<div class="auth-wrap"><div class="auth-card"><div class="eyebrow">${register ? "Your neighborhood is waiting" : "Good to see you again"}</div><h1>${register ? "Join BorrowBox." : "Welcome back."}</h1><p>${register ? "Borrow a little. Share a little. Make good things happen nearby." : "Sign in to manage your listings and rentals."}</p>
      <form data-form="${register ? "register" : "login"}">${register ? `<div class="field"><label for="name">Your name</label><input id="name" name="name" required minlength="2" maxlength="80" autocomplete="name"></div><div class="field"><label for="location">Neighborhood (optional)</label><input id="location" name="location" maxlength="120" placeholder="e.g. Eastside, Portland"></div>` : ""}
      <div class="field"><label for="email">Email address</label><input id="email" name="email" required type="email" maxlength="254" autocomplete="email"></div><div class="field"><label for="password">Password</label><input id="password" name="password" required type="password" minlength="${register ? "10" : "1"}" maxlength="128" autocomplete="${register ? "new-password" : "current-password"}">${register ? `<small style="color:var(--muted)">Use at least 10 characters.</small>` : ""}</div><button class="btn btn-primary" style="width:100%;margin:5px 0 17px">${register ? "Create your account" : "Log in"}</button></form>
      <div style="font-size:13px;color:var(--muted);text-align:center">${register ? `Already a member? <a style="color:var(--green);font-weight:700" href="${url("login")}">Log in</a>` : `New around here? <a style="color:var(--green);font-weight:700" href="${url("register")}">Create an account</a>`}</div></div></div>`;
  }
  function badge(status) {
    return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(status.replace("_", " "))}</span>`;
  }
  function rentalRow(rental, isIncoming) {
    let actions = "";
    if (isIncoming && rental.status === "pending") actions = `<button class="btn btn-primary btn-small" data-action="approve" data-id="${rental.id}">Approve</button><button class="btn btn-light btn-small" data-action="reject" data-id="${rental.id}">Decline</button>`;
    if (isIncoming && rental.status === "approved" && rental.start_date <= today()) actions = `<button class="btn btn-primary btn-small" data-action="pickup" data-id="${rental.id}">Confirm pickup</button>`;
    if (!isIncoming && ["pending", "approved"].includes(rental.status)) actions = `<button class="btn btn-light btn-small" data-action="cancel" data-id="${rental.id}">Cancel request</button>`;
    if (!isIncoming && ["picked_up", "overdue"].includes(rental.status)) actions = `<button class="btn btn-primary btn-small" data-action="return" data-id="${rental.id}">Mark returned</button>`;
    if (!isIncoming && rental.status === "returned") actions = `<button class="btn btn-light btn-small" data-action="review" data-id="${rental.id}">Leave a review</button>`;
    const counterpart = isIncoming ? `Requested by ${escapeHtml(rental.renter_name)}` : `Owner: ${escapeHtml(rental.owner_name)}`;
    return `<div class="rental-row"><div class="rental-head"><strong>${escapeHtml(rental.item_title)}</strong>${badge(rental.status)}</div>
      <p>${counterpart} · ${escapeHtml(rental.start_date)} – ${escapeHtml(rental.end_date)} <span>(inclusive)</span></p>
      ${rental.status !== "pending" && (isIncoming ? rental.renter_email : rental.owner_email) ? `<p>Contact: ${escapeHtml(isIncoming ? rental.renter_email : rental.owner_email)}</p>` : ""}
      <p>${money(rental.rental_cost)} rental · ${money(rental.deposit_amount)} deposit (${escapeHtml(rental.deposit_refund_status.replace("_", " "))})</p>
      ${isIncoming ? `<p>Message: “${escapeHtml(rental.message)}”</p>` : ""}
      <div class="row-actions">${actions}</div></div>`;
  }
  async function dashboard() {
    if (!user) return navigate("login");
    const data = await api("/api/dashboard");
    const incoming = data.incoming;
    const outgoing = data.outgoing;
    app.innerHTML = `<div class="container dashboard"><div class="page-top"><div class="eyebrow">Your BorrowBox</div><div class="dash-head"><div><h1>Hey, ${escapeHtml(user.name.split(" ")[0])} 👋</h1><p style="color:var(--muted);margin:8px 0 0">A little sharing goes a long way.</p></div><a class="btn btn-primary" href="${url("new-listing")}">＋ List an item</a></div></div>
      <div class="stat-grid"><div class="stat-card"><span>Active rentals</span><strong>${data.stats.activeRentals}</strong></div><div class="stat-card"><span>Incoming requests</span><strong>${data.stats.pendingRequests}</strong></div><div class="stat-card"><span>Your active listings</span><strong>${data.stats.activeListings}</strong></div><div class="stat-card"><span>Overdue rentals</span><strong>${data.stats.overdueRentals}</strong></div></div>
      <div class="dash-columns"><div><section class="dash-section"><h2>Requests for your items</h2>${incoming.length ? incoming.map(r => rentalRow(r, true)).join("") : empty("📬", "All caught up", "Requests from neighbors will show up here.")}</section>
      <section class="dash-section"><h2>Your listings <a class="btn btn-ghost btn-small" style="float:right" href="${url("my-listings")}">Manage →</a></h2>${data.listings.length ? data.listings.slice(0, 5).map(i => `<div class="rental-row"><div class="rental-head"><strong>${escapeHtml(i.title)}</strong><span>${i.is_active ? "Active" : "Paused"}</span></div><p>${escapeHtml(i.category)} · ${money(i.daily_price)}/day · ${escapeHtml(i.location)}</p></div>`).join("") : empty("📦", "Nothing listed yet", "Share a useful item with your neighbors.", `<a class="btn btn-primary btn-small" href="${url("new-listing")}">Add a listing</a>`)}</section></div>
      <div><section class="dash-section"><h2>Your rental requests</h2>${outgoing.length ? outgoing.map(r => rentalRow(r, false)).join("") : empty("🧺", "Nothing borrowed yet", "Find something useful nearby.", `<a class="btn btn-primary btn-small" href="${url("browse")}">Browse items</a>`)}</section>
      <section class="dash-section"><h2>Community notes</h2>${data.notifications.length ? data.notifications.map(n => `<div class="rental-row"><p>${escapeHtml(n.message)}</p><small style="color:var(--muted)">${escapeHtml(n.created_at)}</small></div>`).join("") : `<p style="color:var(--muted)">Updates about your rentals will appear here.</p>`}</section></div></div></div>`;
  }
  function itemForm(item = {}) {
    const editing = Boolean(item.id);
    app.innerHTML = `<div class="container"><div class="page-top"><a class="btn btn-ghost btn-small" href="${url("my-listings")}">← My listings</a><h1>${editing ? "Update your listing" : "Share something useful."}</h1><p>Clear details help your neighbors know what to expect.</p></div>
      <form class="form-card" data-form="item" data-id="${editing ? item.id : ""}" enctype="multipart/form-data"><h2>Listing details</h2>
      <div class="field"><label for="title">Item name</label><input required minlength="3" maxlength="100" id="title" name="title" placeholder="e.g. Cordless drill kit" value="${escapeHtml(item.title)}"></div>
      <div class="field"><label for="description">Description</label><textarea required minlength="10" maxlength="3000" id="description" name="description" placeholder="What should a borrower know about your item?">${escapeHtml(item.description)}</textarea></div>
      <div class="field"><label for="category">Category</label><select required name="category" id="category">${categories.map(c => `<option value="${c}" ${item.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="field-row"><div class="field"><label for="daily_price">Price per day ($)</label><input required type="number" min="0" max="10000" step="0.01" name="daily_price" id="daily_price" value="${item.daily_price ?? ""}"></div><div class="field"><label for="deposit_amount">Refundable deposit ($)</label><input required type="number" min="0" max="100000" step="0.01" name="deposit_amount" id="deposit_amount" value="${item.deposit_amount ?? 0}"></div></div>
      <div class="field"><label for="location">Pickup neighborhood</label><input required minlength="2" maxlength="120" name="location" id="location" placeholder="e.g. Northeast Portland" value="${escapeHtml(item.location || user?.location || "")}"></div>
      <div class="field-row"><div class="field"><label for="available_from">Available from (optional)</label><input type="date" name="available_from" id="available_from" value="${escapeHtml(item.available_from || "")}"></div><div class="field"><label for="available_to">Available until (optional)</label><input type="date" name="available_to" id="available_to" value="${escapeHtml(item.available_to || "")}"></div></div>
      <div class="upload-box"><div class="field" style="margin:0"><label for="image">Photo (optional, JPG/PNG/WebP, up to 5 MB)</label><input type="file" id="image" name="image" accept="image/jpeg,image/png,image/webp"><small style="color:var(--muted)">${item.image_path ? `Current image: ${escapeHtml(item.image_path.split("/").pop())}` : "No photo? We’ll use a category illustration."}</small></div></div>
      <button class="btn btn-primary">${editing ? "Save changes" : "Publish listing"}</button></form></div>`;
  }
  async function editListing() {
    const id = Number(params().get("id"));
    if (!id) throw new Error("Choose a listing to edit.");
    const { item } = await api(`/api/items/${id}`);
    if (item.owner_id !== user?.id && user?.role !== "admin") throw new Error("You can only edit your own listings.");
    itemForm(item);
  }
  async function myListings() {
    if (!user) return navigate("login");
    const { items } = await api("/api/items/mine");
    app.innerHTML = `<div class="container"><div class="page-top"><div class="eyebrow">Your little corner of the marketplace</div><div class="dash-head"><div><h1>My listings</h1><p style="color:var(--muted)">Keep your listings up to date.</p></div><a class="btn btn-primary" href="${url("new-listing")}">＋ Add a listing</a></div></div>
      ${items.length ? `<div class="table-wrap panel" style="margin-bottom:70px"><table><thead><tr><th>Item</th><th>Category</th><th>Price/day</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map(item => `<tr><td><a href="${url("item", { id: item.id })}"><strong>${escapeHtml(item.title)}</strong></a><br><small>${escapeHtml(item.location)}</small></td><td>${escapeHtml(item.category)}</td><td>${money(item.daily_price)}</td><td>${item.is_active ? "Active" : "Paused"}</td><td><div class="row-actions"><a class="btn btn-light btn-small" href="${url("edit-listing", { id: item.id })}">Edit</a><button class="btn btn-light btn-small" data-action="toggle-listing" data-id="${item.id}" data-active="${item.is_active}">${item.is_active ? "Pause" : "Activate"}</button><button class="btn btn-danger btn-small" data-action="delete-listing" data-id="${item.id}">Remove</button></div></td></tr>`).join("")}</tbody></table></div>` : empty("📦", "Start sharing with neighbors", "A listing only takes a minute to create.", `<a class="btn btn-primary" href="${url("new-listing")}">Add a listing</a>`)}</div>`;
  }
  async function profile() {
    if (!user) return navigate("login");
    app.innerHTML = `<div class="container"><div class="page-top"><div class="eyebrow">Your account</div><h1>Profile & preferences</h1><p>Manage how neighbors see and reach you.</p></div><div class="profile-grid">
      <nav class="profile-nav panel"><a class="active" href="${url("profile")}">Account details</a><a href="${url("dashboard")}">My dashboard</a><a href="${url("my-listings")}">My listings</a><button class="btn btn-ghost" data-action="logout" style="justify-content:flex-start">Log out</button>${user.role === "admin" ? `<a href="${url("admin")}">Admin dashboard</a>` : ""}</nav>
      <form class="panel" data-form="profile"><h2 style="font-size:22px;margin-bottom:20px">Account details</h2><div class="field"><label for="name">Name</label><input required id="name" name="name" minlength="2" maxlength="80" value="${escapeHtml(user.name)}"></div><div class="field"><label>Email</label><input disabled value="${escapeHtml(user.email)}"><small style="color:var(--muted)">Email address cannot be changed here.</small></div>
      <div class="field"><label for="location">Neighborhood</label><input id="location" name="location" maxlength="120" value="${escapeHtml(user.location || "")}" placeholder="City or neighborhood"></div>
      <div class="field"><label for="contact_preference">Contact preference</label><select id="contact_preference" name="contact_preference"><option value="platform" ${user.contact_preference === "platform" ? "selected" : ""}>Keep contact on BorrowBox</option><option value="email" ${user.contact_preference === "email" ? "selected" : ""}>Share email with confirmed rental partners</option></select><small style="color:var(--muted)">When enabled, your email is shared only with the other rental participant after approval. It is never shown on public listings.</small></div>
      <button class="btn btn-primary">Save profile</button></form></div></div>`;
  }
  async function adminPage() {
    if (!user) return navigate("login");
    const { counts, items } = await api("/api/admin");
    app.innerHTML = `<div class="container dashboard"><div class="page-top"><div class="eyebrow">Community care</div><h1>Admin dashboard</h1><p>Review platform activity and keep listings neighborly.</p></div>
      <div class="stat-grid"><div class="stat-card"><span>Members</span><strong>${counts.users}</strong></div><div class="stat-card"><span>Active listings</span><strong>${counts.listings}</strong></div><div class="stat-card"><span>Rental requests</span><strong>${counts.requests}</strong></div><div class="stat-card"><span>Overdue rentals</span><strong>${counts.overdue}</strong></div></div>
      <section class="dash-section"><h2>Listing moderation</h2><div class="table-wrap"><table><thead><tr><th>Item</th><th>Owner</th><th>Category</th><th>Location</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(item => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.owner_name)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.location)}</td><td>${item.is_active ? "Active" : "Paused"}</td><td><button class="btn btn-light btn-small" data-action="moderate" data-id="${item.id}" data-active="${item.is_active}">${item.is_active ? "Deactivate" : "Reactivate"}</button></td></tr>`).join("")}</tbody></table></div></section></div>`;
  }
  function navigate(target, values = {}) {
    history.pushState({}, "", url(target, values));
    render();
    window.scrollTo(0, 0);
  }
  async function render() {
    renderHeader();
    renderFooter();
    const target = page();
    try {
      if (target === "home") await home();
      else if (target === "browse") await browse();
      else if (target === "item") await itemDetail();
      else if (target === "login") authPage(false);
      else if (target === "register") authPage(true);
      else if (target === "dashboard" || target === "rentals") await dashboard();
      else if (target === "new-listing") {
        if (!user) return navigate("login");
        itemForm();
      } else if (target === "edit-listing") await editListing();
      else if (target === "my-listings") await myListings();
      else if (target === "profile") await profile();
      else if (target === "admin") await adminPage();
      else app.innerHTML = empty("🧭", "Page not found", "Let's find something useful instead.", `<a class="btn btn-primary" href="${url("home")}">Go home</a>`);
    } catch (error) {
      app.innerHTML = `<div class="container" style="padding:80px 0">${empty("🌿", "We couldn't load this page", error.message, `<button class="btn btn-primary" data-action="retry">Try again</button>`)}</div>`;
      if (error.message.includes("Administrator")) notify(error.message, true);
    }
    renderHeader();
  }
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("a");
    if (link && link.origin === location.origin && link.pathname === "/" && !link.hash) {
      event.preventDefault();
      history.pushState({}, "", link.href);
      await render();
      window.scrollTo(0, 0);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    try {
      if (action === "mobile-menu") document.querySelector(".mobile-nav")?.classList.toggle("open");
      else if (action === "retry") await render();
      else if (action === "logout") {
        await api("/api/auth/logout", { method: "POST" });
        user = null;
        const csrf = await api("/api/csrf");
        csrfToken = csrf.csrfToken;
        notify("You’re signed out. See you around!");
        navigate("home");
      } else if (["approve", "reject"].includes(action)) {
        const approve = action === "approve";
        if (!approve && !confirm("Decline this rental request?")) return;
        await api(`/api/rentals/${id}/approve`, { method: "PATCH", body: JSON.stringify({ approve }) });
        notify(approve ? "Request approved." : "Request declined.");
        await render();
      } else if (action === "cancel") {
        if (!confirm("Cancel this rental request?")) return;
        await api(`/api/rentals/${id}/cancel`, { method: "PATCH", body: "{}" });
        notify("Rental request cancelled.");
        await render();
      } else if (action === "pickup") {
        await api(`/api/rentals/${id}/pickup`, { method: "PATCH", body: "{}" });
        notify("Pickup confirmed.");
        await render();
      } else if (action === "return") {
        if (!confirm("Confirm that you have returned this item?")) return;
        await api(`/api/rentals/${id}/return`, { method: "PATCH", body: "{}" });
        notify("Return recorded. Thank you!");
        await render();
      } else if (action === "review") {
        const rating = Number(prompt("Rate your experience from 1 to 5 stars:"));
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
        const comment = prompt("Share a short review (at least 2 characters):");
        if (!comment) return;
        await api("/api/reviews", { method: "POST", body: JSON.stringify({ rental_request_id: Number(id), rating, comment }) });
        notify("Review posted. Thanks for being a great neighbor!");
        await render();
      } else if (action === "toggle-listing") {
        const active = button.dataset.active !== "1";
        await api(`/api/items/${id}/active`, { method: "PATCH", body: JSON.stringify({ active }) });
        notify(active ? "Listing activated." : "Listing paused.");
        await render();
      } else if (action === "delete-listing") {
        if (!confirm("Remove this listing? Listings with rental history cannot be removed.")) return;
        await api(`/api/items/${id}`, { method: "DELETE" });
        notify("Listing removed.");
        await render();
      } else if (action === "moderate") {
        const active = button.dataset.active !== "1";
        await api(`/api/admin/items/${id}`, { method: "PATCH", body: JSON.stringify({ active }) });
        notify(active ? "Listing reactivated." : "Listing deactivated.");
        await render();
      }
    } catch (error) { notify(error.message, true); }
  });
  document.addEventListener("change", async (event) => {
    if (event.target.matches('[data-action="sort"]')) {
      const current = Object.fromEntries(params());
      current.sort = event.target.value;
      current.page = "1";
      history.pushState({}, "", url("browse", current));
      await render();
    }
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-form]");
    if (!form) return;
    event.preventDefault();
    const kind = form.dataset.form;
    const submit = form.querySelector('button[type="submit"],button:not([type])');
    if (submit) { submit.disabled = true; submit.dataset.original = submit.textContent; submit.textContent = "Please wait…"; }
    try {
      if (kind === "home-search") {
        const q = new FormData(form).get("q")?.toString().trim() || "";
        navigate("browse", q ? { q } : {});
      } else if (kind === "filters") {
        const values = Object.fromEntries(new FormData(form).entries());
        Object.keys(values).forEach(key => { if (!values[key]) delete values[key]; });
        values.page = "1";
        navigate("browse", values);
      } else if (kind === "login" || kind === "register") {
        const body = Object.fromEntries(new FormData(form).entries());
        const data = await api(`/api/auth/${kind}`, { method: "POST", body: JSON.stringify(body) });
        user = data.user;
        csrfToken = data.csrfToken;
        notify(kind === "login" ? "Welcome back!" : "Welcome to the neighborhood!");
        navigate("dashboard");
      } else if (kind === "rental-request") {
        const body = Object.fromEntries(new FormData(form).entries());
        body.item_id = Number(body.item_id);
        const result = await api("/api/rentals", { method: "POST", body: JSON.stringify(body) });
        notify(`Request sent. ${result.days} rental day${result.days === 1 ? "" : "s"} · ${money(result.rental.rental_cost)}.`);
        navigate("dashboard");
      } else if (kind === "item") {
        const formData = new FormData(form);
        const id = form.dataset.id;
        const response = await api(id ? `/api/items/${id}` : "/api/items", { method: id ? "PUT" : "POST", body: formData });
        notify(id ? "Listing updated." : "Your listing is live.");
        navigate("item", { id: response.item.id });
      } else if (kind === "profile") {
        const body = Object.fromEntries(new FormData(form).entries());
        const data = await api("/api/auth/profile", { method: "PUT", body: JSON.stringify(body) });
        user = data.user;
        notify("Profile saved.");
        await render();
      }
    } catch (error) {
      notify(error.message, true);
      if (submit) { submit.disabled = false; submit.textContent = submit.dataset.original || "Try again"; }
    }
  });
  window.addEventListener("popstate", render);
  init().catch(error => {
    app.innerHTML = `<div class="container" style="padding:80px 0">${empty("🌿", "BorrowBox is taking a breather", error.message, `<button class="btn btn-primary" data-action="retry">Try again</button>`)}</div>`;
  });
})();
