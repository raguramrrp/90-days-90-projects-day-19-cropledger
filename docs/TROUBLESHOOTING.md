# Troubleshooting — CropLedger

## Common Issues & Fixes

1. **`psql` / PostgreSQL connection refused when switching to PostgreSQL**
   - Ensure the PostgreSQL service is running (`services.msc` -> `postgresql-x64-18`) and port `5432` is accepting local connections.
   - Verify `DATABASE_URL` in `.env` matches your username, password, and database name (`cropledger`).
   - To run with zero external database setup, leave `DATABASE_URL=sqlite:///data/cropledger.db` in `.env`.

2. **`data.gov.in` sync falls back to local records**
   - Check that `DATA_GOV_IN_API_KEY` is populated in `.env` (not `.env.example`) and that your machine has outbound internet access to `api.data.gov.in`.
   - You can always upload official AGMARKNET CSV downloads directly in **Data Quality -> Import CSV Dataset**.

3. **Frontend shows API connection error in `--dev` mode**
   - Confirm FastAPI is running on `http://127.0.0.1:8000` before opening Vite on `http://127.0.0.1:5173`, or run `run.bat` (production single-server mode on `http://127.0.0.1:8000`).

4. **Port 8000 already in use**
   - Stop any existing `uvicorn` process or change `CROPLEDGER_PORT` in `.env` and start `uvicorn src.main:app --port 8001`.
