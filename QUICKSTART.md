# CropLedger Quick Start Guide (Windows PowerShell)

## Option 1: One-Command Windows Scripts

```powershell
.\setup.bat
.\run.bat
```

Open `http://127.0.0.1:8000` in your browser.

To run tests:

```powershell
.\test.bat
```

## Option 2: Manual Setup (PowerShell)

1. Create and activate the virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

2. Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

3. Build the React frontend:

```powershell
npm --prefix frontend install
npm --prefix frontend run build
```

4. Initialize the database and sample dataset:

```powershell
python scripts\init_db.py --seed-demo --export-csv
```

5. Start the application:

```powershell
python -m uvicorn src.main:app --host 127.0.0.1 --port 8000
```

## Switching to PostgreSQL

1. Create a database named `cropledger` in PostgreSQL:

```powershell
psql -U postgres -c "CREATE DATABASE cropledger;"
psql -U postgres -d cropledger -f sql\schema.sql
```

2. Update `DATABASE_URL` in `.env`:

```env
DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/cropledger
```

3. Re-run `python scripts\init_db.py --seed-demo`.
