from __future__ import annotations

import csv
import io
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.data.market_coords import lookup_market_coords
from src.data.validator import ValidationFinding, validate_and_normalize_row
from src.models import (
    Arrival,
    Commodity,
    DailyPrice,
    DataRefreshLog,
    Market,
    ValidationIssue,
)

COMMODITY_CATEGORIES: dict[str, tuple[str, str]] = {
    "onion": ("Vegetables", "Bulb vegetable heavily traded across Maharashtra, Karnataka, and Gujarat APMCs."),
    "tomato": ("Vegetables", "Perishable horticultural crop with high seasonal price sensitivity."),
    "potato": ("Vegetables", "Staple tuber stored in cold chains across Uttar Pradesh, Punjab, and West Bengal."),
    "wheat": ("Cereals", "Rabi staple grain traded across northern and central Indian grain mandis."),
    "paddy (common)": ("Cereals", "Kharif staple rice grain traded across major eastern, northern, and southern APMCs."),
    "soybean": ("Oilseeds", "Major Kharif oilseed crop concentrated in Madhya Pradesh and Maharashtra."),
    "mustard": ("Oilseeds", "Rabi oilseed traded across Rajasthan, Haryana, and Madhya Pradesh."),
    "cotton": ("Fibre Crops", "Commercial fibre crop traded across Gujarat, Maharashtra, and Telangana."),
    "chana (bengal gram)": ("Pulses", "Rabi pulse crop benchmarked in Madhya Pradesh, Maharashtra, and Rajasthan."),
    "tur (arhar)": ("Pulses", "Major Kharif pulse traded across Maharashtra, Karnataka, and Telangana."),
    "turmeric": ("Spices", "Commercial spice benchmarked in Tamil Nadu, Maharashtra, and Telangana."),
    "banana": ("Fruits", "High-volume horticultural fruit crop with regional market dispersion."),
}


def _infer_category_and_desc(commodity_name: str, supplied_category: str) -> tuple[str, str]:
    key = commodity_name.strip().lower()
    if key in COMMODITY_CATEGORIES:
        return COMMODITY_CATEGORIES[key]
    cat = supplied_category if supplied_category and supplied_category != "Agricultural Produce" else "General"
    return cat, f"Agricultural commodity tracked in CropLedger ({commodity_name})."


def ingest_records(
    db: Session,
    records: Iterable[dict[str, Any]],
    source: str,
    is_demo: bool = False,
) -> dict[str, Any]:
    """Run full ingestion pipeline: Validate -> Normalize -> Deduplicate -> Persist -> Log."""
    started_at = datetime.now(timezone.utc)
    refresh_log = DataRefreshLog(
        source=source,
        started_at=started_at,
        status="running",
    )
    db.add(refresh_log)
    db.flush()

    commodity_cache: dict[str, Commodity] = {
        c.commodity_name.lower(): c for c in db.scalars(select(Commodity)).all()
    }
    market_cache: dict[tuple[str, str, str], Market] = {
        (m.market_name.lower(), m.state.lower(), m.district.lower()): m
        for m in db.scalars(select(Market)).all()
    }
    existing_keys: set[tuple[int, int, str, str, date, str]] = set(
        db.execute(
            select(
                DailyPrice.commodity_id,
                DailyPrice.market_id,
                DailyPrice.variety,
                DailyPrice.grade,
                DailyPrice.arrival_date,
                DailyPrice.source,
            ).where(DailyPrice.source == source)
        ).all()
    )
    existing_arrival_keys: set[tuple[int, int, date, str]] = set(
        db.execute(
            select(
                Arrival.commodity_id,
                Arrival.market_id,
                Arrival.arrival_date,
                Arrival.source,
            ).where(Arrival.source == source)
        ).all()
    )

    imported_count = 0
    duplicate_count = 0
    rejected_count = 0
    missing_field_count = 0
    invalid_price_count = 0
    max_reporting_date: Optional[date] = None

    price_batch: list[DailyPrice] = []
    arrival_batch: list[Arrival] = []
    issue_batch: list[ValidationIssue] = []

    for idx, raw_row in enumerate(records, start=1):
        normalized, findings = validate_and_normalize_row(raw_row, idx)
        for finding in findings:
            if finding.issue_type.startswith("missing_"):
                missing_field_count += 1
            if finding.issue_type in {"negative_price", "min_greater_than_max", "modal_outside_range"}:
                invalid_price_count += 1
            issue_batch.append(
                ValidationIssue(
                    refresh_log_id=refresh_log.id,
                    row_number=finding.row_number,
                    source=source,
                    issue_type=finding.issue_type,
                    severity=finding.severity,
                    field_name=finding.field_name,
                    raw_record_json=finding.raw_record_json,
                    explanation=finding.explanation,
                )
            )

        if normalized is None:
            rejected_count += 1
            continue

        c_key = normalized.commodity.lower()
        commodity_obj = commodity_cache.get(c_key)
        if commodity_obj is None:
            cat, desc = _infer_category_and_desc(normalized.commodity, normalized.category)
            commodity_obj = Commodity(
                commodity_name=normalized.commodity,
                category=cat,
                description=desc,
            )
            db.add(commodity_obj)
            db.flush()
            commodity_cache[c_key] = commodity_obj

        m_key = (
            normalized.market.lower(),
            normalized.state.lower(),
            normalized.district.lower(),
        )
        market_obj = market_cache.get(m_key)
        if market_obj is None:
            lat, lon, loc_source = lookup_market_coords(normalized.market, normalized.state)
            market_obj = Market(
                market_name=normalized.market,
                state=normalized.state,
                district=normalized.district,
                latitude=lat,
                longitude=lon,
                location_source=loc_source,
            )
            db.add(market_obj)
            db.flush()
            market_cache[m_key] = market_obj

        dedup_key = (
            commodity_obj.id,
            market_obj.id,
            normalized.variety,
            normalized.grade,
            normalized.arrival_date,
            source,
        )
        if dedup_key in existing_keys:
            duplicate_count += 1
            issue_batch.append(
                ValidationIssue(
                    refresh_log_id=refresh_log.id,
                    row_number=idx,
                    source=source,
                    issue_type="duplicate_record",
                    severity="warning",
                    field_name="arrival_date",
                    raw_record_json=None,
                    explanation=(
                        f"Duplicate record skipped for {normalized.commodity} ({normalized.variety}) "
                        f"at {normalized.market} on {normalized.arrival_date.isoformat()}."
                    ),
                )
            )
            continue

        existing_keys.add(dedup_key)
        price_batch.append(
            DailyPrice(
                commodity_id=commodity_obj.id,
                market_id=market_obj.id,
                variety=normalized.variety,
                grade=normalized.grade,
                arrival_date=normalized.arrival_date,
                min_price=normalized.min_price,
                max_price=normalized.max_price,
                modal_price=normalized.modal_price,
                arrival_quantity=normalized.arrival_quantity,
                original_unit=normalized.original_unit,
                source=source,
                is_demo=is_demo,
            )
        )
        imported_count += 1
        if max_reporting_date is None or normalized.arrival_date > max_reporting_date:
            max_reporting_date = normalized.arrival_date

        if normalized.arrival_quantity is not None:
            arr_key = (commodity_obj.id, market_obj.id, normalized.arrival_date, source)
            if arr_key not in existing_arrival_keys:
                existing_arrival_keys.add(arr_key)
                arrival_batch.append(
                    Arrival(
                        commodity_id=commodity_obj.id,
                        market_id=market_obj.id,
                        arrival_date=normalized.arrival_date,
                        arrival_quantity=normalized.arrival_quantity,
                        unit="Tonnes",
                        source=source,
                        is_demo=is_demo,
                    )
                )

    if price_batch:
        db.add_all(price_batch)
    if arrival_batch:
        db.add_all(arrival_batch)
    if issue_batch:
        db.add_all(issue_batch[:500])  # Cap persisted issue detail rows per batch to keep DB responsive

    refresh_log.completed_at = datetime.now(timezone.utc)
    refresh_log.source_reporting_date = max_reporting_date
    refresh_log.status = "success" if imported_count > 0 or duplicate_count > 0 else "warning"
    refresh_log.imported_records = imported_count
    refresh_log.duplicate_records = duplicate_count
    refresh_log.rejected_records = rejected_count
    refresh_log.missing_field_count = missing_field_count
    refresh_log.invalid_price_count = invalid_price_count
    if imported_count == 0 and rejected_count > 0:
        refresh_log.error_message = "No valid rows could be imported; review validation issues."

    db.commit()

    return {
        "refresh_log_id": refresh_log.id,
        "source": source,
        "status": refresh_log.status,
        "imported_records": imported_count,
        "duplicate_records": duplicate_count,
        "rejected_records": rejected_count,
        "missing_field_count": missing_field_count,
        "invalid_price_count": invalid_price_count,
        "source_reporting_date": max_reporting_date.isoformat() if max_reporting_date else None,
        "is_demo": is_demo,
    }


def parse_csv_bytes(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("Uploaded CSV file contains no header row.")
    return [dict(row) for row in reader]


def ingest_csv_bytes(
    db: Session,
    content: bytes,
    source: str = "User CSV Upload",
    is_demo: bool = False,
) -> dict[str, Any]:
    rows = parse_csv_bytes(content)
    if not rows:
        raise ValueError("Uploaded CSV file contains zero data rows.")
    return ingest_records(db, rows, source=source, is_demo=is_demo)


def ingest_csv_file(
    db: Session,
    path: Path,
    source: str = "Official CSV Import",
    is_demo: bool = False,
) -> dict[str, Any]:
    return ingest_csv_bytes(db, path.read_bytes(), source=source, is_demo=is_demo)
