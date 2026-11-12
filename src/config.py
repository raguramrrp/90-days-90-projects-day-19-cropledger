from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    app_name: str
    host: str
    port: int
    env: str
    database_url: str
    data_gov_in_api_key: str
    data_gov_in_resource_id: str
    data_gov_in_timeout_sec: int
    seed_demo_on_empty: bool
    data_dir: Path

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    @property
    def has_api_key(self) -> bool:
        return bool(self.data_gov_in_api_key.strip())


def _resolve_database_url() -> str:
    explicit = os.getenv("DATABASE_URL", "").strip()
    if explicit:
        return explicit

    pghost = os.getenv("PGHOST", "").strip()
    pgdb = os.getenv("PGDATABASE", "").strip()
    pguser = os.getenv("PGUSER", "").strip()
    pgpass = os.getenv("PGPASSWORD", "").strip()
    pgport = os.getenv("PGPORT", "5432").strip() or "5432"
    if pghost and pgdb and pguser and pgpass:
        return f"postgresql+psycopg://{pguser}:{pgpass}@{pghost}:{pgport}/{pgdb}"

    db_path = (BASE_DIR / "data" / "cropledger.db").resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


def get_settings() -> Settings:
    data_dir = BASE_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        app_name=os.getenv("CROPLEDGER_APP_NAME", "CropLedger"),
        host=os.getenv("CROPLEDGER_HOST", "127.0.0.1"),
        port=int(os.getenv("CROPLEDGER_PORT", "8000")),
        env=os.getenv("CROPLEDGER_ENV", "development"),
        database_url=_resolve_database_url(),
        data_gov_in_api_key=os.getenv("DATA_GOV_IN_API_KEY", "").strip(),
        data_gov_in_resource_id=os.getenv(
            "DATA_GOV_IN_RESOURCE_ID", "9ef84268-d588-465a-a308-a864a43d0070"
        ).strip(),
        data_gov_in_timeout_sec=int(os.getenv("DATA_GOV_IN_TIMEOUT_SEC", "15")),
        seed_demo_on_empty=os.getenv("CROPLEDGER_SEED_DEMO_ON_EMPTY", "true").lower()
        in {"1", "true", "yes"},
        data_dir=data_dir,
    )
