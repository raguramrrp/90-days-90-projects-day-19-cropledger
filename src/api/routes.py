from __future__ import annotations

import csv
import io
import json
from datetime import date, timedelta
from typing import Any, Optional

from fpdf import FPDF, XPos, YPos
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import asc, delete, desc, func, select
from sqlalchemy.orm import Session

from src.analytics.alerts_engine import evaluate_active_alerts
from src.analytics.crop_analytics import get_crop_intelligence
from src.analytics.forecasting import run_market_forecast
from src.analytics.net_return import compute_net_return_breakdown, rank_markets_by_net_return
from src.config import get_settings
from src.data.agmarknet_client import refresh_from_agmarknet
from src.data.csv_importer import ingest_csv_bytes
from src.data.demo_dataset import DEMO_SOURCE_LABEL, seed_demo_data_if_empty
from src.data.market_coords import estimate_road_distance_km
from src.data.validator import FRESHNESS_RULES, classify_freshness
from src.database import check_db_health, get_db
from src.models import (
    AlertEvent,
    Commodity,
    DailyPrice,
    DataRefreshLog,
    Market,
    PriceAlert,
    UserPreference,
    UserWatchlist,
    ValidationIssue,
)
from src.schemas import (
    PriceAdvisorRequest,
    PriceAlertCreateRequest,
    PriceAlertToggleRequest,
    UserSettingsUpdateRequest,
    WatchlistCreateRequest,
)

router = APIRouter(prefix="/api", tags=["CropLedger API"])


def _get_or_create_preferences(db: Session, profile_id: str = "default") -> UserPreference:
    pref = db.get(UserPreference, profile_id)
    if pref is None:
        pref = UserPreference(local_profile_id=profile_id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


def _latest_reference_date(db: Session) -> Optional[date]:
    return db.scalar(select(func.max(DailyPrice.arrival_date)))


def _dataset_source_status(db: Session) -> dict[str, Any]:
    total_records = db.scalar(select(func.count(DailyPrice.id))) or 0
    demo_records = db.scalar(select(func.count(DailyPrice.id)).where(DailyPrice.is_demo.is_(True))) or 0
    official_records = total_records - demo_records
    latest_date = _latest_reference_date(db)
    latest_log = db.scalar(
        select(DataRefreshLog)
        .where(DataRefreshLog.status.in_(["success", "warning"]))
        .order_by(desc(DataRefreshLog.id))
        .limit(1)
    )
    settings = get_settings()

    if total_records == 0:
        data_mode = "empty"
    elif official_records > 0 and demo_records > 0:
        data_mode = "mixed"
    elif official_records > 0:
        data_mode = "official"
    else:
        data_mode = "demo"

    return {
        "total_records": int(total_records),
        "demo_records": int(demo_records),
        "official_records": int(official_records),
        "data_mode": data_mode,
        "latest_reporting_date": latest_date.isoformat() if latest_date else None,
        "last_refreshed_at": latest_log.completed_at.isoformat() if latest_log and latest_log.completed_at else None,
        "last_refresh_source": latest_log.source if latest_log else None,
        "api_key_configured": settings.has_api_key,
    }


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, Any]:
    db_status = check_db_health(db)
    source_status = _dataset_source_status(db)
    return {
        "status": "ok" if db_status["connected"] else "degraded",
        "app": "CropLedger",
        "database": db_status,
        "data": source_status,
    }


@router.get("/meta/filters")
def get_filter_options(db: Session = Depends(get_db)) -> dict[str, Any]:
    commodities = db.scalars(select(Commodity).order_by(Commodity.commodity_name)).all()
    markets = db.scalars(select(Market).order_by(Market.state, Market.market_name)).all()
    varieties_rows = db.execute(
        select(Commodity.commodity_name, DailyPrice.variety).join(
            Commodity, DailyPrice.commodity_id == Commodity.id
        ).distinct()
    ).all()

    varieties_by_commodity: dict[str, list[str]] = {}
    for cname, var in varieties_rows:
        varieties_by_commodity.setdefault(cname, [])
        if var not in varieties_by_commodity[cname]:
            varieties_by_commodity[cname].append(var)

    dates_rows = db.scalars(
        select(DailyPrice.arrival_date).distinct().order_by(desc(DailyPrice.arrival_date)).limit(90)
    ).all()

    states = sorted({m.state for m in markets})
    districts_by_state: dict[str, list[str]] = {}
    for m in markets:
        districts_by_state.setdefault(m.state, [])
        if m.district not in districts_by_state[m.state]:
            districts_by_state[m.state].append(m.district)

    return {
        "commodities": [
            {"id": c.id, "name": c.commodity_name, "category": c.category, "description": c.description}
            for c in commodities
        ],
        "varieties_by_commodity": {k: sorted(v) for k, v in varieties_by_commodity.items()},
        "states": states,
        "districts_by_state": {k: sorted(v) for k, v in districts_by_state.items()},
        "markets": [
            {
                "id": m.id,
                "name": m.market_name,
                "state": m.state,
                "district": m.district,
                "has_coords": m.latitude is not None and m.longitude is not None,
            }
            for m in markets
        ],
        "available_dates": [d.isoformat() for d in dates_rows],
    }


@router.get("/overview")
def get_overview(
    reporting_date: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    commodity: Optional[str] = Query(default=None),
    history_days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    source_status = _dataset_source_status(db)
    ref_date = _latest_reference_date(db)
    if ref_date is None:
        return {
            "empty": True,
            "source_status": source_status,
            "summary": {
                "selected_date": None,
                "markets_reporting": 0,
                "commodities_available": 0,
                "highest_modal_price": None,
                "lowest_modal_price": None,
                "followed_crops_updated": 0,
                "last_refreshed": source_status["last_refreshed_at"],
            },
            "daily_briefing": {
                "price_increases": [],
                "price_decreases": [],
                "highest_markets": [],
                "wide_spread_markets": [],
                "recently_updated_reports": [],
            },
            "followed_crops": [],
            "price_history": [],
            "vegetable_per_kg": [],
        }

    selected_dt = date.fromisoformat(reporting_date) if reporting_date else ref_date

    # Query records for selected_date across all commodities (filtered by state if specified);
    # the `commodity` parameter selects the historical chart crop without collapsing market summary KPIs.
    stmt = (
        select(DailyPrice, Commodity, Market)
        .join(Commodity, DailyPrice.commodity_id == Commodity.id)
        .join(Market, DailyPrice.market_id == Market.id)
        .where(DailyPrice.arrival_date == selected_dt)
    )
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)

    day_rows = db.execute(stmt).all()

    markets_reporting = len({mkt.id for _, _, mkt in day_rows})
    commodities_available = len({comm.id for _, comm, _ in day_rows})
    highest_row = max(day_rows, key=lambda x: x[0].modal_price) if day_rows else None
    lowest_row = min(day_rows, key=lambda x: x[0].modal_price) if day_rows else None

    # Followed crops from watchlist
    watchlist_items = db.scalars(
        select(UserWatchlist).where(UserWatchlist.local_profile_id == "default")
    ).all()
    followed_crops: list[dict[str, Any]] = []
    followed_updated_count = 0

    for w in watchlist_items:
        comm = db.get(Commodity, w.commodity_id)
        if comm is None:
            continue
        p_stmt = (
            select(DailyPrice, Market)
            .join(Market, DailyPrice.market_id == Market.id)
            .where(
                DailyPrice.commodity_id == comm.id,
                DailyPrice.arrival_date <= selected_dt,
            )
        )
        if w.market_id is not None:
            p_stmt = p_stmt.where(DailyPrice.market_id == w.market_id)
        p_stmt = p_stmt.order_by(desc(DailyPrice.arrival_date)).limit(5)
        recent = db.execute(p_stmt).all()
        if not recent:
            continue
        latest_dp, mkt = recent[0]
        prev_dp = next((dp for dp, _ in recent[1:] if dp.arrival_date < latest_dp.arrival_date), None)
        pct_move = (
            round(((latest_dp.modal_price - prev_dp.modal_price) / prev_dp.modal_price) * 100.0, 2)
            if prev_dp and prev_dp.modal_price > 0
            else None
        )
        if latest_dp.arrival_date == selected_dt:
            followed_updated_count += 1
        followed_crops.append(
            {
                "watchlist_id": w.id,
                "commodity": comm.commodity_name,
                "market": mkt.market_name,
                "state": mkt.state,
                "latest_modal_price": round(latest_dp.modal_price, 2),
                "previous_modal_price": round(prev_dp.modal_price, 2) if prev_dp else None,
                "movement_pct": pct_move,
                "reporting_date": latest_dp.arrival_date.isoformat(),
                "freshness": classify_freshness(latest_dp.arrival_date, ref_date),
            }
        )

    # Daily market briefing: compute crop movement vs previous reporting day up to selected_dt
    window_start = selected_dt - timedelta(days=10)
    brief_stmt = (
        select(DailyPrice, Commodity, Market)
        .join(Commodity, DailyPrice.commodity_id == Commodity.id)
        .join(Market, DailyPrice.market_id == Market.id)
        .where(
            DailyPrice.arrival_date <= selected_dt,
            DailyPrice.arrival_date >= window_start,
        )
        .order_by(desc(DailyPrice.arrival_date))
    )
    if state and state.lower() != "all":
        brief_stmt = brief_stmt.where(Market.state == state)
    recent_rows = db.execute(brief_stmt).all()

    by_crop_date: dict[str, dict[date, list[float]]] = {}
    for dp, comm, _ in recent_rows:
        by_crop_date.setdefault(comm.commodity_name, {}).setdefault(dp.arrival_date, []).append(
            dp.modal_price
        )

    crop_movers: list[dict[str, Any]] = []
    for cname, date_map in by_crop_date.items():
        sorted_dates = sorted(date_map.keys(), reverse=True)
        if len(sorted_dates) < 2:
            continue
        d_now, d_prev = sorted_dates[0], sorted_dates[1]
        p_now = sum(date_map[d_now]) / len(date_map[d_now])
        p_prev = sum(date_map[d_prev]) / len(date_map[d_prev])
        if p_prev > 0:
            pct = round(((p_now - p_prev) / p_prev) * 100.0, 2)
            crop_movers.append(
                {
                    "commodity": cname,
                    "latest_avg_modal": round(p_now, 2),
                    "previous_avg_modal": round(p_prev, 2),
                    "movement_pct": pct,
                    "reporting_date": d_now.isoformat(),
                }
            )

    price_increases = sorted(
        [m for m in crop_movers if m["movement_pct"] > 0],
        key=lambda x: x["movement_pct"],
        reverse=True,
    )[:5]
    price_decreases = sorted(
        [m for m in crop_movers if m["movement_pct"] < 0],
        key=lambda x: x["movement_pct"],
    )[:5]

    highest_markets = [
        {
            "commodity": comm.commodity_name,
            "market": mkt.market_name,
            "state": mkt.state,
            "modal_price": round(dp.modal_price, 2),
            "reporting_date": dp.arrival_date.isoformat(),
        }
        for dp, comm, mkt in sorted(day_rows, key=lambda x: x[0].modal_price, reverse=True)[:5]
    ]

    wide_spread_markets = [
        {
            "commodity": comm.commodity_name,
            "market": mkt.market_name,
            "state": mkt.state,
            "min_price": round(dp.min_price, 2),
            "max_price": round(dp.max_price, 2),
            "spread": round(dp.max_price - dp.min_price, 2),
            "reporting_date": dp.arrival_date.isoformat(),
        }
        for dp, comm, mkt in sorted(day_rows, key=lambda x: x[0].max_price - x[0].min_price, reverse=True)[:5]
    ]

    recently_updated_reports = [
        {
            "commodity": comm.commodity_name,
            "market": mkt.market_name,
            "state": mkt.state,
            "modal_price": round(dp.modal_price, 2),
            "reporting_date": dp.arrival_date.isoformat(),
            "source": dp.source,
            "is_demo": dp.is_demo,
        }
        for dp, comm, mkt in recent_rows[:8]
    ]

    # Vegetable per-kg retail/wholesale reference across reporting markets in selected state
    seen_veg_pairs: set[tuple[int, int]] = set()
    vegetable_per_kg: list[dict[str, Any]] = []
    for dp, comm, mkt in recent_rows:
        if comm.category != "Vegetables":
            continue
        pair = (mkt.id, comm.id)
        if pair in seen_veg_pairs:
            continue
        seen_veg_pairs.add(pair)
        vegetable_per_kg.append(
            {
                "commodity": comm.commodity_name,
                "variety": dp.variety,
                "market": mkt.market_name,
                "district": mkt.district,
                "state": mkt.state,
                "min_price_per_kg": round(dp.min_price / 100.0, 2),
                "max_price_per_kg": round(dp.max_price / 100.0, 2),
                "modal_price_per_kg": round(dp.modal_price / 100.0, 2),
                "modal_price_per_quintal": round(dp.modal_price, 2),
                "reporting_date": dp.arrival_date.isoformat(),
            }
        )
    vegetable_per_kg.sort(key=lambda r: (r["state"], r["market"], r["commodity"]))

    # Price movement chart (actual available records only, no invented fill)
    chart_commodity = commodity if (commodity and commodity.lower() != "all") else None
    if chart_commodity is None:
        chart_commodity = followed_crops[0]["commodity"] if followed_crops else "Onion"

    hist_start = selected_dt - timedelta(days=history_days)
    hist_stmt = (
        select(
            DailyPrice.arrival_date,
            func.avg(DailyPrice.modal_price).label("avg_modal"),
            func.min(DailyPrice.min_price).label("min_price"),
            func.max(DailyPrice.max_price).label("max_price"),
            func.count(DailyPrice.id).label("report_count"),
        )
        .join(Commodity, DailyPrice.commodity_id == Commodity.id)
        .join(Market, DailyPrice.market_id == Market.id)
        .where(
            Commodity.commodity_name == chart_commodity,
            DailyPrice.arrival_date >= hist_start,
            DailyPrice.arrival_date <= selected_dt,
        )
        .group_by(DailyPrice.arrival_date)
        .order_by(asc(DailyPrice.arrival_date))
    )
    if state and state.lower() != "all":
        hist_stmt = hist_stmt.where(Market.state == state)

    hist_rows = db.execute(hist_stmt).all()
    price_history = [
        {
            "date": r.arrival_date.isoformat(),
            "modal_price": round(float(r.avg_modal), 2),
            "min_price": round(float(r.min_price), 2),
            "max_price": round(float(r.max_price), 2),
            "report_count": int(r.report_count),
        }
        for r in hist_rows
    ]

    return {
        "empty": False,
        "source_status": source_status,
        "chart_commodity": chart_commodity,
        "summary": {
            "selected_date": selected_dt.isoformat(),
            "markets_reporting": markets_reporting,
            "commodities_available": commodities_available,
            "highest_modal_price": {
                "price": round(highest_row[0].modal_price, 2),
                "commodity": highest_row[1].commodity_name,
                "market": highest_row[2].market_name,
                "reporting_date": highest_row[0].arrival_date.isoformat(),
            }
            if highest_row
            else None,
            "lowest_modal_price": {
                "price": round(lowest_row[0].modal_price, 2),
                "commodity": lowest_row[1].commodity_name,
                "market": lowest_row[2].market_name,
                "reporting_date": lowest_row[0].arrival_date.isoformat(),
            }
            if lowest_row
            else None,
            "followed_crops_updated": followed_updated_count,
            "followed_crops_total": len(followed_crops),
            "last_refreshed": source_status["last_refreshed_at"],
        },
        "daily_briefing": {
            "price_increases": price_increases,
            "price_decreases": price_decreases,
            "highest_markets": highest_markets,
            "wide_spread_markets": wide_spread_markets,
            "recently_updated_reports": recently_updated_reports,
        },
        "followed_crops": followed_crops,
        "price_history": price_history,
        "vegetable_per_kg": vegetable_per_kg,
    }


@router.get("/commodities")
def list_commodities(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(
        select(
            Commodity,
            func.count(DailyPrice.id).label("record_count"),
            func.max(DailyPrice.arrival_date).label("latest_date"),
        )
        .outerjoin(DailyPrice, Commodity.id == DailyPrice.commodity_id)
        .group_by(Commodity.id)
        .order_by(Commodity.commodity_name)
    ).all()
    return [
        {
            "id": comm.id,
            "commodity_name": comm.commodity_name,
            "category": comm.category,
            "description": comm.description,
            "record_count": int(rec_cnt),
            "latest_date": latest_dt.isoformat() if latest_dt else None,
        }
        for comm, rec_cnt, latest_dt in rows
    ]


@router.get("/markets")
def list_markets(
    state: Optional[str] = None,
    district: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    stmt = select(Market).order_by(Market.state, Market.market_name)
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)
    if district and district.lower() != "all":
        stmt = stmt.where(Market.district == district)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            Market.market_name.ilike(pattern) | Market.district.ilike(pattern) | Market.state.ilike(pattern)
        )
    markets = db.scalars(stmt).all()
    return [
        {
            "id": m.id,
            "market_name": m.market_name,
            "state": m.state,
            "district": m.district,
            "latitude": m.latitude,
            "longitude": m.longitude,
            "location_source": m.location_source,
        }
        for m in markets
    ]


@router.get("/prices")
def list_prices(
    commodity: Optional[str] = None,
    state: Optional[str] = None,
    market: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    stmt = (
        select(DailyPrice, Commodity, Market)
        .join(Commodity, DailyPrice.commodity_id == Commodity.id)
        .join(Market, DailyPrice.market_id == Market.id)
    )
    if commodity and commodity.lower() != "all":
        stmt = stmt.where(Commodity.commodity_name == commodity)
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)
    if market and market.lower() != "all":
        stmt = stmt.where(Market.market_name == market)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(desc(DailyPrice.arrival_date)).offset(offset).limit(limit)).all()
    return {
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "records": [
            {
                "id": dp.id,
                "arrival_date": dp.arrival_date.isoformat(),
                "state": mkt.state,
                "district": mkt.district,
                "market": mkt.market_name,
                "commodity": comm.commodity_name,
                "category": comm.category,
                "variety": dp.variety,
                "grade": dp.grade,
                "min_price": round(dp.min_price, 2),
                "max_price": round(dp.max_price, 2),
                "modal_price": round(dp.modal_price, 2),
                "arrival_quantity": dp.arrival_quantity,
                "original_unit": dp.original_unit,
                "source": dp.source,
                "is_demo": dp.is_demo,
            }
            for dp, comm, mkt in rows
        ],
    }


@router.get("/prices/history")
def price_history(
    commodity: str,
    market_id: Optional[int] = None,
    state: Optional[str] = None,
    days: int = Query(default=90, ge=7, le=730),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    comm = db.scalar(select(Commodity).where(Commodity.commodity_name == commodity))
    if comm is None:
        raise HTTPException(status_code=404, detail=f"Commodity '{commodity}' not found.")

    ref_date = _latest_reference_date(db)
    if ref_date is None:
        return {"commodity": commodity, "series": []}

    start_dt = ref_date - timedelta(days=days)
    stmt = (
        select(
            DailyPrice.arrival_date,
            func.avg(DailyPrice.modal_price).label("modal_price"),
            func.min(DailyPrice.min_price).label("min_price"),
            func.max(DailyPrice.max_price).label("max_price"),
        )
        .join(Market, DailyPrice.market_id == Market.id)
        .where(
            DailyPrice.commodity_id == comm.id,
            DailyPrice.arrival_date >= start_dt,
        )
        .group_by(DailyPrice.arrival_date)
        .order_by(asc(DailyPrice.arrival_date))
    )
    if market_id:
        stmt = stmt.where(DailyPrice.market_id == market_id)
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)

    rows = db.execute(stmt).all()
    return {
        "commodity": comm.commodity_name,
        "series": [
            {
                "date": r.arrival_date.isoformat(),
                "modal_price": round(float(r.modal_price), 2),
                "min_price": round(float(r.min_price), 2),
                "max_price": round(float(r.max_price), 2),
            }
            for r in rows
        ],
    }


@router.get("/price-advisor/ranking")
def price_advisor_ranking(
    commodity: str,
    variety: Optional[str] = "All",
    state: Optional[str] = "All",
    district: Optional[str] = "All",
    origin_market_id: Optional[int] = None,
    quantity_quintals: float = Query(default=25.0, gt=0),
    transport_cost_per_km: float = Query(default=18.0, ge=0),
    commission_pct: float = Query(default=2.5, ge=0),
    other_expenses: float = Query(default=350.0, ge=0),
    limit: int = Query(default=10, ge=1, le=25),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return rank_markets_by_net_return(
        db=db,
        commodity_name=commodity,
        variety=variety,
        state=state,
        district=district,
        origin_market_id=origin_market_id,
        quantity_quintals=quantity_quintals,
        transport_mode="per_km",
        transport_cost_per_km=transport_cost_per_km,
        commission_mode="percentage",
        commission_pct=commission_pct,
        other_expenses=other_expenses,
        limit=limit,
    )


@router.post("/price-advisor/calculate")
def price_advisor_calculate(
    payload: PriceAdvisorRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return rank_markets_by_net_return(
        db=db,
        commodity_name=payload.commodity,
        variety=payload.variety,
        state=payload.state,
        district=payload.district,
        origin_market_id=payload.origin_market_id,
        market_ids=payload.market_ids,
        quantity_quintals=payload.quantity_quintals,
        transport_mode=payload.transport_mode,
        transport_cost_per_km=payload.transport_cost_per_km,
        transport_cost_fixed=payload.transport_cost_fixed,
        manual_distances_km=payload.manual_distances_km,
        commission_mode=payload.commission_mode,
        commission_pct=payload.commission_pct,
        commission_fixed=payload.commission_fixed,
        other_expenses=payload.other_expenses,
        limit=payload.limit,
    )


@router.get("/atlas/markets")
def atlas_markets(
    commodity: Optional[str] = None,
    state: Optional[str] = None,
    district: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ref_date = _latest_reference_date(db)
    stmt = (
        select(DailyPrice, Commodity, Market)
        .join(Commodity, DailyPrice.commodity_id == Commodity.id)
        .join(Market, DailyPrice.market_id == Market.id)
        .order_by(desc(DailyPrice.arrival_date))
    )
    if commodity and commodity.lower() != "all":
        stmt = stmt.where(Commodity.commodity_name == commodity)
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)
    if district and district.lower() != "all":
        stmt = stmt.where(Market.district == district)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            Market.market_name.ilike(pat) | Market.district.ilike(pat) | Market.state.ilike(pat)
        )

    rows = db.execute(stmt).all()

    by_market: dict[int, dict[str, Any]] = {}
    for dp, comm, mkt in rows:
        if mkt.id not in by_market:
            by_market[mkt.id] = {
                "market_id": mkt.id,
                "market_name": mkt.market_name,
                "state": mkt.state,
                "district": mkt.district,
                "latitude": mkt.latitude,
                "longitude": mkt.longitude,
                "location_source": mkt.location_source,
                "commodity": comm.commodity_name,
                "latest_modal_price": round(dp.modal_price, 2),
                "min_price": round(dp.min_price, 2),
                "max_price": round(dp.max_price, 2),
                "reporting_date": dp.arrival_date.isoformat(),
                "freshness": classify_freshness(dp.arrival_date, ref_date),
                "record_count": 1,
                "is_demo": dp.is_demo,
            }
        else:
            by_market[mkt.id]["record_count"] += 1

    filtered = []
    for item in by_market.values():
        if min_price is not None and item["latest_modal_price"] < min_price:
            continue
        if max_price is not None and item["latest_modal_price"] > max_price:
            continue
        filtered.append(item)

    mapped = [m for m in filtered if m["latitude"] is not None and m["longitude"] is not None]
    unmapped = [m for m in filtered if m["latitude"] is None or m["longitude"] is None]

    return {
        "mapped_count": len(mapped),
        "unmapped_count": len(unmapped),
        "mapped_markets": mapped,
        "unmapped_markets": unmapped,
        "attribution": "Map tiles © OpenStreetMap contributors. Market coordinates use verified APMC town/city references only.",
    }


@router.get("/atlas/summary")
def atlas_summary(
    commodity: str,
    state: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    comm = db.scalar(select(Commodity).where(Commodity.commodity_name == commodity))
    if comm is None:
        raise HTTPException(status_code=404, detail=f"Commodity '{commodity}' not found.")

    stmt = (
        select(DailyPrice, Market)
        .join(Market, DailyPrice.market_id == Market.id)
        .where(DailyPrice.commodity_id == comm.id)
        .order_by(desc(DailyPrice.arrival_date))
    )
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)

    rows = db.execute(stmt).all()
    latest_by_market: dict[int, tuple[DailyPrice, Market]] = {}
    for dp, mkt in rows:
        if mkt.id not in latest_by_market:
            latest_by_market[mkt.id] = (dp, mkt)

    if not latest_by_market:
        return {
            "commodity": comm.commodity_name,
            "empty": True,
            "highest_market": None,
            "lowest_market": None,
            "national_avg_modal": None,
            "price_spread": None,
            "state_comparison": [],
            "top_10_markets": [],
        }

    entries = [
        {
            "market_id": mkt.id,
            "market_name": mkt.market_name,
            "state": mkt.state,
            "district": mkt.district,
            "modal_price": round(dp.modal_price, 2),
            "min_price": round(dp.min_price, 2),
            "max_price": round(dp.max_price, 2),
            "reporting_date": dp.arrival_date.isoformat(),
        }
        for dp, mkt in latest_by_market.values()
    ]
    entries.sort(key=lambda x: x["modal_price"], reverse=True)
    highest = entries[0]
    lowest = entries[-1]
    avg_modal = round(sum(e["modal_price"] for e in entries) / len(entries), 2)
    spread = round(highest["modal_price"] - lowest["modal_price"], 2)

    state_buckets: dict[str, list[float]] = {}
    for e in entries:
        state_buckets.setdefault(e["state"], []).append(e["modal_price"])
    state_comparison = sorted(
        [
            {
                "state": st,
                "avg_modal_price": round(sum(vals) / len(vals), 2),
                "min_modal_price": round(min(vals), 2),
                "max_modal_price": round(max(vals), 2),
                "market_count": len(vals),
            }
            for st, vals in state_buckets.items()
        ],
        key=lambda x: x["avg_modal_price"],
        reverse=True,
    )

    return {
        "commodity": comm.commodity_name,
        "empty": False,
        "highest_market": highest,
        "lowest_market": lowest,
        "national_avg_modal": avg_modal,
        "price_spread": spread,
        "state_comparison": state_comparison,
        "top_10_markets": entries[:10],
    }


@router.get("/crops/{commodity_name}")
def crop_intelligence(
    commodity_name: str,
    variety: Optional[str] = "All",
    state: Optional[str] = "All",
    district: Optional[str] = "All",
    market_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    result = get_crop_intelligence(
        db=db,
        commodity_name=commodity_name,
        variety=variety,
        state=state,
        district=district,
        market_id=market_id,
    )
    if not result.get("found"):
        raise HTTPException(status_code=404, detail=result.get("message", "Commodity not found."))
    return result


@router.get("/market-comparison")
def market_comparison(
    commodity: str,
    market_ids: str = Query(..., description="Comma-separated market IDs (max 4)"),
    variety: Optional[str] = "All",
    origin_market_id: Optional[int] = None,
    quantity_quintals: float = Query(default=25.0, gt=0),
    transport_cost_per_km: float = Query(default=18.0, ge=0),
    commission_pct: float = Query(default=2.5, ge=0),
    other_expenses: float = Query(default=350.0, ge=0),
    days: int = Query(default=60, ge=7, le=365),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        parsed_ids = [int(x.strip()) for x in market_ids.split(",") if x.strip()][:4]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid market_ids parameter.") from exc

    if not parsed_ids:
        raise HTTPException(status_code=400, detail="Select at least one market to compare.")

    comm = db.scalar(select(Commodity).where(Commodity.commodity_name == commodity))
    if comm is None:
        raise HTTPException(status_code=404, detail=f"Commodity '{commodity}' not found.")

    origin_mkt = db.get(Market, origin_market_id) if origin_market_id else None
    ref_date = _latest_reference_date(db) or date.today()
    hist_start = ref_date - timedelta(days=days)

    comparison_rows: list[dict[str, Any]] = []
    chart_series_by_date: dict[str, dict[str, Any]] = {}

    for mid in parsed_ids:
        mkt = db.get(Market, mid)
        if mkt is None:
            continue
        stmt = (
            select(DailyPrice)
            .where(
                DailyPrice.commodity_id == comm.id,
                DailyPrice.market_id == mkt.id,
            )
            .order_by(desc(DailyPrice.arrival_date))
        )
        if variety and variety.lower() != "all":
            stmt = stmt.where(DailyPrice.variety == variety)

        prices = db.scalars(stmt).all()
        if not prices:
            continue

        latest = prices[0]
        prev = next((p for p in prices[1:] if p.arrival_date < latest.arrival_date), None)
        hist_avg = round(sum(p.modal_price for p in prices) / len(prices), 2)
        move_pct = (
            round(((latest.modal_price - prev.modal_price) / prev.modal_price) * 100.0, 2)
            if prev and prev.modal_price > 0
            else None
        )

        if origin_mkt is not None:
            if origin_mkt.id == mkt.id:
                dist_km = 5.0
            else:
                dist_km = estimate_road_distance_km(
                    origin_mkt.latitude, origin_mkt.longitude, mkt.latitude, mkt.longitude
                ) or 120.0
        else:
            dist_km = 35.0

        bd = compute_net_return_breakdown(
            modal_price=latest.modal_price,
            quantity_quintals=quantity_quintals,
            transport_cost_per_km=transport_cost_per_km,
            distance_km=dist_km,
            commission_pct=commission_pct,
            other_expenses=other_expenses,
        )

        comparison_rows.append(
            {
                "market_id": mkt.id,
                "market_name": mkt.market_name,
                "state": mkt.state,
                "district": mkt.district,
                "variety": latest.variety,
                "reporting_date": latest.arrival_date.isoformat(),
                "modal_price": round(latest.modal_price, 2),
                "min_price": round(latest.min_price, 2),
                "max_price": round(latest.max_price, 2),
                "historical_avg": hist_avg,
                "movement_pct": move_pct,
                "arrival_quantity": latest.arrival_quantity,
                "estimated_distance_km": dist_km,
                "estimated_transport_cost": bd["transport_cost"],
                "estimated_commission": bd["commission_amount"],
                "estimated_net_return": bd["estimated_net_return"],
            }
        )

        for p in prices:
            if p.arrival_date >= hist_start:
                d_str = p.arrival_date.isoformat()
                row_point = chart_series_by_date.setdefault(d_str, {"date": d_str})
                row_point[mkt.market_name] = round(p.modal_price, 2)

    if not comparison_rows:
        return {
            "commodity": comm.commodity_name,
            "empty": True,
            "markets": [],
            "historical_series": [],
            "summary": None,
        }

    # Price difference % relative to lowest modal price in selection
    min_modal = min(r["modal_price"] for r in comparison_rows)
    for r in comparison_rows:
        r["price_diff_vs_lowest_pct"] = (
            round(((r["modal_price"] - min_modal) / min_modal) * 100.0, 2) if min_modal > 0 else 0.0
        )

    highest_price_mkt = max(comparison_rows, key=lambda x: x["modal_price"])
    best_net_mkt = max(comparison_rows, key=lambda x: x["estimated_net_return"])
    distinct_dates = sorted({r["reporting_date"] for r in comparison_rows}, reverse=True)

    return {
        "commodity": comm.commodity_name,
        "variety": variety or "All",
        "empty": False,
        "date_mismatch_warning": len(distinct_dates) > 1,
        "reporting_dates": distinct_dates,
        "markets": comparison_rows,
        "historical_series": [chart_series_by_date[k] for k in sorted(chart_series_by_date.keys())],
        "summary": {
            "highest_reported_price_market": {
                "market_name": highest_price_mkt["market_name"],
                "modal_price": highest_price_mkt["modal_price"],
                "reporting_date": highest_price_mkt["reporting_date"],
            },
            "best_net_return_market": {
                "market_name": best_net_mkt["market_name"],
                "estimated_net_return": best_net_mkt["estimated_net_return"],
                "reporting_date": best_net_mkt["reporting_date"],
            },
            "outcomes_differ": highest_price_mkt["market_id"] != best_net_mkt["market_id"],
        },
    }


def _build_reports_query(
    reporting_date: Optional[str],
    state: Optional[str],
    district: Optional[str],
    market: Optional[str],
    commodity: Optional[str],
    variety: Optional[str],
    category: Optional[str],
    search: Optional[str],
):
    stmt = (
        select(DailyPrice, Commodity, Market)
        .join(Commodity, DailyPrice.commodity_id == Commodity.id)
        .join(Market, DailyPrice.market_id == Market.id)
    )
    if reporting_date and reporting_date.lower() != "all":
        stmt = stmt.where(DailyPrice.arrival_date == date.fromisoformat(reporting_date))
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)
    if district and district.lower() != "all":
        stmt = stmt.where(Market.district == district)
    if market and market.lower() != "all":
        stmt = stmt.where(Market.market_name == market)
    if commodity and commodity.lower() != "all":
        stmt = stmt.where(Commodity.commodity_name == commodity)
    if variety and variety.lower() != "all":
        stmt = stmt.where(DailyPrice.variety == variety)
    if category and category.lower() != "all":
        stmt = stmt.where(Commodity.category == category)
    if search and search.strip():
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            Commodity.commodity_name.ilike(pat)
            | Market.market_name.ilike(pat)
            | Market.district.ilike(pat)
            | Market.state.ilike(pat)
            | DailyPrice.variety.ilike(pat)
        )
    return stmt


@router.get("/reports")
def get_reports(
    reporting_date: Optional[str] = None,
    state: Optional[str] = None,
    district: Optional[str] = None,
    market: Optional[str] = None,
    commodity: Optional[str] = None,
    variety: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query(default="arrival_date"),
    sort_dir: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=5, le=200),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    stmt = _build_reports_query(
        reporting_date, state, district, market, commodity, variety, category, search
    )

    sort_map = {
        "arrival_date": DailyPrice.arrival_date,
        "state": Market.state,
        "district": Market.district,
        "market": Market.market_name,
        "commodity": Commodity.commodity_name,
        "variety": DailyPrice.variety,
        "min_price": DailyPrice.min_price,
        "max_price": DailyPrice.max_price,
        "modal_price": DailyPrice.modal_price,
        "arrival_quantity": DailyPrice.arrival_quantity,
    }
    sort_col = sort_map.get(sort_by, DailyPrice.arrival_date)
    order_expr = desc(sort_col) if sort_dir.lower() == "desc" else asc(sort_col)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    offset = (page - 1) * page_size
    rows = db.execute(stmt.order_by(order_expr, desc(DailyPrice.id)).offset(offset).limit(page_size)).all()

    return {
        "total": int(total),
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (int(total) + page_size - 1) // page_size),
        "records": [
            {
                "id": dp.id,
                "arrival_date": dp.arrival_date.isoformat(),
                "state": mkt.state,
                "district": mkt.district,
                "market": mkt.market_name,
                "commodity": comm.commodity_name,
                "category": comm.category,
                "variety": dp.variety,
                "grade": dp.grade,
                "min_price": round(dp.min_price, 2),
                "max_price": round(dp.max_price, 2),
                "modal_price": round(dp.modal_price, 2),
                "arrival_quantity": dp.arrival_quantity,
                "original_unit": dp.original_unit,
                "source": dp.source,
                "is_demo": dp.is_demo,
            }
            for dp, comm, mkt in rows
        ],
    }


@router.get("/reports/export")
def export_reports(
    format: str = Query(default="csv", pattern="^(csv|pdf)$"),
    reporting_date: Optional[str] = None,
    state: Optional[str] = None,
    district: Optional[str] = None,
    market: Optional[str] = None,
    commodity: Optional[str] = None,
    variety: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    stmt = _build_reports_query(
        reporting_date, state, district, market, commodity, variety, category, search
    )
    rows = db.execute(stmt.order_by(desc(DailyPrice.arrival_date)).limit(1000)).all()

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Reporting Date",
                "State",
                "District",
                "Market",
                "Commodity",
                "Category",
                "Variety",
                "Min Price (INR/Qtl)",
                "Max Price (INR/Qtl)",
                "Modal Price (INR/Qtl)",
                "Arrival Quantity (Tonnes)",
                "Source",
            ]
        )
        for dp, comm, mkt in rows:
            writer.writerow(
                [
                    dp.arrival_date.isoformat(),
                    mkt.state,
                    mkt.district,
                    mkt.market_name,
                    comm.commodity_name,
                    comm.category,
                    dp.variety,
                    f"{dp.min_price:.2f}",
                    f"{dp.max_price:.2f}",
                    f"{dp.modal_price:.2f}",
                    f"{dp.arrival_quantity:.1f}" if dp.arrival_quantity is not None else "",
                    dp.source,
                ]
            )
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="cropledger_price_report.csv"'},
        )

    # PDF export using fpdf2
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(23, 107, 69)
    pdf.cell(0, 8, "CropLedger - Agricultural Market Price Report", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(80, 90, 85)
    pdf.cell(
        0,
        6,
        f"Filtered records exported: {len(rows)} (prices normalized to INR/Quintal)",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(3)

    headers = ["Date", "State", "Market", "Commodity", "Variety", "Min", "Max", "Modal", "Arrivals"]
    widths = [24, 34, 42, 36, 26, 22, 22, 24, 24]
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(234, 243, 236)
    pdf.set_text_color(32, 43, 37)
    for h, w in zip(headers, widths):
        pdf.cell(w, 7, h, border=1, fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    for dp, comm, mkt in rows[:200]:
        vals = [
            dp.arrival_date.isoformat(),
            mkt.state[:18],
            mkt.market_name[:22],
            comm.commodity_name[:19],
            dp.variety[:14],
            f"{dp.min_price:,.0f}",
            f"{dp.max_price:,.0f}",
            f"{dp.modal_price:,.0f}",
            f"{dp.arrival_quantity:,.1f}" if dp.arrival_quantity is not None else "-",
        ]
        for val, w in zip(vals, widths):
            pdf.cell(w, 6, val, border=1)
        pdf.ln()

    pdf_bytes = bytes(pdf.output())
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="cropledger_price_report.pdf"'},
    )


@router.get("/forecast")
def get_forecast(
    commodity: str,
    market_id: int,
    variety: Optional[str] = "All",
    lookback_days: int = Query(default=180, ge=14, le=730),
    model_type: str = Query(
        default="moving_average",
        pattern="^(moving_average|seasonal_baseline|random_forest|gradient_boosting)$",
    ),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return run_market_forecast(
        db=db,
        commodity_name=commodity,
        market_id=market_id,
        variety=variety,
        lookback_days=lookback_days,
        model_type=model_type,
    )


@router.get("/watchlist")
def get_watchlist(db: Session = Depends(get_db)) -> dict[str, Any]:
    ref_date = _latest_reference_date(db)
    items = db.scalars(
        select(UserWatchlist)
        .where(UserWatchlist.local_profile_id == "default")
        .order_by(desc(UserWatchlist.created_at))
    ).all()

    results = []
    for item in items:
        comm = db.get(Commodity, item.commodity_id)
        mkt = db.get(Market, item.market_id) if item.market_id else None
        if comm is None:
            continue

        stmt = (
            select(DailyPrice, Market)
            .join(Market, DailyPrice.market_id == Market.id)
            .where(DailyPrice.commodity_id == comm.id)
            .order_by(desc(DailyPrice.arrival_date))
            .limit(5)
        )
        if mkt is not None:
            stmt = stmt.where(DailyPrice.market_id == mkt.id)
        recent = db.execute(stmt).all()

        latest_dp, latest_mkt = recent[0] if recent else (None, mkt)
        prev_dp = (
            next((dp for dp, _ in recent[1:] if dp.arrival_date < latest_dp.arrival_date), None)
            if latest_dp
            else None
        )
        pct_move = (
            round(((latest_dp.modal_price - prev_dp.modal_price) / prev_dp.modal_price) * 100.0, 2)
            if latest_dp and prev_dp and prev_dp.modal_price > 0
            else None
        )

        results.append(
            {
                "id": item.id,
                "commodity_id": comm.id,
                "commodity": comm.commodity_name,
                "market_id": mkt.id if mkt else None,
                "market": latest_mkt.market_name if latest_mkt else "All Markets",
                "state": latest_mkt.state if latest_mkt else None,
                "latest_modal_price": round(latest_dp.modal_price, 2) if latest_dp else None,
                "previous_modal_price": round(prev_dp.modal_price, 2) if prev_dp else None,
                "movement_pct": pct_move,
                "reporting_date": latest_dp.arrival_date.isoformat() if latest_dp else None,
                "freshness": classify_freshness(latest_dp.arrival_date, ref_date) if latest_dp else "Unavailable",
            }
        )

    return {"items": results}


@router.post("/watchlist")
def add_watchlist(payload: WatchlistCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    comm = db.get(Commodity, payload.commodity_id)
    if comm is None:
        raise HTTPException(status_code=404, detail="Commodity not found.")
    if payload.market_id is not None and db.get(Market, payload.market_id) is None:
        raise HTTPException(status_code=404, detail="Market not found.")

    existing = db.scalar(
        select(UserWatchlist).where(
            UserWatchlist.local_profile_id == "default",
            UserWatchlist.commodity_id == payload.commodity_id,
            UserWatchlist.market_id == payload.market_id,
        )
    )
    if existing is not None:
        return {"id": existing.id, "message": "Already in watchlist."}

    item = UserWatchlist(
        local_profile_id="default",
        commodity_id=payload.commodity_id,
        market_id=payload.market_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "message": "Added to watchlist."}


@router.delete("/watchlist/{item_id}")
def delete_watchlist(item_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    item = db.get(UserWatchlist, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Watchlist item not found.")
    db.delete(item)
    db.commit()
    return {"message": "Removed from watchlist."}


@router.get("/alerts")
def list_alerts(db: Session = Depends(get_db)) -> dict[str, Any]:
    evaluate_active_alerts(db)
    alerts = db.scalars(
        select(PriceAlert)
        .where(PriceAlert.local_profile_id == "default")
        .order_by(desc(PriceAlert.created_at))
    ).all()

    events = db.execute(
        select(AlertEvent, PriceAlert, Commodity, Market)
        .join(PriceAlert, AlertEvent.alert_id == PriceAlert.id)
        .join(Commodity, AlertEvent.commodity_id == Commodity.id)
        .join(Market, AlertEvent.market_id == Market.id)
        .order_by(desc(AlertEvent.reporting_date), desc(AlertEvent.triggered_at))
        .limit(50)
    ).all()

    rules_out = []
    for a in alerts:
        comm = db.get(Commodity, a.commodity_id)
        mkt = db.get(Market, a.market_id) if a.market_id else None
        rules_out.append(
            {
                "id": a.id,
                "commodity_id": a.commodity_id,
                "commodity": comm.commodity_name if comm else "Unknown",
                "market_id": a.market_id,
                "market": mkt.market_name if mkt else "All Markets",
                "condition": a.condition,
                "threshold_value": a.threshold_value,
                "is_active": a.is_active,
                "created_at": a.created_at.isoformat(),
            }
        )

    events_out = [
        {
            "id": ev.id,
            "alert_id": ev.alert_id,
            "condition": alert.condition,
            "threshold_value": alert.threshold_value,
            "commodity": comm.commodity_name,
            "market": mkt.market_name,
            "state": mkt.state,
            "triggered_price": round(ev.triggered_price, 2),
            "reporting_date": ev.reporting_date.isoformat(),
            "trigger_reason": ev.trigger_reason,
            "acknowledged": ev.acknowledged,
        }
        for ev, alert, comm, mkt in events
    ]

    return {
        "rules": rules_out,
        "events": events_out,
        "delivery_note": "Alerts are evaluated in-app against newly imported and stored market records. SMS/WhatsApp push integrations are not configured.",
    }


@router.post("/alerts")
def create_alert(payload: PriceAlertCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    comm = db.get(Commodity, payload.commodity_id)
    if comm is None:
        raise HTTPException(status_code=404, detail="Commodity not found.")
    if payload.market_id is not None and db.get(Market, payload.market_id) is None:
        raise HTTPException(status_code=404, detail="Market not found.")

    alert = PriceAlert(
        local_profile_id="default",
        commodity_id=payload.commodity_id,
        market_id=payload.market_id,
        condition=payload.condition,
        threshold_value=payload.threshold_value,
        is_active=True,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    newly_triggered = evaluate_active_alerts(db)
    return {
        "id": alert.id,
        "message": "Price alert created.",
        "newly_triggered_count": len(newly_triggered),
    }


@router.patch("/alerts/{alert_id}")
def toggle_alert(
    alert_id: int,
    payload: PriceAlertToggleRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    alert = db.get(PriceAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert rule not found.")
    alert.is_active = payload.is_active
    db.commit()
    return {"id": alert.id, "is_active": alert.is_active}


@router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    alert = db.get(PriceAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert rule not found.")
    db.delete(alert)
    db.commit()
    return {"message": "Alert deleted."}


@router.post("/alerts/evaluate")
def run_alert_evaluation(db: Session = Depends(get_db)) -> dict[str, Any]:
    triggered = evaluate_active_alerts(db)
    return {"evaluated": True, "newly_triggered": triggered}


@router.post("/alerts/events/{event_id}/ack")
def acknowledge_alert_event(event_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    ev = db.get(AlertEvent, event_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Alert event not found.")
    ev.acknowledged = True
    db.commit()
    return {"id": ev.id, "acknowledged": True}


@router.get("/data-quality")
def get_data_quality(db: Session = Depends(get_db)) -> dict[str, Any]:
    source_status = _dataset_source_status(db)
    ref_date = _latest_reference_date(db)

    logs = db.scalars(select(DataRefreshLog).order_by(desc(DataRefreshLog.id)).limit(20)).all()
    issues = db.scalars(select(ValidationIssue).order_by(desc(ValidationIssue.id)).limit(100)).all()

    # Market freshness & coverage audit
    market_latest = db.execute(
        select(
            Market.id,
            Market.market_name,
            Market.state,
            Market.district,
            Market.latitude,
            Market.longitude,
            func.max(DailyPrice.arrival_date).label("latest_date"),
            func.count(DailyPrice.id).label("record_count"),
        )
        .outerjoin(DailyPrice, Market.id == DailyPrice.market_id)
        .group_by(Market.id)
        .order_by(Market.state, Market.market_name)
    ).all()

    freshness_counts = {"Recently updated": 0, "Delayed": 0, "Stale": 0, "Unavailable": 0}
    market_status_list: list[dict[str, Any]] = []
    for mid, mname, st, dist, lat, lon, latest_dt, rec_cnt in market_latest:
        status_label = classify_freshness(latest_dt, ref_date)
        freshness_counts[status_label] += 1
        lag = (ref_date - latest_dt).days if (ref_date and latest_dt) else None
        market_status_list.append(
            {
                "market_id": mid,
                "market_name": mname,
                "state": st,
                "district": dist,
                "latest_reporting_date": latest_dt.isoformat() if latest_dt else None,
                "lag_days": lag,
                "freshness": status_label,
                "record_count": int(rec_cnt),
                "coordinates_verified": lat is not None and lon is not None,
            }
        )

    stale_markets = [m for m in market_status_list if m["freshness"] in {"Delayed", "Stale", "Unavailable"}]

    return {
        "source_status": source_status,
        "freshness_rules": FRESHNESS_RULES,
        "freshness_summary": freshness_counts,
        "total_markets": len(market_status_list),
        "stale_or_delayed_markets": stale_markets,
        "market_coverage": market_status_list,
        "refresh_logs": [
            {
                "id": log.id,
                "source": log.source,
                "source_reporting_date": log.source_reporting_date.isoformat()
                if log.source_reporting_date
                else None,
                "started_at": log.started_at.isoformat() if log.started_at else None,
                "completed_at": log.completed_at.isoformat() if log.completed_at else None,
                "status": log.status,
                "imported_records": log.imported_records,
                "duplicate_records": log.duplicate_records,
                "rejected_records": log.rejected_records,
                "missing_field_count": log.missing_field_count,
                "invalid_price_count": log.invalid_price_count,
                "error_message": log.error_message,
            }
            for log in logs
        ],
        "validation_issues": [
            {
                "id": iss.id,
                "refresh_log_id": iss.refresh_log_id,
                "row_number": iss.row_number,
                "source": iss.source,
                "issue_type": iss.issue_type,
                "severity": iss.severity,
                "field_name": iss.field_name,
                "explanation": iss.explanation,
                "created_at": iss.created_at.isoformat() if iss.created_at else None,
            }
            for iss in issues
        ],
    }


@router.post("/data/import")
async def import_csv_endpoint(
    file: UploadFile = File(...),
    source_label: str = Query(default="User CSV Upload"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a valid .csv file.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")
    try:
        summary = ingest_csv_bytes(db, content, source=f"{source_label} ({file.filename})", is_demo=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    evaluate_active_alerts(db)
    return summary


@router.post("/data/refresh")
def refresh_data_endpoint(
    state: Optional[str] = None,
    commodity: Optional[str] = None,
    limit: int = Query(default=250, ge=10, le=1000),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    res = refresh_from_agmarknet(db, state=state, commodity=commodity, limit=limit)
    evaluate_active_alerts(db)
    return res


@router.post("/data/seed-demo")
def seed_demo_endpoint(db: Session = Depends(get_db)) -> dict[str, Any]:
    res = seed_demo_data_if_empty(db)
    if res is None:
        return {"seeded": False, "message": "Database already contains price records."}
    return {"seeded": True, "summary": res}


@router.delete("/data/clear-demo")
def clear_demo_endpoint(db: Session = Depends(get_db)) -> dict[str, Any]:
    deleted = db.execute(delete(DailyPrice).where(DailyPrice.is_demo.is_(True))).rowcount
    db.commit()
    return {"deleted_demo_records": int(deleted or 0)}


@router.get("/settings")
def get_settings_endpoint(db: Session = Depends(get_db)) -> dict[str, Any]:
    pref = _get_or_create_preferences(db)
    source_status = _dataset_source_status(db)
    try:
        preferred_crops = json.loads(pref.preferred_crops_json)
    except Exception:
        preferred_crops = ["Onion", "Tomato", "Wheat", "Soybean"]

    return {
        "preferred_state": pref.preferred_state,
        "preferred_district": pref.preferred_district,
        "preferred_crops": preferred_crops,
        "currency_display": pref.currency_display,
        "price_unit": pref.price_unit,
        "default_quantity_quintals": pref.default_quantity_quintals,
        "transport_cost_per_km": pref.transport_cost_per_km,
        "default_commission_pct": pref.default_commission_pct,
        "default_handling_cost": pref.default_handling_cost,
        "alert_in_app": pref.alert_in_app,
        "theme_preference": pref.theme_preference,
        "source_status": source_status,
    }


@router.put("/settings")
def update_settings_endpoint(
    payload: UserSettingsUpdateRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pref = _get_or_create_preferences(db)
    pref.preferred_state = payload.preferred_state
    pref.preferred_district = payload.preferred_district
    pref.preferred_crops_json = json.dumps(payload.preferred_crops)
    pref.currency_display = payload.currency_display
    pref.price_unit = payload.price_unit
    pref.default_quantity_quintals = payload.default_quantity_quintals
    pref.transport_cost_per_km = payload.transport_cost_per_km
    pref.default_commission_pct = payload.default_commission_pct
    pref.default_handling_cost = payload.default_handling_cost
    pref.alert_in_app = payload.alert_in_app
    pref.theme_preference = payload.theme_preference
    db.commit()
    db.refresh(pref)
    return {"message": "Preferences saved.", "preferred_state": pref.preferred_state}
