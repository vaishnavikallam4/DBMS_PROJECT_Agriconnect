/* ==========================================================
   AgriConnect — shared API client + offline-first sync layer
   - Wraps fetch() with auth headers
   - Queues writes (add listing, add expense, place order) in
     localStorage when offline, and replays them via /api/sync
     the moment the connection (even a weak one) comes back.
   - Caches GET responses so dashboards still render offline.
   ========================================================== */

const API_BASE = "/api";
const LS_TOKEN = "ac_token";
const LS_USER = "ac_user";
const LS_QUEUE = "ac_queue";
const LS_CACHE_PREFIX = "ac_cache_";

/* ---------- auth/session ---------- */
function getToken() { return localStorage.getItem(LS_TOKEN); }
function setSession(token, user) {
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_USER, JSON.stringify(user));
}
function getUser() {
  try { return JSON.parse(localStorage.getItem(LS_USER)); } catch { return null; }
}
function clearSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
}
function requireAuth(role) {
  const user = getUser();
  if (!getToken() || !user) { window.location.href = "login.html"; return null; }
  if (role && user.role !== role) {
    window.location.href = user.role === "farmer" ? "farmer-dashboard.html" : "seller-dashboard.html";
    return null;
  }
  return user;
}
function logout() { clearSession(); window.location.href = "login.html"; }

/* ---------- low-level request ---------- */
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function apiRequest(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    const reallyOffline = !navigator.onLine;
    const err = new Error(
      reallyOffline
        ? "offline"
        : "Can't reach the AgriConnect server. Start it first: open a terminal in the backend folder and run \"npm start\", then reload this page."
    );
    err.offline = reallyOffline;
    err.serverUnreachable = !reallyOffline;
    throw err;
  }

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    if (res.status === 401) { clearSession(); window.location.href = "login.html"; }
    const err = new Error((data && data.error) || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- GET-with-cache (so pages render offline) ---------- */
async function cachedGet(path, cacheKey) {
  try {
    const data = await apiRequest("GET", path);
    localStorage.setItem(LS_CACHE_PREFIX + cacheKey, JSON.stringify(data));
    return { data, fromCache: false };
  } catch (err) {
    const cached = localStorage.getItem(LS_CACHE_PREFIX + cacheKey);
    if (cached) return { data: JSON.parse(cached), fromCache: true };
    throw err;
  }
}

/* ---------- offline write queue ---------- */
function getQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE)) || []; } catch { return []; }
}
function saveQueue(q) { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); }
function queueAction(type, payload) {
  const client_ref = uuid();
  const q = getQueue();
  q.push({ type, payload, client_ref, queued_at: new Date().toISOString() });
  saveQueue(q);
  return client_ref;
}

let syncing = false;
async function syncQueue() {
  if (syncing) return;
  const q = getQueue();
  if (!q.length || !navigator.onLine) return;
  syncing = true;
  try {
    const result = await apiRequest("POST", "/sync", { actions: q });
    const failedRefs = new Set(
      (result.results || []).filter((r) => r.status === "error").map((r) => r.client_ref)
    );
    // Keep only actions that failed for a reason other than "already offline"
    const remaining = q.filter((a) => failedRefs.has(a.client_ref));
    saveQueue(remaining);
    return result.results || [];
  } catch (err) {
    // Still offline or server unreachable — leave queue untouched.
    return null;
  } finally {
    syncing = false;
  }
}

/* ---------- shared UI bits: status bar + toast ---------- */
function renderStatusBar() {
  const bar = document.getElementById("status-bar");
  if (!bar) return;
  const q = getQueue();
  const online = navigator.onLine;
  bar.classList.toggle("offline", !online);
  bar.innerHTML = `
    <span class="status-dot"></span>
    <span>${online ? "Online — synced with server" : "Offline — working from local data"}</span>
    ${q.length ? `<span class="pending">${q.length} change${q.length > 1 ? "s" : ""} pending sync</span>` : ""}
  `;
}

function showToast(message, type = "") {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function trySyncAndRefresh(onSynced) {
  const results = await syncQueue();
  renderStatusBar();
  if (results && results.length) {
    const ok = results.filter((r) => r.status === "ok").length;
    if (ok) showToast(`Synced ${ok} pending change${ok > 1 ? "s" : ""} with the server.`, "success");
    if (onSynced) onSynced();
  }
}

window.addEventListener("online", () => trySyncAndRefresh(() => window.dispatchEvent(new Event("ac:synced"))));
window.addEventListener("offline", renderStatusBar);
document.addEventListener("DOMContentLoaded", () => {
  renderStatusBar();
  if (navigator.onLine) trySyncAndRefresh(() => window.dispatchEvent(new Event("ac:synced")));
  setInterval(() => { if (navigator.onLine) trySyncAndRefresh(() => window.dispatchEvent(new Event("ac:synced"))); }, 20000);
});
