# Testing & Quality Assurance — CropLedger

## Automated Test Suite

Run all backend, analytics, validation, forecasting, and API endpoint checks plus the frontend TypeScript check:

```powershell
.\test.bat
```

Or individually:

```powershell
.\.venv\Scripts\python.exe -m pytest --cov=src --cov-report=term-missing
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

## Test Coverage Summary (Measured)

- **Suite:** `pytest --cov=src --cov-report=term-missing`
- **Result:** **9 passed in 9.39s** (83% line coverage across `src/`)
- **Frontend Check:** `tsc --noEmit && vite build` passed with zero TypeScript errors.

### Test Modules

1. [`tests/test_data_validation.py`](file:///D:/90%20days/90-days-90-projects-day-19-cropledger/tests/test_data_validation.py)
   - `DD/MM/YYYY` and ISO `YYYY-MM-DD` date parsing and invalid date rejection
   - Unit normalization (`INR/Quintal`, `Rs./Kg` -> `*100`, `Rs./Tonne` -> `/10`, unknown unit error)
   - Anomaly logging without silent deletion (`missing_market`, `negative_price`, `min_greater_than_max`, `modal_outside_range`, `duplicate_record`)
   - Data freshness classification (`Recently updated`, `Delayed`, `Stale`, `Unavailable`)
   - `data.gov.in` AGMARKNET client missing-key fallback, mocked live fetch, and HTTP error fallback

2. [`tests/test_analytics_and_forecasting.py`](file:///D:/90%20days/90-days-90-projects-day-19-cropledger/tests/test_analytics_and_forecasting.py)
   - Net-return formula verification (`gross_revenue - transport - commission - other`)
   - Market ranking proving a lower-price closer market outperforms a higher-price distant market when transport offsets the price gap, plus reporting-date mismatch warning
   - Chronological train/test split forecasting (7-Day Moving Average & Random Forest), zero future leakage, and insufficient-history guard (`< 21` days)
   - Crop Intelligence volatility, arrival-price correlation, and in-app alert rule evaluation

3. [`tests/test_api_endpoints.py`](file:///D:/90%20days/90-days-90-projects-day-19-cropledger/tests/test_api_endpoints.py)
   - End-to-end HTTP integration across `/api/health`, `/api/overview`, `/api/meta/filters`, `/api/price-advisor/calculate`, `/api/atlas/markets`, `/api/atlas/summary`, `/api/crops/{name}`, `/api/market-comparison`, `/api/reports`, `/api/reports/export` (CSV & PDF), `/api/forecast`, `/api/watchlist`, `/api/alerts`, `/api/data-quality`, `/api/data/import`, and `/api/settings`.
