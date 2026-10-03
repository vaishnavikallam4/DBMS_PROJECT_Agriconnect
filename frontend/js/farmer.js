/* ============================================================
   AgriConnect — Farmer dashboard logic
   ============================================================ */
const user = requireAuth("farmer");

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
  if (section === "crops" && !window.__cropsLoaded) loadCropList();
  if (section === "prices") loadPrices();
  if (section === "sold") loadSold();
  if (window.onFarmerSectionOpen) window.onFarmerSectionOpen(section);
}

document.getElementById("logout-btn").addEventListener("click", logout);

/* ---------- header / profile chip ---------- */
function paintUserChip() {
  document.getElementById("chip-name").textContent = user.name;
  document.getElementById("avatar-initial").textContent = user.name.charAt(0).toUpperCase();
  document.getElementById("overview-name").textContent = user.name.split(" ")[0];
}
paintUserChip();

/* ---------- OVERVIEW ---------- */
async function loadOverview() {
  try {
    const [{ data: listings }, { data: sold }, { data: expenses }] = await Promise.all([
      cachedGet("/products/mine", "farmer_listings"),
      cachedGet("/orders/for-my-products", "farmer_sold"),
      cachedGet("/expenses/mine", "farmer_expenses"),
    ]);
    document.getElementById("stat-listings").textContent =
      listings.filter((l) => l.status === "available").length;
    document.getElementById("stat-sold").textContent =
      sold.reduce((sum, o) => sum + o.total_price, 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    const thisMonth = new Date().toISOString().slice(0, 7);
    document.getElementById("stat-expenses").textContent =
      expenses.filter((e) => (e.expense_date || "").startsWith(thisMonth))
        .reduce((sum, e) => sum + e.amount, 0)
        .toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  } catch (err) {
    showToast("Couldn't load your overview yet.", "error");
  }
}

/* ---------- CROP ADVISORY ---------- */
let allCrops = [];
async function loadCropList() {
  window.__cropsLoaded = true;
  try {
    const { data } = await cachedGet("/crops", "crop_list");
    allCrops = data;
  } catch { /* offline with no cache yet — search box still usable once cached */ }
}
loadCropList();

const cropInput = document.getElementById("crop-search-input");
const cropSuggestions = document.getElementById("crop-suggestions");
const cropResult = document.getElementById("crop-result");

cropInput.addEventListener("input", () => {
  const q = cropInput.value.trim().toLowerCase();
  cropSuggestions.innerHTML = "";
  if (!q) return;
  const matches = allCrops.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
  if (!matches.length) return;
  const box = document.createElement("div");
  box.className = "crop-suggestions";
  matches.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${c.name} — ${c.category || ""}`;
    b.addEventListener("click", () => { cropInput.value = c.name; cropSuggestions.innerHTML = ""; searchCrop(c.name); });
    box.appendChild(b);
  });
  cropSuggestions.appendChild(box);
});

document.getElementById("crop-search-btn").addEventListener("click", () => searchCrop(cropInput.value.trim()));
cropInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchCrop(cropInput.value.trim()); } });

async function searchCrop(name) {
  if (!name) return;
  cropSuggestions.innerHTML = "";
  cropResult.innerHTML = `<p class="text-faint">Looking up ${name}…</p>`;
  try {
    const { data: crop } = await cachedGet(`/crops/${encodeURIComponent(name)}`, "crop_" + name.toLowerCase());
    renderCrop(crop);
  } catch (err) {
    cropResult.innerHTML = `<div class="empty-state"><h3>No advisory found</h3><p>${err.message || "Try another crop name, or check your connection."}</p></div>`;
  }
}

function renderCrop(c) {
  cropResult.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3>${c.name} <span class="badge">${c.category || ""}</span></h3>
        <span class="text-faint">${c.season || ""} · ${c.duration_days || ""}</span>
      </div>
      <div class="crop-timeline">
        <div class="crop-stage"><h4>Soil</h4><p class="mt-0">${c.soil_type || "—"}</p></div>
        <div class="crop-stage"><h4>1. Seeding</h4><p class="mt-0">${c.seeding_info || "—"}</p></div>
        <div class="crop-stage"><h4>2. Spacing</h4><p class="mt-0">${c.spacing_info || "—"}</p></div>
        <div class="crop-stage"><h4>3. Watering</h4><p class="mt-0">${c.watering_info || "—"}</p></div>
        <div class="crop-stage"><h4>4. Fertilizer</h4><p class="mt-0">${c.fertilizer_info || "—"}</p></div>
        <div class="crop-stage"><h4>5. Pest & disease control</h4><p class="mt-0">${c.pest_control || "—"}</p></div>
        <div class="crop-stage"><h4>6. Harvesting</h4><p class="mt-0">${c.harvesting_info || "—"}</p></div>
        <div class="crop-stage"><h4>7. Selling tips</h4><p class="mt-0">${c.selling_tips || "—"}</p></div>
      </div>
    </div>`;
}

/* ---------- MARKET PRICES ---------- */
async function loadPrices() {
  const wrap = document.getElementById("prices-table-wrap");
  try {
    const { data } = await cachedGet("/market-prices", "market_prices");
    if (!data.length) { wrap.innerHTML = `<div class="empty-state"><h3>No price data yet</h3></div>`; return; }
    wrap.innerHTML = `<table><thead><tr><th>Crop</th><th>Market</th><th>Price</th><th>Trend</th></tr></thead><tbody>
      ${data.map((p) => `<tr>
        <td>${p.crop_name}</td>
        <td>${p.market_name}</td>
        <td>₹${p.price_per_unit.toLocaleString("en-IN")} / ${p.unit}</td>
        <td><span class="badge ${p.trend}">${p.trend}</span></td>
      </tr>`).join("")}
    </tbody></table>`;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><h3>Prices unavailable offline</h3><p>Reconnect to fetch the latest market prices.</p></div>`;
  }
}

/* ---------- EXPENSES ---------- */
async function loadExpenses() {
  const wrap = document.getElementById("expenses-list");
  try {
    const { data } = await cachedGet("/expenses/mine", "farmer_expenses");
    renderExpenses(data);
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>No expense data cached yet</h3></div>`;
  }
}
function renderExpenses(rows) {
  const wrap = document.getElementById("expenses-list");
  if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><h3>No expenses logged yet</h3><p>Add your first one to start tracking.</p></div>`; return; }
  wrap.innerHTML = rows.map((e) => `
    <div class="produce-card">
      <div>
        <div class="name">${e.item} ${e.client_ref && !e.id ? '<span class="badge">pending sync</span>' : ""}</div>
        <div class="meta">${e.category} · ${e.expense_date || ""}${e.notes ? " · " + e.notes : ""}</div>
      </div>
      <div class="produce-actions">
        <div class="price">₹${e.amount.toLocaleString("en-IN")}</div>
        ${e.id ? `<button class="btn btn-sm btn-danger" data-del-expense="${e.id}">Delete</button>` : ""}
      </div>
    </div>`).join("");
  wrap.querySelectorAll("[data-del-expense]").forEach((b) => b.addEventListener("click", () => deleteExpense(b.dataset.delExpense)));
}
async function deleteExpense(id) {
  try {
    await apiRequest("DELETE", `/expenses/${id}`);
    showToast("Expense deleted.", "success");
    loadExpenses(); loadOverview();
  } catch (err) {
    showToast(err.offline ? "Can't delete while offline — reconnect first." : (err.message || "Delete failed."), "error");
  }
}

document.getElementById("add-expense-btn").addEventListener("click", () => document.getElementById("expense-modal").classList.add("show"));
document.getElementById("expense-cancel").addEventListener("click", () => document.getElementById("expense-modal").classList.remove("show"));
document.getElementById("expense-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    item: document.getElementById("exp-item").value.trim(),
    category: document.getElementById("exp-category").value,
    amount: parseFloat(document.getElementById("exp-amount").value),
    expense_date: document.getElementById("exp-date").value || undefined,
    crop_name: document.getElementById("exp-crop").value.trim() || undefined,
    notes: document.getElementById("exp-notes").value.trim() || undefined,
  };
  try {
    await apiRequest("POST", "/expenses", payload);
    showToast("Expense saved.", "success");
  } catch (err) {
    if (err.offline) {
      queueAction("add_expense", payload);
      // Optimistically mirror it into the cached list so it shows immediately.
      const cacheKey = "ac_cache_farmer_expenses";
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
      cached.unshift({ ...payload, expense_date: payload.expense_date || new Date().toISOString().slice(0, 10) });
      localStorage.setItem(cacheKey, JSON.stringify(cached));
      showToast("Offline — expense queued and will sync automatically.", "");
      renderStatusBar();
    } else {
      showToast(err.message || "Could not save expense.", "error");
    }
  }
  e.target.reset();
  document.getElementById("expense-modal").classList.remove("show");
  loadExpenses(); loadOverview();
});

/* ---------- MARKETPLACE (my listings) ---------- */
async function loadListings() {
  const wrap = document.getElementById("listings-list");
  try {
    const { data } = await cachedGet("/products/mine", "farmer_listings");
    renderListings(data);
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>No listings cached yet</h3></div>`;
  }
}
function renderListings(rows) {
  const wrap = document.getElementById("listings-list");
  if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><h3>You haven't listed anything yet</h3><p>Click "New listing" to put produce in front of buyers.</p></div>`; return; }
  wrap.innerHTML = rows.map((p) => `
    <div class="produce-card">
      <div>
        <div class="name">${p.crop_name} <span class="badge ${p.status === "available" ? "up" : "stable"}">${p.status}</span></div>
        <div class="meta">${p.quantity} ${p.unit} available${p.description ? " · " + p.description : ""}</div>
      </div>
      <div class="produce-actions">
        <div class="price">₹${p.price_per_unit.toLocaleString("en-IN")}/${p.unit}</div>
        ${p.id ? `<button class="btn btn-sm btn-danger" data-del-listing="${p.id}">Remove</button>` : `<span class="badge">pending sync</span>`}
      </div>
    </div>`).join("");
  wrap.querySelectorAll("[data-del-listing]").forEach((b) => b.addEventListener("click", () => deleteListing(b.dataset.delListing)));
}
async function deleteListing(id) {
  try {
    await apiRequest("DELETE", `/products/${id}`);
    showToast("Listing removed.", "success");
    loadListings(); loadOverview();
  } catch (err) {
    showToast(err.offline ? "Can't remove while offline — reconnect first." : (err.message || "Remove failed."), "error");
  }
}

document.getElementById("add-listing-btn").addEventListener("click", () => document.getElementById("listing-modal").classList.add("show"));
document.getElementById("listing-cancel").addEventListener("click", () => document.getElementById("listing-modal").classList.remove("show"));
document.getElementById("listing-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    crop_name: document.getElementById("lst-crop").value.trim(),
    quantity: parseFloat(document.getElementById("lst-qty").value),
    unit: document.getElementById("lst-unit").value,
    price_per_unit: parseFloat(document.getElementById("lst-price").value),
    description: document.getElementById("lst-desc").value.trim() || undefined,
  };
  try {
    await apiRequest("POST", "/products", payload);
    showToast("Listing published.", "success");
  } catch (err) {
    if (err.offline) {
      queueAction("add_product", payload);
      const cacheKey = "ac_cache_farmer_listings";
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]");
      cached.unshift({ ...payload, status: "available" });
      localStorage.setItem(cacheKey, JSON.stringify(cached));
      showToast("Offline — listing queued and will publish once you're back online.", "");
      renderStatusBar();
    } else {
      showToast(err.message || "Could not publish listing.", "error");
    }
  }
  e.target.reset();
  document.getElementById("listing-modal").classList.remove("show");
  loadListings(); loadOverview();
});

/* ---------- ORDERS RECEIVED ---------- */
const ORDER_STAGES = ["confirmed", "packed", "shipped", "delivered"];
async function loadSold() {
  const wrap = document.getElementById("sold-list");
  try {
    const { data } = await cachedGet("/orders/for-my-products", "farmer_sold");
    if (!data.length) { wrap.innerHTML = `<div class="empty-state"><h3>No orders yet</h3><p>Orders will show up here as soon as a buyer purchases your produce.</p></div>`; return; }
    wrap.innerHTML = data.map((o) => {
      const idx = ORDER_STAGES.indexOf(o.status);
      const nextStage = ORDER_STAGES[idx + 1];
      return `
      <div class="produce-card">
        <div>
          <div class="name">${o.crop_name} <span class="badge">${o.status}</span></div>
          <div class="meta">Buyer: ${o.buyer_name} · ${o.quantity} ${o.unit} · ₹${o.total_price.toLocaleString("en-IN")} · ${(o.created_at || "").slice(0, 10)}</div>
        </div>
        <div class="produce-actions">
          ${nextStage ? `<button class="btn btn-sm" data-advance="${o.id}" data-next="${nextStage}">Mark ${nextStage}</button>` : `<span class="badge up">complete</span>`}
        </div>
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-advance]").forEach((b) => b.addEventListener("click", () => advanceOrder(b.dataset.advance, b.dataset.next)));
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Orders unavailable offline</h3></div>`;
  }
}
async function advanceOrder(id, nextStage) {
  try {
    await apiRequest("PATCH", `/orders/${id}/status`, { status: nextStage });
    showToast(`Order marked as ${nextStage}.`, "success");
    loadSold();
  } catch (err) {
    showToast(err.offline ? "Updating order status needs a connection." : (err.message || "Could not update order."), "error");
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
loadExpenses();
loadListings();
loadProfile();
window.addEventListener("ac:synced", () => { loadOverview(); loadExpenses(); loadListings(); loadSold(); });
