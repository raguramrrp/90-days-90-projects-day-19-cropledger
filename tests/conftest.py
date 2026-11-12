from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.data.demo_dataset import seed_demo_data_if_empty
from src.database import get_session_factory, init_db, reset_engine
from src.main import create_app


@pytest.fixture()
def temp_db_session(tmp_path: Path):
    db_file = tmp_path / "test_cropledger.db"
    db_url = f"sqlite:///{db_file.as_posix()}"
    os.environ["DATABASE_URL"] = db_url
    reset_engine(db_url)
    init_db()
    factory = get_session_factory()
    db = factory()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module")
def seeded_client(tmp_path_factory: pytest.TempPathFactory):
    tmp_dir = tmp_path_factory.mktemp("api_db")
    db_file = tmp_dir / "test_api_cropledger.db"
    db_url = f"sqlite:///{db_file.as_posix()}"
    os.environ["DATABASE_URL"] = db_url
    os.environ["DATA_GOV_IN_API_KEY"] = ""
    os.environ["CROPLEDGER_SEED_DEMO_ON_EMPTY"] = "true"
    reset_engine(db_url)
    init_db()
    db = get_session_factory()()
    try:
        seed_demo_data_if_empty(db)
    finally:
        db.close()

    app = create_app()
    with TestClient(app) as client:
        yield client
