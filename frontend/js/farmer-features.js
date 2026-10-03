/* ============================================================
   AgriConnect — Farmer extra features
   (My Crops, Crop Planner, Soil & Fertilizer, Profit Calculator,
   Farm Analytics, Nearby Markets, Farm Inventory, Weather, Notifications)
   Relies on `user`, apiRequest/cachedGet/queueAction/showToast/renderStatusBar
   already defined by api.js + farmer.js, loaded before this file.
   ============================================================ */

/* ---------- lazy-load dispatcher, called by farmer.js's goTo() ---------- */
const farmerSectionLoaders = {
  mycrops: loadMyCrops,
  planner: loadPlanner,
  soil: loadSoilLog,
  analytics: loadFarmAnalytics,
  nearbymarkets: loadNearbyMarkets,
  inventory: loadInventory,
  weather: loadWeather,
  notifications: loadNotifications,
  messages: loadThreads,
};
window.onFarmerSectionOpen = (section) => { if (farmerSectionLoaders[section]) farmerSectionLoaders[section](); };

function fmtMoney(n) { return (n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }); }
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000);
  return diff;
}

/* ============================================================
   MY CROPS + CROP PLANNER  (share the my_crops table; planner
   just filters status='planned' and shows harvest countdowns)
   ============================================================ */
let myCropsCache = [];

async function loadMyCrops() {
  const wrap = document.getElementById("mycrops-list");
  try {
    const { data } = await cachedGet("/my-crops/mine", "my_crops");
    myCropsCache = data;
    const growing = data.filter((c) => c.status !== "planned");
    if (!growing.length) { wrap.innerHTML = `<div class="empty-state"><h3>Nothing logged yet</h3><p>Add what you're currently growing.</p></div>`; return; }
    wrap.innerHTML = growing.map(renderMyCropCard).join("");
    wireMyCropButtons(wrap);
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>No crop data cached yet</h3></div>`;
  }
}

function renderMyCropCard(c) {
  const dLeft = daysUntil(c.expected_harvest_date);
  const dueBadge = c.status === "active" && dLeft !== null
    ? (dLeft < 0 ? `<span class="badge down">overdue ${Math.abs(dLeft)}d</span>` : `<span class="badge ${dLeft <= 7 ? "down" : "stable"}">${dLeft}d to harvest</span>`)
    : "";
  return `
    <div class="produce-card">
      <div>
        <div class="name">${c.crop_name} <span class="badge ${c.status === "harvested" ? "up" : "stable"}">${c.status}</span> ${dueBadge}</div>
        <div class="meta">${c.area ? c.area + " " + c.area_unit + " · " : ""}Planted ${c.planted_date}${c.expected_harvest_date ? " · Est. harvest " + c.expected_harvest_date : ""}${c.notes ? " · " + c.notes : ""}</div>
      </div>
      <div class="produce-actions">
        ${c.status === "active" ? `<button class="btn btn-sm btn-outline" data-harvest="${c.id}">Mark harvested</button>` : ""}
        <button class="btn btn-sm btn-danger" data-del-crop="${c.id}">Remove</button>
      </div>
    </div>`;
}
function wireMyCropButtons(scope) {
  scope.querySelectorAll("[data-harvest]").forEach((b) => b.addEventListener("click", () => updateMyCrop(b.dataset.harvest, { status: "harvested" })));
  scope.querySelectorAll("[data-del-crop]").forEach((b) => b.addEventListener("click", () => deleteMyCrop(b.dataset.delCrop)));
  scope.querySelectorAll("[data-plant]").forEach((b) => b.addEventListener("click", () => updateMyCrop(b.dataset.plant, { status: "active" })));
}
async function updateMyCrop(id, body) {
  try {
    await apiRequest("PUT", `/my-crops/${id}`, body);
    showToast("Updated.", "success");
    loadMyCrops(); loadPlanner();
  } catch (err) {
    showToast(err.offline ? "Needs a connection to update." : (err.message || "Could not update."), "error");
  }
}
async function deleteMyCrop(id) {
  try {
    await apiRequest("DELETE", `/my-crops/${id}`);
    showToast("Removed.", "success");
    loadMyCrops(); loadPlanner();
  } catch (err) {
    showToast(err.offline ? "Needs a connection to remove." : (err.message || "Could not remove."), "error");
  }
}

document.getElementById("add-mycrop-btn").addEventListener("click", () => openMyCropModal("active"));
document.getElementById("add-planned-btn").addEventListener("click", () => openMyCropModal("planned"));
document.getElementById("mycrop-cancel").addEventListener("click", () => document.getElementById("mycrop-modal").classList.remove("show"));

function openMyCropModal(status) {
  document.getElementById("mycrop-status-field").value = status;
  document.getElementById("mycrop-modal-title").textContent = status === "planned" ? "Plan a crop" : "Add crop";
  document.getElementById("mc-date-label").textContent = status === "planned" ? "Planned planting date" : "Planted date";
  document.getElementById("mycrop-form").reset();
  document.getElementById("mycrop-modal").classList.add("show");
}

document.getElementById("mycrop-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = document.getElementById("mycrop-status-field").value;
  const payload = {
    crop_name: document.getElementById("mc-crop").value.trim(),
    area: parseFloat(document.getElementById("mc-area").value) || undefined,
    area_unit: document.getElementById("mc-area-unit").value,
    planted_date: document.getElementById("mc-planted-date").value,
    notes: document.getElementById("mc-notes").value.trim() || undefined,
    status,
  };
  try {
    await apiRequest("POST", "/my-crops", payload);
    showToast(status === "planned" ? "Added to your plan." : "Crop added.", "success");
  } catch (err) {
    if (err.offline) {
      queueAction("add_my_crop", payload);
      const cached = JSON.parse(localStorage.getItem("ac_cache_my_crops") || "[]");
      cached.unshift(payload);
      localStorage.setItem("ac_cache_my_crops", JSON.stringify(cached));
      showToast("Offline — queued and will sync automatically.", "");
      renderStatusBar();
    } else {
      showToast(err.message || "Could not save.", "error");
    }
  }
  document.getElementById("mycrop-modal").classList.remove("show");
  loadMyCrops(); loadPlanner();
});

async function loadPlanner() {
  const plannedWrap = document.getElementById("planner-planned");
  const upcomingWrap = document.getElementById("planner-upcoming");
  try {
    const { data } = await cachedGet("/my-crops/mine", "my_crops");
    myCropsCache = data;
    const planned = data.filter((c) => c.status === "planned");
    const active = data.filter((c) => c.status === "active" && c.expected_harvest_date)
      .sort((a, b) => a.expected_harvest_date.localeCompare(b.expected_harvest_date));

    plannedWrap.innerHTML = planned.length
      ? planned.map((c) => `
        <div class="produce-card">
          <div><div class="name">${c.crop_name}</div><div class="meta">Target planting: ${c.planted_date}${c.area ? " · " + c.area + " " + c.area_unit : ""}</div></div>
          <div class="produce-actions">
            <button class="btn btn-sm" data-plant="${c.id}">Mark as planted</button>
            <button class="btn btn-sm btn-danger" data-del-crop="${c.id}">Remove</button>
          </div>
        </div>`).join("")
      : `<div class="empty-state"><h3>Nothing planned yet</h3><p>Use "Plan a crop" to line up your next planting.</p></div>`;

    upcomingWrap.innerHTML = active.length
      ? active.map(renderMyCropCard).join("")
      : `<div class="empty-state"><h3>No active crops with a harvest date</h3></div>`;

    wireMyCropButtons(plannedWrap);
    wireMyCropButtons(upcomingWrap);
  } catch {
    plannedWrap.innerHTML = upcomingWrap.innerHTML = `<div class="empty-state"><h3>Unavailable offline</h3></div>`;
  }
}

/* ============================================================
   SOIL & FERTILIZER
   ============================================================ */
document.getElementById("soil-recommend-btn").addEventListener("click", async () => {
  const crop = document.getElementById("soil-crop-input").value.trim();
  const out = document.getElementById("soil-recommend-result");
  if (!crop) return;
  out.innerHTML = `<p class="text-faint">Looking up ${crop}…</p>`;
  try {
    const data = await apiRequest("GET", `/soil/recommend/${encodeURIComponent(crop)}`);
    out.innerHTML = `
      <div class="crop-stage" style="margin-top:1em;">
        <h4>${data.name} — Soil</h4><p class="mt-0">${data.soil_type || "—"}</p>
      </div>
      <div class="crop-stage" style="margin-top:0.8em;">
        <h4>Fertilizer guidance</h4><p class="mt-0">${data.fertilizer_info || "—"}</p>
      </div>`;
  } catch (err) {
    out.innerHTML = `<div class="empty-state"><h3>No data found</h3><p>${err.message || "Try another crop name."}</p></div>`;
  }
});

async function loadSoilLog() {
  const wrap = document.getElementById("soil-list");
  try {
    const { data } = await cachedGet("/soil/mine", "soil_records");
    if (!data.length) { wrap.innerHTML = `<div class="empty-state"><h3>No readings logged yet</h3></div>`; return; }
    wrap.innerHTML = data.map((s) => `
      <div class="produce-card">
        <div>
          <div class="name">${s.crop_name || "General"} ${s.soil_type ? "· " + s.soil_type : ""}</div>
          <div class="meta">${s.ph ? "pH " + s.ph + " · " : ""}${[s.nitrogen && "N:" + s.nitrogen, s.phosphorus && "P:" + s.phosphorus, s.potassium && "K:" + s.potassium].filter(Boolean).join(" ")}${s.notes ? " · " + s.notes : ""} · ${s.recorded_at}</div>
        </div>
        <div class="produce-actions"><button class="btn btn-sm btn-danger" data-del-soil="${s.id}">Delete</button></div>
      </div>`).join("");
    wrap.querySelectorAll("[data-del-soil]").forEach((b) => b.addEventListener("click", async () => {
      try { await apiRequest("DELETE", `/soil/${b.dataset.delSoil}`); loadSoilLog(); } catch (err) { showToast(err.message || "Could not delete.", "error"); }
    }));
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>No soil data cached yet</h3></div>`;
  }
}
document.getElementById("add-soil-btn").addEventListener("click", () => document.getElementById("soil-modal").classList.add("show"));
document.getElementById("soil-cancel").addEventListener("click", () => document.getElementById("soil-modal").classList.remove("show"));
document.getElementById("soil-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    crop_name: document.getElementById("soil-crop").value.trim() || undefined,
    soil_type: document.getElementById("soil-type").value.trim() || undefined,
    ph: parseFloat(document.getElementById("soil-ph").value) || undefined,
    nitrogen: document.getElementById("soil-n").value.trim() || undefined,
    phosphorus: document.getElementById("soil-p").value.trim() || undefined,
    potassium: document.getElementById("soil-k").value.trim() || undefined,
    notes: document.getElementById("soil-notes").value.trim() || undefined,
  };
  try {
    await apiRequest("POST", "/soil", payload);
    showToast("Reading saved.", "success");
  } catch (err) {
    showToast(err.offline ? "Soil log needs a connection right now." : (err.message || "Could not save."), "error");
  }
  e.target.reset();
  document.getElementById("soil-modal").classList.remove("show");
  loadSoilLog();
});

/* ============================================================
   PROFIT CALCULATOR
   ============================================================ */
document.getElementById("profit-calc-btn").addEventListener("click", async () => {
  const crop = document.getElementById("profit-crop-input").value.trim();
  const price = document.getElementById("profit-price-input").value;
  const out = document.getElementById("profit-result");
  if (!crop) return;
  out.innerHTML = `<p class="text-faint">Calculating…</p>`;
  try {
    const q = price ? `?crop=${encodeURIComponent(crop)}&price=${price}` : `?crop=${encodeURIComponent(crop)}`;
    const d = await apiRequest("GET", `/analytics/profit${q}`);
    const profitClass = d.profit >= 0 ? "leaf" : "rust";
    out.innerHTML = `
      <div class="grid grid-3">
        <div class="stat-card"><div class="label">Total expenses (${d.crop})</div><div class="value">${fmtMoney(d.total_expenses)}</div></div>
        <div class="stat-card leaf"><div class="label">Total revenue</div><div class="value">${fmtMoney(d.total_revenue)}</div></div>
        <div class="stat-card ${profitClass}"><div class="label">Profit</div><div class="value">${fmtMoney(d.profit)}</div></div>
      </div>
      <div class="card">
        ${d.price_per_unit_used
          ? `<p>Using a price of <strong>₹${d.price_per_unit_used.toFixed(2)}/unit</strong>, you need to sell <strong>${Math.ceil(d.break_even_units)} units</strong> to break even.</p>
             <p>You've sold <strong>${d.units_sold} units</strong> so far — ${d.has_broken_even ? "<span class=\"badge up\">you've broken even 🎉</span>" : `<strong>${Math.ceil(d.units_remaining_to_break_even)} units</strong> to go.`}</p>`
          : `<p class="text-faint">No price on record for ${d.crop} yet — list it or enter an override price above to see break-even.</p>`}
      </div>`;
  } catch (err) {
    out.innerHTML = `<div class="empty-state"><h3>Couldn't calculate</h3><p>${err.message || ""}</p></div>`;
  }
});

/* ============================================================
   FARM ANALYTICS
   ============================================================ */
async function loadFarmAnalytics() {
  try {
    const d = await apiRequest("GET", "/analytics/farm");
    document.getElementById("an-total-expenses").textContent = fmtMoney(d.totals.total_expenses);
    document.getElementById("an-total-revenue").textContent = fmtMoney(d.totals.total_revenue);
    document.getElementById("an-total-profit").textContent = fmtMoney(d.totals.profit);

    renderBars("an-expense-cat", d.expenseByCategory.map((r) => ({ label: r.category, value: r.total })), "rust");
    renderBars("an-revenue-crop", d.revenueByCrop.map((r) => ({ label: r.crop_name, value: r.total })), "leaf");

    const months = {};
    d.expenseByMonth.forEach((r) => { months[r.month] = months[r.month] || {}; months[r.month].expense = r.total; });
    d.revenueByMonth.forEach((r) => { months[r.month] = months[r.month] || {}; months[r.month].revenue = r.total; });
    const monthKeys = Object.keys(months).sort();
    const wrap = document.getElementById("an-monthly");
    if (!monthKeys.length) { wrap.innerHTML = `<p class="text-faint">Not enough data yet.</p>`; return; }
    const max = Math.max(...monthKeys.map((m) => Math.max(months[m].expense || 0, months[m].revenue || 0)), 1);
    wrap.innerHTML = monthKeys.map((m) => `
      <div class="bar-row"><div class="bar-label">${m} revenue</div><div class="bar-track"><div class="bar-fill leaf" style="width:${((months[m].revenue || 0) / max) * 100}%"></div></div><div class="bar-value">${fmtMoney(months[m].revenue || 0)}</div></div>
      <div class="bar-row"><div class="bar-label">${m} expense</div><div class="bar-track"><div class="bar-fill rust" style="width:${((months[m].expense || 0) / max) * 100}%"></div></div><div class="bar-value">${fmtMoney(months[m].expense || 0)}</div></div>
    `).join("");
  } catch (err) {
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
      <div class="bar-track"><div class="bar-fill ${colorClass}" style="width:${(r.value / max) * 100}%"></div></div>
      <div class="bar-value">${fmtMoney(r.value)}</div>
    </div>`).join("");
}

/* ============================================================
   NEARBY MARKETS
   ============================================================ */
async function loadNearbyMarkets() {
  const wrap = document.getElementById("nearby-markets-list");
  try {
    const { data } = await cachedGet("/markets", "nearby_markets");
    wrap.innerHTML = data.map((m) => `
      <div class="produce-card">
        <div>
          <div class="name">${m.name}</div>
          <div class="meta">${m.location || ""} · ${m.market_type || ""}${m.contact ? " · " + m.contact : ""}${m.crops_traded ? " · Trades: " + m.crops_traded : ""}</div>
        </div>
        <div class="produce-actions"><div class="price">${m.distance_km} km</div></div>
      </div>`).join("");
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Unavailable offline</h3></div>`;
  }
}

/* ============================================================
   FARM INVENTORY
   ============================================================ */
async function loadInventory() {
  const wrap = document.getElementById("inventory-list");
  try {
    const { data } = await cachedGet("/inventory/mine", "inventory");
    if (!data.length) { wrap.innerHTML = `<div class="empty-state"><h3>Nothing tracked yet</h3><p>Add seeds, fertilizer or tools to get low-stock alerts.</p></div>`; return; }
    wrap.innerHTML = data.map((i) => `
      <div class="produce-card">
        <div>
          <div class="name">${i.item_name} ${i.low_stock ? '<span class="badge down">low stock</span>' : ""}</div>
          <div class="meta">${i.category} · ${i.quantity} ${i.unit} on hand${i.low_stock_threshold ? " · alert below " + i.low_stock_threshold + " " + i.unit : ""}</div>
        </div>
        <div class="produce-actions">
          <button class="btn btn-sm btn-outline" data-restock="${i.id}">+ Restock</button>
          <button class="btn btn-sm btn-danger" data-del-inv="${i.id}">Remove</button>
        </div>
      </div>`).join("");
    wrap.querySelectorAll("[data-restock]").forEach((b) => b.addEventListener("click", async () => {
      const amount = prompt("Add how much quantity?");
      if (!amount || isNaN(amount)) return;
      const item = data.find((x) => String(x.id) === b.dataset.restock);
      try {
        await apiRequest("PUT", `/inventory/${b.dataset.restock}`, { quantity: item.quantity + parseFloat(amount) });
        loadInventory(); loadNotifications();
      } catch (err) { showToast(err.message || "Could not update.", "error"); }
    }));
    wrap.querySelectorAll("[data-del-inv]").forEach((b) => b.addEventListener("click", async () => {
      try { await apiRequest("DELETE", `/inventory/${b.dataset.delInv}`); loadInventory(); } catch (err) { showToast(err.message || "Could not remove.", "error"); }
    }));
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>No inventory cached yet</h3></div>`;
  }
}
document.getElementById("add-inventory-btn").addEventListener("click", () => document.getElementById("inventory-modal").classList.add("show"));
document.getElementById("inventory-cancel").addEventListener("click", () => document.getElementById("inventory-modal").classList.remove("show"));
document.getElementById("inventory-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    item_name: document.getElementById("inv-name").value.trim(),
    category: document.getElementById("inv-category").value,
    unit: document.getElementById("inv-unit").value,
    quantity: parseFloat(document.getElementById("inv-qty").value) || 0,
    low_stock_threshold: parseFloat(document.getElementById("inv-threshold").value) || 0,
  };
  try {
    await apiRequest("POST", "/inventory", payload);
    showToast("Item added.", "success");
  } catch (err) {
    if (err.offline) {
      queueAction("add_inventory_item", payload);
      const cached = JSON.parse(localStorage.getItem("ac_cache_inventory") || "[]");
      cached.unshift(payload);
      localStorage.setItem("ac_cache_inventory", JSON.stringify(cached));
      showToast("Offline — queued and will sync automatically.", "");
      renderStatusBar();
    } else {
      showToast(err.message || "Could not save.", "error");
    }
  }
  e.target.reset();
  document.getElementById("inventory-modal").classList.remove("show");
  loadInventory();
});

/* ============================================================
   WEATHER
   ============================================================ */
async function loadWeather() {
  const wrap = document.getElementById("weather-result");
  const location = document.getElementById("weather-location-input").value.trim();
  wrap.innerHTML = `<p class="text-faint">Fetching forecast…</p>`;
  try {
    const q = location ? `?location=${encodeURIComponent(location)}` : "";
    const d = await apiRequest("GET", `/weather${q}`);
    const cur = d.current || {};
    const daily = d.daily || {};
    let daysHtml = "";
    if (daily.time) {
      daysHtml = daily.time.map((t, i) => `
        <div class="weather-day">
          <div class="d">${new Date(t).toLocaleDateString(undefined, { weekday: "short" })}</div>
          <div class="hi">${Math.round(daily.temperature_2m_max[i])}°</div>
          <div class="lo">${Math.round(daily.temperature_2m_min[i])}°</div>
          <div class="text-faint" style="font-size:0.72rem;">${daily.precipitation_probability_max ? daily.precipitation_probability_max[i] + "% rain" : ""}</div>
        </div>`).join("");
    }
    wrap.innerHTML = `
      <p class="text-faint">${d.resolved_location}</p>
      <div class="weather-now">
        <span class="temp">${cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) + "°C" : "—"}</span>
        <span class="text-faint">Humidity ${cur.relative_humidity_2m ?? "—"}% · Wind ${cur.wind_speed_10m ?? "—"} km/h · Rain ${cur.precipitation ?? 0}mm</span>
      </div>
      <div class="weather-days">${daysHtml}</div>`;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><h3>Couldn't load weather</h3><p>${err.message || "Check your connection or set a location in your profile."}</p></div>`;
  }
}
document.getElementById("weather-refresh-btn").addEventListener("click", loadWeather);

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
        <div class="notif-body">
          ${n.message}
          <div class="notif-time">${new Date(n.created_at).toLocaleString()}</div>
        </div>
        ${!n.is_read ? `<button class="btn btn-sm btn-outline" data-read="${n.id}">Mark read</button>` : ""}
      </div>`).join("");
    wrap.querySelectorAll("[data-read]").forEach((b) => b.addEventListener("click", async () => {
      await apiRequest("PUT", `/notifications/${b.dataset.read}/read`);
      loadNotifications();
    }));
  } catch {
    wrap.innerHTML = `<div class="empty-state"><h3>Unavailable offline</h3></div>`;
  }
}
document.getElementById("mark-all-read-btn").addEventListener("click", async () => {
  try { await apiRequest("PUT", "/notifications/read-all"); loadNotifications(); } catch (err) { showToast(err.message || "Could not update.", "error"); }
});

/* ---------- boot: load lightweight badges/data up front ---------- */
loadNotifications();
loadMyCrops();
window.addEventListener("ac:synced", () => { loadMyCrops(); loadInventory(); loadNotifications(); });

/* ============================================================
   MESSAGES (farmer side — reply to buyers)
   ============================================================ */
let activeThread = null;

async function loadThreads() {
  const wrap = document.getElementById("thread-list");
  try {
    const rows = await apiRequest("GET", "/messages/threads");
    if (!rows.length) { wrap.innerHTML = `<p class="text-faint">No conversations yet — buyers will message you about your listings here.</p>`; return; }
    wrap.innerHTML = rows.map((t) => `
      <div class="thread-item" data-open-thread data-product="${t.product_id ?? ""}" data-counterpart="${t.seller_id}" data-name="${t.seller_name}" data-crop="${t.crop_name || "General"}">
        <div class="thread-meta"><div class="crop">${t.crop_name || "General"} — ${t.seller_name}</div><div class="preview">${t.last_body || ""}</div></div>
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
      <div class="chat-bubble ${m.sender_role === "farmer" ? "me" : "them"}">
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
    const [crop, name] = document.getElementById("chat-title").textContent.split(" — ");
    openThread(activeThread.productId, activeThread.counterpartId, name, crop);
  } catch (err) {
    showToast(err.offline ? "Messages need a connection." : (err.message || "Could not send."), "error");
  }
});
