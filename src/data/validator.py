from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Optional

UNIT_CONVERSION_TO_QUINTAL: dict[str, tuple[float, str]] = {
    "inr/quintal": (1.0, "INR/Quintal"),
    "rs./quintal": (1.0, "INR/Quintal"),
    "rs/quintal": (1.0, "INR/Quintal"),
    "quintal": (1.0, "INR/Quintal"),
    "qtl": (1.0, "INR/Quintal"),
    "inr/qtl": (1.0, "INR/Quintal"),
    "inr/kg": (100.0, "INR/Quintal"),
    "rs./kg": (100.0, "INR/Quintal"),
    "rs/kg": (100.0, "INR/Quintal"),
    "kg": (100.0, "INR/Quintal"),
    "inr/tonne": (0.1, "INR/Quintal"),
    "rs./tonne": (0.1, "INR/Quintal"),
    "rs/tonne": (0.1, "INR/Quintal"),
    "tonne": (0.1, "INR/Quintal"),
    "tonnes": (0.1, "INR/Quintal"),
    "mt": (0.1, "INR/Quintal"),
}

FRESHNESS_RULES = [
    {
        "label": "Recently updated",
        "rule": "Latest reporting date is within 2 days of the dataset reference date.",
        "max_age_days": 2,
    },
    {
        "label": "Delayed",
        "rule": "Latest reporting date is 3 to 7 days behind the dataset reference date.",
        "max_age_days": 7,
    },
    {
        "label": "Stale",
        "rule": "Latest reporting date is more than 7 days behind the dataset reference date.",
        "max_age_days": None,
    },
    {
        "label": "Unavailable",
        "rule": "Zero valid price records exist for the selected market or scope.",
        "max_age_days": None,
    },
]


def classify_freshness(latest_date: Optional[date], reference_date: Optional[date]) -> str:
    if latest_date is None or reference_date is None:
        return "Unavailable"
    delta_days = (reference_date - latest_date).days
    if delta_days <= 2:
        return "Recently updated"
    if delta_days <= 7:
        return "Delayed"
    return "Stale"


def parse_arrival_date(raw_value: Any) -> Optional[date]:
    if raw_value is None:
        return None
    if isinstance(raw_value, datetime):
        return raw_value.date()
    if isinstance(raw_value, date):
        return raw_value
    text = str(raw_value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def parse_float(raw_value: Any) -> Optional[float]:
    if raw_value is None:
        return None
    if isinstance(raw_value, (int, float)):
        val = float(raw_value)
        return None if val != val else val  # NaN guard
    text = str(raw_value).strip().replace(",", "").replace("₹", "")
    if not text or text.lower() in {"na", "n/a", "null", "none", "-"}:
        return None
    try:
        val = float(text)
        return None if val != val else val
    except ValueError:
        return None


def normalize_unit_to_quintal(raw_unit: Optional[str]) -> tuple[Optional[float], str]:
    if not raw_unit or not str(raw_unit).strip():
        return 1.0, "INR/Quintal"
    key = str(raw_unit).strip().lower()
    if key in UNIT_CONVERSION_TO_QUINTAL:
        factor, _ = UNIT_CONVERSION_TO_QUINTAL[key]
        return factor, str(raw_unit).strip()
    return None, str(raw_unit).strip()


@dataclass
class ValidationFinding:
    row_number: int
    issue_type: str
    severity: str
    field_name: str
    explanation: str
    raw_record_json: str


@dataclass
class NormalizedPriceRow:
    state: str
    district: str
    market: str
    commodity: str
    category: str
    variety: str
    grade: str
    arrival_date: date
    min_price: float
    max_price: float
    modal_price: float
    arrival_quantity: Optional[float]
    original_unit: str


def validate_and_normalize_row(
    raw: dict[str, Any],
    row_number: int,
) -> tuple[Optional[NormalizedPriceRow], list[ValidationFinding]]:
    """Validate and normalize a raw AGMARKNET/CSV row without silently discarding suspicious context."""
    findings: list[ValidationFinding] = []
    raw_json = json.dumps({k: (str(v) if v is not None else None) for k, v in raw.items()}, ensure_ascii=False)

    def _get(*keys: str) -> str:
        for k in keys:
            if k in raw and raw[k] is not None and str(raw[k]).strip():
                return str(raw[k]).strip()
        lower_map = {str(k).strip().lower(): v for k, v in raw.items()}
        for k in keys:
            val = lower_map.get(k.lower())
            if val is not None and str(val).strip():
                return str(val).strip()
        return ""

    commodity = _get("commodity", "commodity_name", "crop")
    market = _get("market", "market_name", "mandi")
    state = _get("state", "state_name")
    district = _get("district", "district_name") or market
    category = _get("category") or "Agricultural Produce"
    variety = _get("variety") or "FAQ"
    grade = _get("grade") or "FAQ"

    if not commodity:
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="missing_commodity",
                severity="error",
                field_name="commodity",
                explanation="Missing commodity name; record cannot be attributed to a crop.",
                raw_record_json=raw_json,
            )
        )
    if not market:
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="missing_market",
                severity="error",
                field_name="market",
                explanation="Missing market name; record cannot be assigned to an APMC market.",
                raw_record_json=raw_json,
            )
        )
    if not state:
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="missing_state",
                severity="error",
                field_name="state",
                explanation="Missing state name; regional attribution is incomplete.",
                raw_record_json=raw_json,
            )
        )

    raw_date = _get("arrival_date", "date", "reported_date", "price_date")
    parsed_date = parse_arrival_date(raw_date)
    if parsed_date is None:
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="invalid_date",
                severity="error",
                field_name="arrival_date",
                explanation=f"Invalid or missing reporting date '{raw_date}'. Expected DD/MM/YYYY or YYYY-MM-DD.",
                raw_record_json=raw_json,
            )
        )

    raw_unit = _get("original_unit", "unit", "price_unit") or "INR/Quintal"
    factor, preserved_unit = normalize_unit_to_quintal(raw_unit)
    if factor is None:
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="inconsistent_unit",
                severity="error",
                field_name="original_unit",
                explanation=f"Unrecognized price unit '{preserved_unit}'. Supported units: INR/Quintal, INR/Kg, INR/Tonne.",
                raw_record_json=raw_json,
            )
        )

    min_val = parse_float(_get("min_price", "min_x0020_price", "minimum_price"))
    max_val = parse_float(_get("max_price", "max_x0020_price", "maximum_price"))
    modal_val = parse_float(_get("modal_price", "modal_x0020_price", "price"))
    arrival_qty = parse_float(_get("arrival_quantity", "arrivals", "arrival_qty"))

    if modal_val is None:
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="missing_modal_price",
                severity="error",
                field_name="modal_price",
                explanation="Missing or non-numeric modal price.",
                raw_record_json=raw_json,
            )
        )
    if min_val is None and modal_val is not None:
        min_val = modal_val
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="missing_min_price",
                severity="warning",
                field_name="min_price",
                explanation="Minimum price missing; defaulted to modal price for completeness.",
                raw_record_json=raw_json,
            )
        )
    if max_val is None and modal_val is not None:
        max_val = modal_val
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="missing_max_price",
                severity="warning",
                field_name="max_price",
                explanation="Maximum price missing; defaulted to modal price for completeness.",
                raw_record_json=raw_json,
            )
        )

    if any(v is not None and v < 0 for v in (min_val, max_val, modal_val)):
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="negative_price",
                severity="error",
                field_name="modal_price",
                explanation="Negative price detected. Market wholesale prices cannot be negative.",
                raw_record_json=raw_json,
            )
        )

    if arrival_qty is not None and arrival_qty < 0:
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="negative_arrival_quantity",
                severity="warning",
                field_name="arrival_quantity",
                explanation="Negative arrival quantity detected; arrival quantity cleared.",
                raw_record_json=raw_json,
            )
        )
        arrival_qty = None

    if min_val is not None and max_val is not None and min_val > max_val:
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="min_greater_than_max",
                severity="error",
                field_name="min_price",
                explanation=f"Minimum price ({min_val}) exceeds maximum price ({max_val}).",
                raw_record_json=raw_json,
            )
        )

    if (
        min_val is not None
        and max_val is not None
        and modal_val is not None
        and min_val <= max_val
        and (modal_val < min_val or modal_val > max_val)
    ):
        findings.append(
            ValidationFinding(
                row_number=row_number,
                issue_type="modal_outside_range",
                severity="warning",
                field_name="modal_price",
                explanation=f"Modal price ({modal_val}) falls outside reported range [{min_val}, {max_val}]. Record retained and flagged for review.",
                raw_record_json=raw_json,
            )
        )

    has_blocking_error = any(f.severity == "error" for f in findings)
    if has_blocking_error or factor is None or parsed_date is None or min_val is None or max_val is None or modal_val is None:
        return None, findings

    return (
        NormalizedPriceRow(
            state=state,
            district=district,
            market=market,
            commodity=commodity,
            category=category,
            variety=variety,
            grade=grade,
            arrival_date=parsed_date,
            min_price=round(min_val * factor, 2),
            max_price=round(max_val * factor, 2),
            modal_price=round(modal_val * factor, 2),
            arrival_quantity=round(arrival_qty, 2) if arrival_qty is not None else None,
            original_unit=preserved_unit,
        ),
        findings,
    )
