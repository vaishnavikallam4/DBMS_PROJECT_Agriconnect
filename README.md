# AgriConnect — Offline-First Farmer Marketplace & Advisory Platform

A full-stack DBMS project: farmers and buyers ("sellers") register, log in, and use
role-based dashboards. Farmers track expenses, look up crop advisory info, check
market prices, and list produce for sale. Sellers browse the marketplace and buy
listed produce. Every write (new listing, new expense, a purchase) still works
while offline and automatically syncs once the connection returns.

## Project structure

```
agriconnect/
├── backend/            Node.js + Express API, SQLite database
│   ├── server.js
│   ├── db/init.js      schema + seed data (10 crops, 7 days of market prices)
│   ├── middleware/auth.js
│   └── routes/         auth, products, orders, expenses, crops, market, profile, sync
└── frontend/           Plain HTML/CSS/JS (no build step)
    ├── login.html
    ├── register.html
    ├── farmer-dashboard.html
    ├── seller-dashboard.html
    ├── css/style.css
    └── js/{api.js, auth logic per page}
```

## Running it

Requires **Node.js 18+** installed on your computer (download from nodejs.org if
you don't have it — this is not optional, the app has a real server).

**Easiest way:** double-click `start-windows.bat` (Windows) or
`start-mac-linux.command` (Mac/Linux) in this folder. It installs dependencies
on first run, starts the server, and opens the login page for you.

**Manual way:**
```bash
cd backend
npm install
npm start
```

Either way, this starts the API **and** serves the frontend from the same
server, so the app lives at:

```
http://localhost:4000/login.html
```

⚠️ **Do not just double-click the `.html` files in `frontend/`.** Without the
server running, every button will fail — that's the "offline"/"can't reach
server" message you'd see. The server has to be running in the background the
whole time you use the app; closing its terminal window stops it.

Register a Farmer account and a Seller account (in two different browser tabs, or
one after logging out) to see both dashboards and try a full sale end to end.

The database is a single file at `backend/data/agriconnect.db` (SQLite via
`better-sqlite3` — no separate database server to install). Delete that file to
reset all data back to the seeded crops/prices with no users.

## How the roles work

**Farmer** — Overview, My Crops, Crop Planner, Crop Advisory (seeding→selling guides
for 10 crops), Soil & Fertilizer (log readings + crop-specific recommendations),
Expenses (taggable by crop), Profit Calculator + break-even, Farm Analytics
(expense/revenue breakdowns with built-in bar charts), Market Prices, Nearby
Markets, Sell Produce (marketplace listings), Farm Inventory with low-stock
alerts, Orders Received (advance status: confirmed → packed → shipped →
delivered), Messages (reply to buyers), Weather & Farm Conditions (live 5-day
forecast via Open-Meteo — needs internet on the machine running the server),
Notifications, Profile.

**Seller** — Overview, Browse Produce (search), Saved Items, My Purchases,
Order Tracking (visual status stepper), Purchase Analytics, Price Comparison
(every farmer's price for a crop side by side), Nearby Farmers (with ratings),
Market Prices, Messages, My Reviews (rate a farmer after a delivered order),
Notifications, Profile.

All buttons/nav items switch between real sections or call the API — nothing
is a dead link or placeholder.

## Offline-first behaviour

- `frontend/js/api.js` wraps every request. If a GET fails due to no connection,
  it falls back to the last successful response cached in `localStorage`.
- If a write (new expense, new listing, placing an order) fails because the
  device is offline, it's queued in `localStorage` and the UI updates optimistically
  with a "pending sync" badge.
- The moment the browser fires an `online` event (or every 20s while online), the
  queue is replayed against `POST /api/sync`, which the backend applies in order
  and reports back per-action success/failure.

## Extending toward the original Spring Boot + MySQL plan

Every route in `backend/routes/*.js` uses plain parameterized SQL strings against
`better-sqlite3` — there's no ORM magic to unwind. Porting later means swapping
`db/init.js`'s driver/connection for a MySQL client and translating the `CREATE
TABLE` statements (or the equivalent Spring Boot/JPA entities) 1:1; the route
logic and the entire frontend stay the same since they only talk to the
`/api/...` JSON contract.
