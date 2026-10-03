/* ============================================================
   AgriConnect — Seller extra features
   (Saved Items, Order Tracking, Purchase Analytics, Price Comparison,
   Nearby Farmers, Messages, My Reviews, Notifications)
   Relies on `user`, apiRequest/cachedGet/showToast/renderStatusBar
   already defined by api.js + seller.js, loaded before this file.
   ============================================================ */

const sellerSectionLoaders = {
  saved: loadSaved,
  tracking: loadTracking,
  purchaseanalytics: loadPurchaseAnalytics,
  nearbyfarmers: loadNearbyFarmers,
  messages: loadThreads,
  reviews: loadMyReviews,
  notifications: loadNotifications,
};
window.onSellerSectionOpen = (section) => { if (sellerSectionLoaders[section]) sellerSectionLoaders[section](); };

function fmtMoney(n) { return (n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }); }

/* ============================================================
   SAVED ITEMS
   ============================================================ */
async function loadSaved() {
  const wrap = document.getElementById("saved-list");
  try {
    const rows = await apiRequest("GET", "/saved");
    if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><h3>Nothing saved yet</h3><p>Tap "Save" on any listing in the marketplace.</p></div>`; return; }
    wrap.innerHTML = rows.map((p) => `
      <div class="produce-card">
        <div>
          <div class="name">${p.crop_name}</div>
          <div class="meta">${p.quantity} ${p.unit} available · ${p.farmer_name}${p.farmer_location ? " (" + p.farmer_location + ")" : ""} · ${p.status}</div>
        </div>
        <div class="produce-actions">
          <div class="price">₹${p.price_per_unit.toLocaleString("en-IN")}/${p.unit}</div>
          ${p.status === "available" ? `<button class="btn btn-sm" data-buy-saved="${p.id}">Buy</button>` : ""}
          <button class="btn btn-sm btn-danger" data-unsave="${p.id}">Remove</button>
        </div>
      </div>`).join("");
    wrap.querySelectorAll("[data-unsave]").forEach((b) => b.addEventListener("click", async () => {
      await apiRequest("DELETE", `/saved/${b.dataset.unsave}`); loadSaved();
    }));
    wrap.querySelectorAll("[data-buy-saved]").forEach((b) => b.addEventListener("click", () => {
      goTo("marketplace");
      setTimeout(() => openBuyModal(b.dataset.buySaved), 150);
    }));
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><h3>Unavailable offline</h3></div>`;
  }
}

/* ============================================================
   ORDER TRACKING
   ============================================================ */
const STAGES = ["confirmed", "packed", "shipped", "delivered"];
async function loadTracking() {
  const wrap = document.getElementById("tracking-list");
  try {
    const { data } = await cachedGet("/orders/mine", "seller_purchases");
    if (!data.length) { wrap.innerHTML = `<div class="empty-state"><h3>No orders yet</h3></div>`; return; }
    wrap.innerHTML = data.map((o) => {
      const idx = Math.max(0, STAGES.indexOf(o.status));
      return `
      <div class="card">
        <div class="card-head"><h3>${o.crop_name} <span class="text-faint" style="font-size:0.8rem;">from ${o.farmer_name}</span></h3><span class="text-faint">${(o.created_at || "").slice(0, 10)}</span></div>
        <div class="stepper">
          ${STAGES.map((s, i) => `
            <div class="step ${i < idx ? "done" : i === idx ? "current" : ""}">
              <div class="dot">${i < idx ? "✓" : i + 1}</div>
              <small>${s}</small>
            </div>`).join("")}
        </div>
      </div>`;
    }).join("");
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Unavailable offline</h3></div>`;
  }
}

/* ============================================================
   PURCHASE ANALYTICS
   ============================================================ */
async function loadPurchaseAnalytics() {
  try {
    const d = await apiRequest("GET", "/analytics/purchases");
    document.getElementById("pa-total-spent").textContent = fmtMoney(d.totals.total_spent);
    document.getElementById("pa-order-count").textContent = d.totals.order_count;
    document.getElementById("pa-avg-order").textContent = fmtMoney(d.totals.avg_order_value);
    renderBars("pa-by-crop", d.byCrop.map((r) => ({ label: r.crop_name, value: r.total })), "accent");
    renderBars("pa-by-month", d.byMonth.map((r) => ({ label: r.month, value: r.total })), "leaf");
  } catch {
    showToast("Analytics need a connection to load.", "error");
  }
}
function renderBars(elId, rows, colorClass) {
  const wrap = document.getElementById(elId);
  if (!rows.length) { wrap.innerHTML = `<p class="text-faint">No data yet.</p>`; return; }
  const max = Math.max(...rows.map((r) => r.value), 1);
  wrap.innerHTML = rows.map((r) => `
    <div class="bar-row">
      <div class="bar-label">${r.label}</div>
      <div class="bar-track"><div class="bar-fill ${colorClass === "accent" ? "" : colorClass}" style="width:${(r.value / max) * 100}%"></div></div>
      <div class="bar-value">${fmtMoney(r.value)}</div>
    </div>`).join("");
}

/* ============================================================
   PRICE COMPARISON
   ============================================================ */
document.getElementById("compare-btn").addEventListener("click", async () => {
  const crop = document.getElementById("compare-input").value.trim();
  const out = document.getElementById("compare-result");
  if (!crop) return;
  out.innerHTML = `<p class="text-faint">Comparing…</p>`;
  try {
    const d = await apiRequest("GET", `/products/compare?crop=${encodeURIComponent(crop)}`);
    if (!d.listings.length) { out.innerHTML = `<div class="empty-state"><h3>No listings for ${crop} right now</h3></div>`; return; }
    out.innerHTML = `
      ${d.market_reference ? `<p class="text-faint">Recent market average: ₹${Math.round(d.market_reference.avg_market_price)}/${d.market_reference.unit}</p>` : ""}
      <table><thead><tr><th>Farmer</th><th>Location</th><th>Price</th><th>Available</th></tr></thead><tbody>
        ${d.listings.map((p, i) => `<tr>
          <td>${p.farmer_name} ${i === 0 ? '<span class="badge up">cheapest</span>' : ""}</td>
          <td>${p.farmer_location || "—"}</td>
          <td>₹${p.price_per_unit}/${p.unit}</td>
          <td>${p.quantity} ${p.unit}</td>
        </tr>`).join("")}
      </tbody></table>`;
  } catch (err) {
    out.innerHTML = `<div class="empty-state"><h3>Couldn't compare</h3><p>${err.message || ""}</p></div>`;
  }
});

/* ============================================================
   NEARBY FARMERS
   ============================================================ */
async function loadNearbyFarmers() {
  const wrap = document.getElementById("nearby-farmers-list");
  try {
    const rows = await apiRequest("GET", "/farmers");
    wrap.innerHTML = rows.map((f) => `
      <div class="produce-card">
        <div>
          <div class="name">${f.name} ${f.average_rating ? `<span class="stars">${"★".repeat(Math.round(f.average_rating))}${"☆".repeat(5 - Math.round(f.average_rating))}</span> <span class="text-faint">(${f.review_count})</span>` : ""}</div>
          <div class="meta">${f.location || "Location not set"}${f.phone ? " · " + f.phone : ""} · ${f.active_listings} active listing${f.active_listings === 1 ? "" : "s"}</div>
        </div>
        <div class="produce-actions"><button class="btn btn-sm btn-outline" data-view-farmer="${f.name}">View listings</button></div>
      </div>`).join("");
    wrap.querySelectorAll("[data-view-farmer]").forEach((b) => b.addEventListener("click", () => {
      goTo("marketplace");
      setTimeout(() => {
        document.getElementById("market-search").value = "";
        renderMarketplace(allListings.filter((p) => p.farmer_name === b.dataset.viewFarmer));
      }, 150);
    }));
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Unavailable offline</h3></div>`;
  }
}

/* ============================================================
   MESSAGES
   ============================================================ */
let activeThread = null;

async function loadThreads() {
  const wrap = document.getElementById("thread-list");
  try {
    const rows = await apiRequest("GET", "/messages/threads");
    if (!rows.length) { wrap.innerHTML = `<p class="text-faint">No conversations yet — message a farmer from any listing.</p>`; return; }
    wrap.innerHTML = rows.map((t) => `
      <div class="thread-item" data-open-thread data-product="${t.product_id ?? ""}" data-counterpart="${t.farmer_id}" data-name="${t.farmer_name}" data-crop="${t.crop_name || "General"}">
        <div class="thread-meta"><div class="crop">${t.crop_name || "General"} — ${t.farmer_name}</div><div class="preview">${t.last_body || ""}</div></div>
        ${t.unread_count > 0 ? `<span class="badge">${t.unread_count}</span>` : ""}
      </div>`).join("");
    wrap.querySelectorAll("[data-open-thread]").forEach((el) => el.addEventListener("click", () => openThread(el.dataset.product, el.dataset.counterpart, el.dataset.name, el.dataset.crop)));
  } catch {
    wrap.innerHTML = `<p class="text-faint">Unavailable offline.</p>`;
  }
}

async function openThread(productId, counterpartId, name, crop) {
  activeThread = { productId: productId || "", counterpartId };
  document.getElementById("chat-card").style.display = "block";
  document.getElementById("chat-title").textContent = `${crop} — ${name}`;
  const win = document.getElementById("chat-window");
  win.innerHTML = `<p class="text-faint">Loading…</p>`;
  try {
    const q = `?product_id=${encodeURIComponent(productId || "")}&counterpart_id=${counterpartId}`;
    const rows = await apiRequest("GET", `/messages/thread${q}`);
    win.innerHTML = rows.map((m) => `
      <div class="chat-bubble ${m.sender_role === "seller" ? "me" : "them"}">
        ${m.body}<span class="time">${new Date(m.created_at).toLocaleString()}</span>
      </div>`).join("") || `<p class="text-faint">Say hello 👋</p>`;
    win.scrollTop = win.scrollHeight;
    loadThreads();
  } catch {
    win.innerHTML = `<p class="text-faint">Couldn't load this conversation.</p>`;
  }
}

document.getElementById("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const body = input.value.trim();
  if (!body || !activeThread) return;
  try {
    await apiRequest("POST", "/messages", { product_id: activeThread.productId || null, counterpart_id: activeThread.counterpartId, body });
    input.value = "";
    openThread(activeThread.productId, activeThread.counterpartId, document.getElementById("chat-title").textContent.split(" — ")[1], document.getElementById("chat-title").textContent.split(" — ")[0]);
  } catch (err) {
    showToast(err.offline ? "Messages need a connection." : (err.message || "Could not send."), "error");
  }
});

/* Compose modal, opened from a marketplace listing */
function openMessageModal(productId, cropName) {
  document.getElementById("msg-product-id").value = productId;
  document.getElementById("message-modal-title").textContent = `Message about ${cropName}`;
  document.getElementById("msg-body").value = "";
  document.getElementById("message-modal").classList.add("show");
}
document.getElementById("message-cancel").addEventListener("click", () => document.getElementById("message-modal").classList.remove("show"));
document.getElementById("message-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const productId = document.getElementById("msg-product-id").value;
  const body = document.getElementById("msg-body").value.trim();
  try {
    await apiRequest("POST", "/messages", { product_id: Number(productId), body });
    showToast("Message sent.", "success");
  } catch (err) {
    showToast(err.offline ? "Messages need a connection." : (err.message || "Could not send."), "error");
  }
  document.getElementById("message-modal").classList.remove("show");
});

/* ============================================================
   MY REVIEWS
   ============================================================ */
async function loadMyReviews() {
  const wrap = document.getElementById("reviews-list");
  try {
    const rows = await apiRequest("GET", "/reviews/mine");
    if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><h3>No reviews yet</h3><p>Leave one from a delivered order in My Purchases.</p></div>`; return; }
    wrap.innerHTML = rows.map((r) => `
      <div class="produce-card">
        <div>
          <div class="name">${r.crop_name} — ${r.farmer_name} <span class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span></div>
          <div class="meta">${r.comment || ""} · ${(r.created_at || "").slice(0, 10)}</div>
        </div>
      </div>`).join("");
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Unavailable offline</h3></div>`;
  }
}

let selectedRating = 0;
window.openReviewModal = function (orderId) {
  document.getElementById("rev-order-id").value = orderId;
  document.getElementById("rev-comment").value = "";
  selectedRating = 0;
  paintStars();
  document.getElementById("review-modal").classList.add("show");
};
document.getElementById("review-cancel").addEventListener("click", () => document.getElementById("review-modal").classList.remove("show"));
document.querySelectorAll("#rating-input .star").forEach((s) => s.addEventListener("click", () => { selectedRating = Number(s.dataset.star); paintStars(); }));
function paintStars() {
  document.querySelectorAll("#rating-input .star").forEach((s) => s.classList.toggle("filled", Number(s.dataset.star) <= selectedRating));
}
document.getElementById("review-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedRating) { showToast("Pick a star rating first.", "error"); return; }
  try {
    await apiRequest("POST", "/reviews", {
      order_id: Number(document.getElementById("rev-order-id").value),
      rating: selectedRating,
      comment: document.getElementById("rev-comment").value.trim() || undefined,
    });
    showToast("Review submitted.", "success");
    loadPurchases();
  } catch (err) {
    showToast(err.offline ? "Reviews need a connection." : (err.message || "Could not submit review."), "error");
  }
  document.getElementById("review-modal").classList.remove("show");
});

/* ============================================================
   NOTIFICATIONS
   ============================================================ */
async function loadNotifications() {
  const wrap = document.getElementById("notifications-list");
  try {
    const data = await apiRequest("GET", "/notifications");
    const unread = data.filter((n) => !n.is_read).length;
    const badge = document.getElementById("notif-count-badge");
    if (unread) { badge.style.display = "inline-block"; badge.textContent = unread; } else { badge.style.display = "none"; }

    if (!data.length) { wrap.innerHTML = `<div class="empty-state"><h3>All caught up</h3></div>`; return; }
    wrap.innerHTML = data.map((n) => `
      <div class="notif-item ${n.is_read ? "read" : "unread"}">
        <div class="notif-dot"></div>
        <div class="notif-body">${n.message}<div class="notif-time">${new Date(n.created_at).toLocaleString()}</div></div>
        ${!n.is_read ? `<button class="btn btn-sm btn-outline" data-read="${n.id}">Mark read</button>` : ""}
      </div>`).join("");
    wrap.querySelectorAll("[data-read]").forEach((b) => b.addEventListener("click", async () => { await apiRequest("PUT", `/notifications/${b.dataset.read}/read`); loadNotifications(); }));
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Unavailable offline</h3></div>`;
  }
}
document.getElementById("mark-all-read-btn").addEventListener("click", async () => {
  try { await apiRequest("PUT", "/notifications/read-all"); loadNotifications(); } catch (err) { showToast(err.message || "Could not update.", "error"); }
});

/* ---------- boot ---------- */
loadNotifications();
window.addEventListener("ac:synced", () => { loadNotifications(); });
