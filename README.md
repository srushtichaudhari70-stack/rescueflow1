# RescueFlow

**Smart perishable aid coordination & recovery platform**

RescueFlow connects food and essential-aid donors, volunteer riders, shelters and an operations admin. It decides *who carries how much to which shelter* — and only allows a delivery when it is actually safe and feasible.

---

## Problem statement

**Social Impact & Civic Micro-Logistics — The Last-Mile Spoilage Trap: Coordinating Perishable Surplus & Fragile Aid Under Uncertainty.**

Surplus cooked food, infant formula and medicines often go to waste in the last mile because:

- food expires before it arrives,
- a rider is overloaded or never shows up ("ghost reservations"),
- a shelter's needs change while a rider is already on the way,
- aid is sent to a shelter that cannot use it (e.g. raw rations with no water or fuel).

## Solution

RescueFlow runs a transparent dispatch engine that checks **every** assignment against:

| Check | Rule |
|---|---|
| Expiry | `now + trip time ≤ expiry − safety buffer` (buffer is configurable) |
| Rider capacity | quantity ≤ rider's free capacity |
| Shelter demand & capacity | counts deliveries already on the way, so no shelter is over-served |
| Compatibility | raw rations need clean water + cooking fuel; infant formula needs clean water + sterile prep; medicine needs medical staff; cold-chain needs refrigeration |
| Stock | `available + reserved + collected + delivered + spoiled = quantity` — nothing is ever allocated twice |

When something goes wrong, it **recovers** instead of failing silently:

- **Ghost rider:** unacknowledged reservations time out, uncollected stock is released and reassigned. Collected cargo is never "released" back to stock.
- **Mid-route shelter change:** cargo already on the road is rerouted to the safest alternative shelter. If none exists, it is marked **At Risk** with an urgent alert — an unsafe delivery is never forced.

## Features

- Operations dashboard: KPIs, live deliveries, donation table, rider availability, shelter demand, urgent alerts, recent events
- Donations: create / edit / view / cancel, live quantity bar per batch
- Dispatch Center: priority queue with a points score (0–100) that explains itself, automatic quantity splitting, rejected riders/shelters with reasons, manual assignment with live validation, full delivery lifecycle buttons
- Reservation recovery with configurable acknowledgment deadline (auto-checked every 5 s)
- Automatic expiry handling
- Failure Simulator with 8 one-click scenarios for judges
- Activity log with filters and CSV export
- Live data-integrity check
- Everything saved in the browser (LocalStorage) — survives refresh

> The priority score is a simple, transparent formula (shelf-life urgency, aid criticality, demand, feasibility, rider availability). No machine learning is used.

## Technology stack

- React 18 + Vite 5
- Plain JavaScript and CSS
- Lucide React icons
- LocalStorage for persistence
- No backend, no API keys, no paid services

## Installation

You need **Node.js 18 or newer** (https://nodejs.org).

```bash
cd rescueflow
npm install
```

## Run the application

```bash
npm run dev
```

Open the link shown in the terminal (usually http://localhost:5173).

Other commands:

```bash
npm test        # runs 60 automated checks on the dispatch engine
npm run build   # production build into dist/
```

## Demo scenarios (Failure Simulator page)

1. **Urgent donation** – 180 meals with 75 min shelf-life jump to the top of the queue.
2. **Rider capacity test** – five riders with capacity 40 → split 40 + 40 + 40 + 40 + 20.
3. **Ghost rider** – rider never acknowledges → timeout → stock released → reassigned.
4. **Shelter closure** – Shelter A's demand drops to 0 (or it closes) while a rider is in transit → safe reroute, or At Risk alert.
5. **New donation received** – a shelter gets food from elsewhere → over-committed deliveries are re-planned, priorities recalculated.
6. **Expiry violation** – meals expiring in 22 min → dispatch blocked with the reason.
7. **Resource dependency** – raw ration kits to a shelter without water/fuel → rejected.
8. **Restore demo** – resets to the original sample data.

Suggested live demo: Restore demo → Scenario 2 → Dispatch Center (acknowledge, pickup, deliver) → Scenario 3 → Scenario 4 → refresh the browser to show persistence.

## Project structure

```
src/
  components/   UI pieces (sidebar, header, tables, cards, modals)
  pages/        Dashboard, Donations, Riders, Shelters, DispatchCenter, FailureSimulator, ActivityLogs
  services/
    dispatchEngine.js       eligibility, trip time, expiry checks, splitting, priority score, reroute search
    reservationService.js   reservations, acknowledgment, timeout recovery, delivery lifecycle, integrity checks
    compatibilityService.js aid ↔ shelter resource rules
    scenarioService.js      failure simulator scenarios
    storageService.js       LocalStorage save/load
    logService.js           activity log + alerts
  context/AppContext.jsx    app state, auto-save, background checks, toasts, confirm dialogs
  data/                     demo data and constants
  utils/                    time and ID helpers
scripts/test-engine.mjs     automated tests
```

## Future improvements

- Real maps and live GPS travel times
- Rider mobile app with push notifications for acknowledgment
- Backend database and multi-user accounts for donors and shelters
- SMS/WhatsApp alerts for shelter coordinators
- Historical analytics on waste prevented

## Note

This is a hackathon prototype. Travel times are estimates per rider and shelter, and all data lives in the browser.
