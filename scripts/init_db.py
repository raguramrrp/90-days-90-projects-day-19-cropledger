from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete

from src.data.demo_dataset import export_sample_csv, seed_demo_data_if_empty
from src.database import get_session_factory, init_db
from src.models import DailyPrice


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize CropLedger database and sample CSV.")
    parser.add_argument("--seed-demo", action="store_true", help="Seed demo dataset if database is empty.")
    parser.add_argument(
        "--refresh-demo",
        action="store_true",
        help="Replace existing demo records with the latest generated demo catalog while keeping official records intact.",
    )
    parser.add_argument("--export-csv", action="store_true", help="Generate data/sample_agmarknet_prices.csv.")
    args = parser.parse_args()

    init_db()
    print("[OK] Database tables verified/initialized.")

    if args.export_csv:
        csv_path = export_sample_csv()
        print(f"[OK] Sample AGMARKNET-schema CSV exported to {csv_path}")

    if args.refresh_demo or args.seed_demo:
        db = get_session_factory()()
        try:
            if args.refresh_demo:
                deleted = db.execute(delete(DailyPrice).where(DailyPrice.is_demo.is_(True))).rowcount
                db.commit()
                print(f"[OK] Cleared {deleted or 0} prior demo price rows.")
            res = seed_demo_data_if_empty(db)
            if res is None:
                print("[OK] Database already contains records; skipping demo seed.")
            else:
                print(
                    f"[OK] Seeded {res['imported_records']} clearly labelled demo records "
                    f"(latest date: {res['source_reporting_date']})."
                )
        finally:
            db.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
