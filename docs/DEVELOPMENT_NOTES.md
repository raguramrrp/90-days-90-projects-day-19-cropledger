# Development Notes — CropLedger

## Key Design Decisions & Trade-Offs

1. **Brand Identity:** Named **CropLedger** to reflect evidence-based agricultural market accounting in simple, memorable English.
2. **Database Portability (PostgreSQL + SQLite Fallback):** Uses SQLAlchemy 2.0 ORM with PostgreSQL DDL (`sql/schema.sql`) and `psycopg[binary]`. When `DATABASE_URL` is not pointed to a live PostgreSQL instance, CropLedger defaults to local SQLite (`data/cropledger.db`) so Windows setup runs with zero external server friction.
3. **Direct Leaflet Integration:** Instead of `react-leaflet` (which has peer-dependency friction with React 19), `MarketAtlasPage.tsx` wraps `leaflet` and `leaflet.markercluster` cleanly inside a React `useEffect` lifecycle.
4. **Strict Chronological Forecasting:** All lagged features (`lag_1..7`, `rolling_mean_7/14`, `rolling_std_7`) are computed exclusively from indices `< idx` to prevent target leakage. Crops with `< 21` reporting days return an explicit insufficient-data notice rather than synthetic numbers.
5. **Transparent Data Provenance:** Demo records are tagged `is_demo=True`, separated from official imports, and clearly bannered across the UI.
