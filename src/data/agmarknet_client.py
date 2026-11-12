from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from src.config import get_settings
from src.data.csv_importer import ingest_records
from src.models import DataRefreshLog


class AgmarknetClientError(Exception):
    pass


def fetch_data_gov_in_records(
    api_key: str,
    resource_id: str,
    limit: int = 500,
    offset: int = 0,
    state: Optional[str] = None,
    commodity: Optional[str] = None,
    timeout_sec: int = 15,
) -> dict[str, Any]:
    """Fetch daily mandi price records from India's official data.gov.in OGD API."""
    if not api_key.strip():
        raise AgmarknetClientError(
            "DATA_GOV_IN_API_KEY is not configured. Add your key in .env to fetch official AGMARKNET records."
        )

    url = f"https://api.data.gov.in/resource/{resource_id}"
    params: dict[str, Any] = {
        "api-key": api_key.strip(),
        "format": "json",
        "limit": limit,
        "offset": offset,
    }
    if state:
        params["filters[state]"] = state
    if commodity:
        params["filters[commodity]"] = commodity

    with httpx.Client(timeout=timeout_sec) as client:
        response = client.get(url, params=params)
        if response.status_code == 401 or response.status_code == 403:
            raise AgmarknetClientError(
                "data.gov.in rejected the API key (HTTP 401/403). Verify DATA_GOV_IN_API_KEY in .env."
            )
        response.raise_for_status()
        payload = response.json()

    records = payload.get("records", [])
    if not isinstance(records, list):
        raise AgmarknetClientError("Unexpected response format from data.gov.in API.")

    return {
        "status": payload.get("status", "ok"),
        "total": payload.get("total", len(records)),
        "count": len(records),
        "records": records,
    }


def refresh_from_agmarknet(
    db: Session,
    state: Optional[str] = None,
    commodity: Optional[str] = None,
    limit: int = 500,
) -> dict[str, Any]:
    """Attempt official API refresh and fall back honestly to existing database records if unavailable."""
    settings = get_settings()
    if not settings.has_api_key:
        log = DataRefreshLog(
            source="data.gov.in AGMARKNET API",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            status="unavailable",
            imported_records=0,
            rejected_records=0,
            error_message=(
                "DATA_GOV_IN_API_KEY is not configured. Using existing local database records."
            ),
        )
        db.add(log)
        db.commit()
        return {
            "mode": "fallback",
            "live_fetched": False,
            "message": (
                "Official data.gov.in API key is not configured in .env. "
                "Continuing with locally persisted records."
            ),
            "refresh_log_id": log.id,
        }

    try:
        api_result = fetch_data_gov_in_records(
            api_key=settings.data_gov_in_api_key,
            resource_id=settings.data_gov_in_resource_id,
            limit=limit,
            state=state,
            commodity=commodity,
            timeout_sec=settings.data_gov_in_timeout_sec,
        )
        records = api_result["records"]
        if not records:
            log = DataRefreshLog(
                source="data.gov.in AGMARKNET API",
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
                status="empty",
                imported_records=0,
                error_message="API returned zero matching records for the requested filter.",
            )
            db.add(log)
            db.commit()
            return {
                "mode": "api",
                "live_fetched": True,
                "message": "Official API responded with 0 records for the current filter.",
                "refresh_log_id": log.id,
            }

        ingest_summary = ingest_records(
            db,
            records,
            source="data.gov.in AGMARKNET API",
            is_demo=False,
        )
        return {
            "mode": "api",
            "live_fetched": True,
            "message": f"Imported {ingest_summary['imported_records']} official AGMARKNET records.",
            **ingest_summary,
        }
    except Exception as exc:
        log = DataRefreshLog(
            source="data.gov.in AGMARKNET API",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            status="failed",
            imported_records=0,
            error_message=str(exc),
        )
        db.add(log)
        db.commit()
        return {
            "mode": "fallback",
            "live_fetched": False,
            "message": f"Official API refresh failed ({exc}). Using previously imported local records.",
            "refresh_log_id": log.id,
        }
