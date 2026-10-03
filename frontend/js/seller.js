/* ============================================================
   AgriConnect — Seller dashboard logic
   ============================================================ */
const user = requireAuth("seller");

/* ---------- navigation ---------- */
document.querySelectorAll(".nav-link[data-section]").forEach((btn) => {
  btn.addEventListener("click", () => goTo(btn.dataset.section));
});
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => goTo(btn.dataset.goto));
});
function goTo(section) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((n) => n.classList.remove("active"));
  document.getElementById("section-" + section).classList.add("active");
  const navBtn = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (navBtn) navBtn.classList.add("active");
  if (section === "prices") loadPrices();
  if (window.onSellerSectionOpen) window.onSellerSectionOpen(section);
}

document.getElementById("logout-btn").addEventListener("click", logout);

/* ---------- header ---------- */
function paintUserChip() {
  document.getElementById("chip-name").textContent = user.name;
  document.getElementById("avatar-initial").textContent = user.name.charAt(0).toUpperCase();
  document.getElementById("overview-name").textContent = user.name.split(" ")[0];
}
paintUserChip();

/* ---------- OVERVIEW ---------- */
async function loadOverview() {
  try {
    const [{ data: listings }, { data: purchases }] = await Promise.all([
      cachedGet("/products", "market_listings"),
      cachedGet("/orders/mine", "seller_purchases"),
    ]);
    document.getElementById("stat-available").textContent = listings.length;
    document.getElementById("stat-bought").textContent = purchases.length;
    document.getElementById("stat-spent").textContent =
      purchases.reduce((sum, o) => sum + o.total_price, 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  } catch {
    showToast("Couldn't load your overview yet.", "error");
  }
}

/* ---------- MARKETPLACE ---------- */
let allListings = [];
async function loadMarketplace() {
  const wrap = document.getElementById("marketplace-list");
  try {
    const { data } = await cachedGet("/products", "market_listings");
    allListings = data;
    renderMarketplace(data);
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>No listings cached yet</h3><p>Reconnect to browse the marketplace.</p></div>`;
  }
}
function renderMarketplace(rows) {
  const wrap = document.getElementById("marketplace-list");
  if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><h3>No produce listed right now</h3><p>Check back soon — farmers add new listings regularly.</p></div>`; return; }
  wrap.innerHTML = rows.map((p) => `
    <div class="produce-card">
      <div>
        <div class="name">${p.crop_name}</div>
        <div class="meta">${p.quantity} ${p.unit} available · sold by ${p.farmer_name}${p.farmer_location ? " (" + p.farmer_location + ")" : ""}${p.description ? " · " + p.description : ""}</div>
      </div>
      <div class="produce-actions">
        <div class="price">₹${p.price_per_unit.toLocaleString("en-IN")}/${p.unit}</div>
        <button class="btn btn-sm btn-outline" data-save="${p.id}">☆ Save</button>
        <button class="btn btn-sm btn-outline" data-message="${p.id}" data-crop="${p.crop_name}">Message</button>
        <button class="btn btn-sm" data-buy="${p.id}">Buy</button>
      </div>
    </div>`).join("");
  wrap.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => openBuyModal(b.dataset.buy)));
  wrap.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => saveListing(b.dataset.save)));
  wrap.querySelectorAll("[data-message]").forEach((b) => b.addEventListener("click", () => openMessageModal(b.dataset.message, b.dataset.crop)));
}
async function saveListing(productId) {
  try {
    await apiRequest("POST", "/saved", { product_id: Number(productId) });
    showToast("Saved.", "success");
  } catch (err) {
    showToast(err.status === 409 ? "Already saved." : (err.message || "Could not save."), err.status === 409 ? "" : "error");
  }
}
document.getElementById("market-search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  renderMarketplace(q ? allListings.filter((p) => p.crop_name.toLowerCase().includes(q)) : allListings);
});

function openBuyModal(productId) {
  const product = allListings.find((p) => String(p.id) === String(productId));
  if (!product) return;
  document.getElementById("buy-product-id").value = productId;
  document.getElementById("buy-modal-title").textContent = `Buy ${product.crop_name}`;
  document.getElementById("buy-modal-sub").textContent = `₹${product.price_per_unit}/${product.unit} · ${product.quantity} ${product.unit} available from ${product.farmer_name}`;
  document.getElementById("buy-qty").max = product.quantity;
  document.getElementById("buy-qty").value = "";
  document.getElementById("buy-modal").classList.add("show");
}
document.getElementById("buy-cancel").addEventListener("click", () => document.getElementById("buy-modal").classList.remove("show"));
document.getElementById("buy-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const productId = document.getElementById("buy-product-id").value;
  const quantity = parseFloat(document.getElementById("buy-qty").value);
  const payload = { product_id: Number(productId), quantity };
  try {
    await apiRequest("POST", "/orders", payload);
    showToast("Purchase confirmed!", "success");
  } catch (err) {
    if (err.offline) {
      queueAction("place_order", payload);
      showToast("Offline — purchase queued and will confirm once you're back online.", "");
      renderStatusBar();
    } else {
      showToast(err.message || "Could not complete purchase.", "error");
    }
  }
  document.getElementById("buy-modal").classList.remove("show");
  loadMarketplace(); loadOverview(); loadPurchases();
});

/* ---------- PURCHASES ---------- */
async function loadPurchases() {
  const wrap = document.getElementById("purchases-list");
  try {
    const { data } = await cachedGet("/orders/mine", "seller_purchases");
    if (!data.length) { wrap.innerHTML = `<div class="empty-state"><h3>No purchases yet</h3><p>Buy something from the marketplace to see it here.</p></div>`; return; }
    wrap.innerHTML = data.map((o) => `
      <div class="produce-card">
        <div>
          <div class="name">${o.crop_name} <span class="badge">${o.status}</span></div>
          <div class="meta">${o.farmer_name}${o.farmer_location ? " (" + o.farmer_location + ")" : ""} · ${o.quantity} ${o.unit} · ${(o.created_at || "").slice(0, 10)}</div>
        </div>
        <div class="produce-actions">
          <div class="price">₹${o.total_price.toLocaleString("en-IN")}</div>
          ${o.status === "delivered" ? `<button class="btn btn-sm btn-outline" data-review="${o.id}">Leave review</button>` : ""}
        </div>
      </div>`).join("");
    wrap.querySelectorAll("[data-review]").forEach((b) => b.addEventListener("click", () => window.openReviewModal && window.openReviewModal(b.dataset.review)));
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Purchase history unavailable offline</h3></div>`;
  }
}

/* ---------- MARKET PRICES ---------- */
async function loadPrices() {
  const wrap = document.getElementById("prices-table-wrap");
  try {
    const { data } = await cachedGet("/market-prices", "market_prices");
    if (!data.length) { wrap.innerHTML = `<div class="empty-state"><h3>No price data yet</h3></div>`; return; }
    wrap.innerHTML = `<table><thead><tr><th>Crop</th><th>Market</th><th>Price</th><th>Trend</th></tr></thead><tbody>
      ${data.map((p) => `<tr>
        <td>${p.crop_name}</td><td>${p.market_name}</td>
        <td>₹${p.price_per_unit.toLocaleString("en-IN")} / ${p.unit}</td>
        <td><span class="badge ${p.trend}">${p.trend}</span></td>
      </tr>`).join("")}
    </tbody></table>`;
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Prices unavailable offline</h3></div>`;
  }
}

/* ---------- PROFILE ---------- */
async function loadProfile() {
  try {
    const profile = await apiRequest("GET", "/profile");
    document.getElementById("profile-email").value = profile.email;
    document.getElementById("profile-name").value = profile.name;
    document.getElementById("profile-phone").value = profile.phone || "";
    document.getElementById("profile-location").value = profile.location || "";
  } catch {
    document.getElementById("profile-email").value = user.email;
    document.getElementById("profile-name").value = user.name;
  }
}
document.getElementById("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBanner = document.getElementById("profile-error");
  const infoBanner = document.getElementById("profile-info");
  errBanner.classList.remove("show"); infoBanner.classList.remove("show");
  try {
    const updated = await apiRequest("PUT", "/profile", {
      name: document.getElementById("profile-name").value.trim(),
      phone: document.getElementById("profile-phone").value.trim(),
      location: document.getElementById("profile-location").value.trim(),
    });
    const sessionUser = getUser();
    sessionUser.name = updated.name;
    setSession(getToken(), sessionUser);
    paintUserChip();
    infoBanner.textContent = "Profile updated.";
    infoBanner.classList.add("show");
  } catch (err) {
    errBanner.textContent = err.offline ? "Profile changes need a connection." : (err.message || "Could not update profile.");
    errBanner.classList.add("show");
  }
});

/* ---------- boot ---------- */
loadOverview();
loadMarketplace();
loadPurchases();
loadProfile();
window.addEventListener("ac:synced", () => { loadOverview(); loadMarketplace(); loadPurchases(); });
