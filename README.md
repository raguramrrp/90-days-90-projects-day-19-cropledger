# CropLedger — Agricultural Market Intelligence & Selling Decision Platform

**Know the market. Understand the price. Choose with evidence.**

CropLedger is a full-stack Indian AgriTech market intelligence and selling decision platform built for farmers, agricultural traders, commission agents, Farmer Producer Organizations (FPOs), and market analysts. Rather than ranking agricultural markets (APMCs) solely by headline modal price, CropLedger computes **Estimated Net Return** after road transport, mandi commission, and handling deductions, pairs multi-market comparison with transparent data-quality auditing, and enforces leakage-free chronological evaluation for 7-day price projections.

> **90 Days – 90 Projects Challenge · Day 19**

---

## 1. Problem Statement & Who This Is For

Selling farm produce across nearby and regional APMCs involves fragmented daily quotes, inconsistent units, missing reporting dates, and hidden logistics deductions. A distant mandi quoting a higher headline ₹/quintal rate frequently yields a **lower net payout** once haulage distance and commission fees are deducted.

CropLedger directly answers five practical selling questions:

1. What is the latest reported modal, minimum, and maximum price for my crop (in ₹/quintal)?
2. Which agricultural market offers a higher reported price right now?
3. Which market provides the **best estimated net return** after transport, commission, and handling expenses?
4. How have prices and arrival volumes shifted across recent days, months, and seasons?
5. What does the historical record—with explicit uncertainty bounds and data-freshness checks—suggest about current selling conditions?

**Target Users:** Farmers, FPOs, commission agents, agricultural traders, agri-researchers, and students.

---

## 2. Visual Walkthrough (Verified Screenshots)

> All screenshots below were captured from the live CropLedger FastAPI + React production server running in **Demo Mode** against the `CropLedger Demo Dataset (AGMARKNET Schema)` (`44,700` seeded records across 21 commodities—including 12 vegetables with per-kg pricing—and 27 Indian markets).

### Market Overview & Daily Briefing
![CropLedger Market Overview Dashboard](screenshots/overview-dashboard.png)

### Net-Return Price Advisor & What-If Calculator
![CropLedger Price Advisor](screenshots/price-advisor.png)

### Interactive APMC Market Atlas (OpenStreetMap + Leaflet)
![CropLedger Market Atlas](screenshots/market-atlas.png)

### Crop Intelligence & Arrival-vs-Price Analytics
![CropLedger Crop Intelligence](screenshots/crop-intelligence.png)

### Chronological 7-Day Forecast & Baseline Evaluation
![CropLedger Forecast & Trends](screenshots/forecast-trends.png)

### Data Quality Centre & Official Ingestion Audit
![CropLedger Data Quality Centre](screenshots/data-quality.png)

### Responsive Mobile Layout (390 × 844)
![CropLedger Mobile Overview](screenshots/mobile-overview.png)

---

## 3. Key Features Across 10 Workspace Modules

1. **Market Overview (`/overview`)** — Daily market briefing with non-interpolated historical price charts (`7D`, `30D`, `90D`, `1Y`), followed crop movers, day-over-day gainers/decliners, wide intra-day spreads, and explicit reporting-date/source indicators (no fake "live" status badges).
2. **Net-Return Price Advisor (`/price-advisor`)** — Interactive What-If calculator computing:
   $$\text{Gross Revenue} = \text{Modal Price} \times \text{Quantity (qtl)}$$
   $$\text{Estimated Net Return} = \text{Gross Revenue} - \text{Transport Cost} - \text{Commission} - \text{Handling Expenses}$$
   Ranks markets descending by Estimated Net Return, flags reporting-date mismatches across compared markets, estimates road distance via Haversine × regional detour factor when verified APMC coordinates exist, and explains dynamically why a closer market can beat a higher-priced distant market.
3. **Interactive Market Atlas (`/market-atlas`)** — Leaflet + MarkerCluster geographical map using verified Indian town/city coordinates (`src/data/market_coords.py`). Unmapped markets are listed separately rather than plotted with fabricated coordinates.
4. **Crop Intelligence (`/crops`)** — Daily, weekly, monthly, and calendar seasonality views; coefficient-of-variation volatility; and market arrival volume (tonnes) vs. modal price Pearson correlation (`r`).
5. **Side-by-Side Market Comparison (`/market-comparison`)** — Compares up to 4 markets simultaneously on modal price, spread, historical mean, arrivals, transport cost, net return, and multi-line trajectory, highlighting when best-price and best-net-return winners differ.
6. **Price Reports & Exports (`/reports`)** — Server-side filtered, sortable, paginated price table with downloadable **CSV** and formatted **PDF** reports (`fpdf2`).
7. **Forecast & Selling Window (`/forecast`)** — Leakage-free chronological holdout split comparing `7-Day Moving Average`, `Recent-Cycle Lagged Baseline`, `Random Forest`, and `Gradient Boosting` with 80% empirical prediction intervals and a `< 21`-day insufficient-history safety guard.
8. **Watchlist & Price Alerts (`/watchlist`)** — Local crop watchlists and persistent threshold alert rules (`price_above`, `price_below`, `daily_move_above_pct`, `spread_above`) evaluated transparently without fake SMS/WhatsApp dispatches.
9. **Data Quality Centre (`/data-quality`)** — AGMARKNET CSV upload & ingestion (`POST /api/data/import`), optional `data.gov.in` API sync (`POST /api/data/refresh-agmarknet`), unit normalization (`Rs./Kg` and `Rs./Tonne` -> `INR/Quintal`), anomaly logging without silent row deletion, market freshness audit (`Recently updated`, `Delayed`, `Stale`, `Unavailable`), and one-click removal of demo rows.
10. **Settings (`/settings`)** — Persistent user defaults for state/district, default quantity, ₹/km haulage rate, commission %, handling cost, preferred crops, and compact display density.

---

## 4. Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│ React 19 + TypeScript + Vite SPA (frontend/src)                         │
│ Tailwind CSS v4 · Recharts · Leaflet + MarkerCluster · Lucide Icons     │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ REST JSON / CSV / PDF (/api/*)
┌──────────────────────────────────▼──────────────────────────────────────┐
│ FastAPI Application (src/main.py, src/api/routes.py)                    │
│  ├─ Data Ingestion & QA : validator.py · csv_importer.py · agmarknet    │
│  ├─ Analytics Engine    : net_return.py · crop_analytics.py · alerts    │
│  └─ Forecasting Module  : forecasting.py (chronological holdout split)  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ SQLAlchemy 2.0 ORM
┌──────────────────────────────────▼──────────────────────────────────────┐
│ Relational Database                                                     │
│  ├─ Production : PostgreSQL 15+ (sql/schema.sql via psycopg[binary])    │
│  └─ Local Zero-Config Fallback : SQLite (data/cropledger.db)            │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS v4, Recharts, Leaflet (`leaflet.markercluster`), Lucide icons.
- **Backend:** Python 3.11+, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2.0, Pandas, NumPy, Scikit-learn, `httpx`, `fpdf2`.
- **Database:** PostgreSQL DDL ([`sql/schema.sql`](sql/schema.sql)) + zero-config SQLite fallback ([`data/cropledger.db`](data/README.md)).

---

## 5. Project Structure

```text
90-days-90-projects-day-19-cropledger/
├── .env.example                 # Environment variable template (safe defaults)
├── .gitignore                   # Excludes .env, .venv/, node_modules/, *.db
├── DEMO_SCRIPT.md               # Step-by-step live walkthrough script
├── LICENSE                      # MIT License
├── QUICKSTART.md                # Windows PowerShell fast start
├── README.md                    # Complete project documentation
├── pyproject.toml               # Pytest, Ruff, and project metadata
├── requirements.txt             # Pinned/constrained Python dependencies
├── setup.bat / run.bat / test.bat # One-command Windows automation scripts
├── sql/
│   └── schema.sql               # PostgreSQL relational DDL & indexes
├── scripts/
│   ├── init_db.py               # Schema initialization, demo seeding & CSV export
│   └── sync_agmarknet.py        # CLI runner for official data.gov.in AGMARKNET sync
├── src/
│   ├── config.py / database.py / models.py / schemas.py / main.py
│   ├── api/routes.py            # FastAPI endpoints & CSV/PDF report exporters
│   ├── analytics/
│   │   ├── net_return.py        # Gross/net return engine & explanation generator
│   │   ├── crop_analytics.py    # Volatility, seasonality & arrival correlation
│   │   ├── forecasting.py       # Leakage-free chronological holdout evaluation
│   │   └── alerts_engine.py     # In-app rule evaluator
│   └── data/
│       ├── agmarknet_client.py  # data.gov.in resource 9ef84268 client
│       ├── csv_importer.py      # Validated AGMARKNET CSV ingestion pipeline
│       ├── validator.py         # Date parser, unit normalizer & anomaly audit
│       ├── market_coords.py     # Verified APMC coordinates & Haversine estimator
│       └── demo_dataset.py      # Deterministic labelled AGMARKNET-schema demo generator
├── frontend/                    # React + TypeScript + Vite web application
├── tests/                       # Pytest validation, analytics & API integration tests
├── docs/                        # Architecture, User Guide, Dev Notes, Testing & Troubleshooting
└── screenshots/                 # Real live-rendered screenshots
```

---

## 6. Prerequisites & Windows PowerShell Setup

### Prerequisites
- **Python 3.11+** (verified on Python `3.14.7`)
- **Node.js 20+ & npm** (verified on Node `24.19.0` / npm `11.17.0`)
- **PostgreSQL 15+** *(optional — SQLite works out of the box with zero extra service configuration)*

### Option A: One-Command Windows Setup & Launch

```powershell
git clone <your-repo-url>
cd 90-days-90-projects-day-19-cropledger
.\setup.bat
.\run.bat
```

Then open **`http://127.0.0.1:8000`** in your browser (or `http://127.0.0.1:8000/docs` for Swagger API docs).

### Option B: Manual Windows PowerShell Commands

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

Copy-Item .env.example .env

npm --prefix frontend install
npm --prefix frontend run build

python scripts\init_db.py --seed-demo --export-csv
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000
```

### Switching to PostgreSQL

```powershell
psql -U postgres -c "CREATE DATABASE cropledger;"
psql -U postgres -d cropledger -f sql\schema.sql
```

Then update `DATABASE_URL` in `.env`:

```env
DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/cropledger
```

And initialize the schema/sample data:

```powershell
.\.venv\Scripts\python.exe scripts\init_db.py --seed-demo
```

---

## 7. Official AGMARKNET / `data.gov.in` Data Setup

CropLedger supports official Indian APMC daily market feeds via **data.gov.in Resource ID `9ef84268-d588-465a-a308-a864a43d0070`** (*Current Daily Price of Various Commodities from Various Markets [Mandi]*) as well as direct CSV uploads downloaded from **agmarknet.gov.in** or **data.gov.in**.

1. Obtain a free API key from `https://www.data.gov.in/`.
2. Add it to your local `.env` (never commit `.env`):
   ```env
   DATA_GOV_IN_API_KEY=your_api_key_here
   DATA_GOV_IN_RESOURCE_ID=9ef84268-d588-465a-a308-a864a43d0070
   ```
3. Sync via CLI or UI:
   ```powershell
   .\.venv\Scripts\python.exe scripts\sync_agmarknet.py --limit 1000
   ```
   Or click **Sync data.gov.in AGMARKNET** / **Import CSV Dataset** inside **Data Quality**.
4. Once official data is loaded, click **Clear Demo Records** in **Data Quality** to remove all demo-labelled rows cleanly.

See [data/README.md](data/README.md) for the exact accepted CSV columns (`state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price`, optional `arrival_quantity`, `unit`), sample file (`data/sample_agmarknet_prices.csv`), and normalization rules.

---

## 8. Environment Variables (`.env.example`)

| Variable | Default | Description |
| --- | --- | --- |
| `CROPLEDGER_APP_NAME` | `CropLedger` | Display application title |
| `CROPLEDGER_HOST` | `127.0.0.1` | Server bind address |
| `CROPLEDGER_PORT` | `8000` | HTTP server port |
| `DATABASE_URL` | `sqlite:///data/cropledger.db` | SQLAlchemy connection string (PostgreSQL or SQLite) |
| `DATA_GOV_IN_API_KEY` | *(empty)* | Optional `data.gov.in` API key; keeps Demo/CSV mode functional when unset |
| `DATA_GOV_IN_RESOURCE_ID` | `9ef84268-d588-465a-a308-a864a43d0070` | Official AGMARKNET daily price dataset resource ID |
| `DATA_GOV_IN_TIMEOUT_SEC` | `15` | Network request timeout in seconds |
| `CROPLEDGER_SEED_DEMO_ON_EMPTY` | `true` | Automatically seeds labelled demo records only when DB has 0 price rows |

---

## 9. API Usage Example & Response Sample

Calculate estimated net returns across markets (`POST /api/price-advisor/calculate`):

```json
{
  "commodity": "Onion",
  "quantity_quintals": 25,
  "transport_mode": "per_km",
  "transport_cost_per_km": 18,
  "commission_mode": "percentage",
  "commission_pct": 2.5,
  "other_expenses": 350,
  "origin_market_id": 1
}
```

Returned ranking entry + dynamic explanation:

```json
{
  "explanation": "Pune has a higher reported modal price (₹3,193/qtl), while its estimated transport expense is ₹3,834 (approx. 213 km). Meanwhile, Lasalgaon reports ₹2,816/qtl with ₹630 in estimated transport. Based on your current cost assumptions, Pune yields the highest estimated net return at ₹73,650 (a net advantage of ₹6,267 over Lasalgaon).",
  "date_mismatch_warning": false,
  "ranked_markets": [
    {
      "rank": 1,
      "market_name": "Pune",
      "modal_price": 3193.0,
      "gross_revenue": 79825.0,
      "transport_cost": 3834.0,
      "commission_amount": 1995.63,
      "other_expenses": 350.0,
      "estimated_net_return": 73645.37
    }
  ]
}
```

---

## 10. Automated Testing & Verified Results

Run all backend unit/API tests and frontend TypeScript verification:

```powershell
.\test.bat
```

### Verified Test Summary (Measured Locally)

| Check | Command | Outcome | Notes |
| --- | --- | --- | --- |
| Backend & API Suite | `.venv\Scripts\python.exe -m pytest --cov=src --cov-report=term-missing` | **9 / 9 passed** (`9.39s`) | **83%** line coverage across `src/` (`src/models.py` 100%, `src/schemas.py` 100%, `src/analytics/crop_analytics.py` 93%, `src/analytics/forecasting.py` 93%, `src/data/csv_importer.py` 94%) |
| Frontend Typecheck | `npm --prefix frontend run typecheck` | **Passed** (`0` errors) | `tsc --noEmit` clean |
| Frontend Bundle Build | `npm --prefix frontend run build` | **Passed** (`10.23s`) | `frontend/dist/` bundle generated cleanly |
| Live HTTP & UI Probe | `uvicorn src.main:app --port 8019` + headless Microsoft Edge | **Passed** | `/api/health` (`200 OK`), `/api/overview` (`15` markets, `12` commodities, `27` chart history points), 7 viewport screenshots captured & visually inspected |

---

## 11. Known Limitations & Honest Engineering Boundaries

1. **PostgreSQL Runtime Connectivity:** PostgreSQL `18.6` was detected installed on the host, and [`sql/schema.sql`](sql/schema.sql) + `psycopg[binary]` are fully wired; however, automated verification ran against SQLite (`data/cropledger.db`) because no active PostgreSQL service was reachable in the automated test environment.
2. **External Government API Without Key:** Live `data.gov.in` network ingestion was verified with mocked `httpx` responses and missing-key/error fallback tests; live calls require a user-supplied `DATA_GOV_IN_API_KEY`.
3. **Road Distance Approximation:** Inter-market road distance uses Haversine distance × `1.22` India road detour factor between verified coordinates (`src/data/market_coords.py`). Unmapped yards fall back to an explicitly labelled `35 km` assumption and are omitted from Market Atlas pins rather than fabricated.
4. **Forecasting Realism:** Short agricultural price series (`< 21` observations, e.g., Banana demo series) intentionally return an insufficient-history notice rather than generating misleading predictions. On volatile daily series, complex tree models frequently do not outperform a simple 7-day moving average—which the Forecast page reports transparently.

---

## 12. Security, Privacy & Troubleshooting

- **No Secrets Committed:** API keys and DB credentials belong exclusively in `.env` (gitignored); `GET /api/data-quality` returns only boolean `api_key_configured` status and never exposes secret values.
- **No Unvalidated SQL:** All queries use parameterized SQLAlchemy ORM expressions with explicit input schema validation (`Pydantic v2`).
- For detailed guides, troubleshooting, and architecture notes, see:
  - [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md)
  - [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  - [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)
  - [`docs/TESTING.md`](docs/TESTING.md)
  - [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
  - [`QUICKSTART.md`](QUICKSTART.md) & [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)

---

## 13. Future Enhancements

- Integration with live OSRM / road-routing matrix for exact highway toll and truck axle cost estimates.
- Cold-storage cost-of-carry decay modelling in Forecast & Selling Window analysis.
- Multilingual localisation (`Hindi`, `Marathi`, `Kannada`, `Tamil`) using regional APMC glossaries.
- Scheduled automated background ingestion worker for daily AGMARKNET snapshots.

---

## 14. Learning Outcomes & Demonstrated Skills

- **Full-Stack Systems Architecture:** FastAPI + SQLAlchemy 2.0 + React 19 + TypeScript + Vite single-origin serving architecture.
- **Agricultural Decision Science:** Translating raw wholesale quotes into net-return economic decisions with sensitivity analysis and explicit assumption attribution.
- **Data Engineering & QA:** Defensive parsing (`DD/MM/YYYY`), unit conversion normalization, duplicate prevention, anomaly logging without silent deletion, and freshness classification.
- **Applied Time-Series ML:** Leakage-free chronological holdout evaluation against simple baselines with empirical uncertainty intervals.
- **Geospatial UI & Export Pipelines:** Leaflet marker clustering strictly bound to verified coordinates + downloadable CSV/PDF analytical reports.

---

## 15. License

Released under the [MIT License](LICENSE) — Copyright (c) 2026 **Ragu Ram P**.
