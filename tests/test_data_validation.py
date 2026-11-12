from __future__ import annotations

from datetime import date

import httpx
from sqlalchemy import func, select

from src.data import agmarknet_client
from src.data.csv_importer import ingest_csv_bytes, ingest_records
from src.data.validator import (
    classify_freshness,
    normalize_unit_to_quintal,
    parse_arrival_date,
    validate_and_normalize_row,
)
from src.models import DailyPrice, ValidationIssue


def test_date_parsing_and_unit_normalization():
    assert parse_arrival_date("12/11/2026") == date(2026, 11, 12)
    assert parse_arrival_date("2026-11-12") == date(2026, 11, 12)
    assert parse_arrival_date("invalid-date") is None

    assert normalize_unit_to_quintal("INR/Quintal")[0] == 1.0
    assert normalize_unit_to_quintal("Rs./Kg")[0] == 100.0
    assert normalize_unit_to_quintal("Rs./Tonne")[0] == 0.1
    assert normalize_unit_to_quintal("UnknownBox")[0] is None


def test_validation_rules_flag_anomalies_without_silent_deletion(temp_db_session):
    csv_text = (
        "state,district,market,commodity,variety,grade,arrival_date,min_price,max_price,modal_price,original_unit\n"
        "Maharashtra,Nashik,Lasalgaon,Onion,Red,FAQ,10/11/2026,2000,2600,2400,INR/Quintal\n"
        "Maharashtra,Nashik,Lasalgaon,Onion,Red,FAQ,10/11/2026,2000,2600,2400,INR/Quintal\n"  # duplicate
        "Maharashtra,Nashik,,Onion,Red,FAQ,10/11/2026,2000,2600,2400,INR/Quintal\n"  # missing market
        "Maharashtra,Nashik,Pune,Onion,Red,FAQ,10/11/2026,-500,2600,2400,INR/Quintal\n"  # negative price
        "Maharashtra,Nashik,Pune,Onion,Red,FAQ,10/11/2026,2800,2200,2400,INR/Quintal\n"  # min > max
        "Maharashtra,Nashik,Pune,Onion,Red,FAQ,not-a-date,2000,2600,2400,INR/Quintal\n"  # bad date
        "Maharashtra,Nashik,Pune,Onion,Red,FAQ,11/11/2026,2000,2600,2400,Bushel\n"  # unknown unit
        "Maharashtra,Nashik,Pune,Onion,Red,FAQ,12/11/2026,20,26,28,Rs./Kg\n"  # kg->quintal + modal > max warning retained
    )
    summary = ingest_csv_bytes(temp_db_session, csv_text.encode("utf-8"), source="Test CSV")

    assert summary["imported_records"] == 2
    assert summary["duplicate_records"] == 1
    assert summary["rejected_records"] == 5
    assert summary["invalid_price_count"] >= 2

    # Check kg normalization and retained modal-outside-range record
    prices = temp_db_session.scalars(select(DailyPrice).order_by(DailyPrice.arrival_date)).all()
    assert len(prices) == 2
    assert prices[1].modal_price == 2800.0
    assert prices[1].original_unit == "Rs./Kg"

    issues = temp_db_session.scalars(select(ValidationIssue)).all()
    issue_types = {i.issue_type for i in issues}
    assert "missing_market" in issue_types
    assert "negative_price" in issue_types
    assert "min_greater_than_max" in issue_types
    assert "invalid_date" in issue_types
    assert "inconsistent_unit" in issue_types
    assert "modal_outside_range" in issue_types
    assert "duplicate_record" in issue_types


def test_freshness_classification_rules():
    ref = date(2026, 11, 12)
    assert classify_freshness(date(2026, 11, 12), ref) == "Recently updated"
    assert classify_freshness(date(2026, 11, 10), ref) == "Recently updated"
    assert classify_freshness(date(2026, 11, 7), ref) == "Delayed"
    assert classify_freshness(date(2026, 11, 1), ref) == "Stale"
    assert classify_freshness(None, ref) == "Unavailable"


def test_agmarknet_client_graceful_fallback_and_mocked_ingest(temp_db_session, monkeypatch):
    # Fallback when API key missing
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", "")
    fallback_res = agmarknet_client.refresh_from_agmarknet(temp_db_session)
    assert fallback_res["mode"] == "fallback"
    assert fallback_res["live_fetched"] is False

    # Mocked successful API response
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", "dummy-test-key")

    def fake_fetch(**kwargs):
        return {
            "status": "ok",
            "total": 1,
            "count": 1,
            "records": [
                {
                    "state": "Madhya Pradesh",
                    "district": "Indore",
                    "market": "Indore",
                    "commodity": "Wheat",
                    "variety": "Lokwan",
                    "grade": "FAQ",
                    "arrival_date": "12/11/2026",
                    "min_price": "2400",
                    "max_price": "2650",
                    "modal_price": "2550",
                }
            ],
        }

    monkeypatch.setattr(agmarknet_client, "fetch_data_gov_in_records", fake_fetch)
    ok_res = agmarknet_client.refresh_from_agmarknet(temp_db_session)
    assert ok_res["live_fetched"] is True
    assert ok_res["imported_records"] == 1
    assert temp_db_session.scalar(select(func.count(DailyPrice.id))) == 1

    # Mocked HTTP failure falls back cleanly
    def failing_fetch(**kwargs):
        raise httpx.ConnectError("Network unreachable")

    monkeypatch.setattr(agmarknet_client, "fetch_data_gov_in_records", failing_fetch)
    err_res = agmarknet_client.refresh_from_agmarknet(temp_db_session)
    assert err_res["mode"] == "fallback"
    assert err_res["live_fetched"] is False
