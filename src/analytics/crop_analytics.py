from __future__ import annotations

import math
from datetime import timedelta
from typing import Any, Optional

import numpy as np
import pandas as pd
from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from src.models import Commodity, DailyPrice, Market

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def get_crop_intelligence(
    db: Session,
    commodity_name: str,
    variety: Optional[str] = None,
    state: Optional[str] = None,
    district: Optional[str] = None,
    market_id: Optional[int] = None,
) -> dict[str, Any]:
    commodity = db.scalar(select(Commodity).where(Commodity.commodity_name == commodity_name))
    if commodity is None:
        return {"found": False, "commodity": commodity_name, "message": "Commodity not found."}

    stmt = (
        select(
            DailyPrice.arrival_date,
            DailyPrice.min_price,
            DailyPrice.max_price,
            DailyPrice.modal_price,
            DailyPrice.arrival_quantity,
            DailyPrice.variety,
            DailyPrice.source,
            DailyPrice.is_demo,
            Market.id.label("market_id"),
            Market.market_name,
            Market.state,
            Market.district,
        )
        .join(Market, DailyPrice.market_id == Market.id)
        .where(DailyPrice.commodity_id == commodity.id)
    )
    if variety and variety.lower() != "all":
        stmt = stmt.where(DailyPrice.variety == variety)
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)
    if district and district.lower() != "all":
        stmt = stmt.where(Market.district == district)
    if market_id:
        stmt = stmt.where(Market.id == market_id)

    stmt = stmt.order_by(asc(DailyPrice.arrival_date))
    rows = db.execute(stmt).all()
    if not rows:
        return {
            "found": True,
            "commodity": commodity.commodity_name,
            "category": commodity.category,
            "description": commodity.description,
            "empty": True,
            "message": "No price records match the selected filters.",
        }

    df = pd.DataFrame(
        [
            {
                "arrival_date": r.arrival_date,
                "min_price": float(r.min_price),
                "max_price": float(r.max_price),
                "modal_price": float(r.modal_price),
                "arrival_quantity": float(r.arrival_quantity) if r.arrival_quantity is not None else np.nan,
                "variety": r.variety,
                "source": r.source,
                "is_demo": bool(r.is_demo),
                "market_id": int(r.market_id),
                "market_name": r.market_name,
                "state": r.state,
                "district": r.district,
            }
            for r in rows
        ]
    )
    df["dt"] = pd.to_datetime(df["arrival_date"])
    df = df.sort_values("dt")

    latest_dt = df["dt"].max()
    latest_slice = df[df["dt"] == latest_dt]
    latest_modal = round(float(latest_slice["modal_price"].mean()), 2)
    latest_min = round(float(latest_slice["min_price"].min()), 2)
    latest_max = round(float(latest_slice["max_price"].max()), 2)

    historical_avg = round(float(df["modal_price"].mean()), 2)
    highest_recorded = round(float(df["max_price"].max()), 2)
    lowest_recorded = round(float(df["min_price"].min()), 2)

    daily_agg = (
        df.groupby("dt", as_index=False)
        .agg(
            modal_price=("modal_price", "mean"),
            min_price=("min_price", "min"),
            max_price=("max_price", "max"),
            arrival_quantity=("arrival_quantity", "sum"),
            market_count=("market_id", "nunique"),
        )
        .sort_values("dt")
    )

    std_dev = float(daily_agg["modal_price"].std(ddof=1)) if len(daily_agg) > 1 else 0.0
    cv_pct = round((std_dev / historical_avg) * 100.0, 2) if historical_avg > 0 else 0.0

    # Recent price movement (latest vs previous reporting date, and vs 7d prior)
    recent_change_pct = 0.0
    previous_modal = None
    if len(daily_agg) >= 2:
        prev_val = float(daily_agg.iloc[-2]["modal_price"])
        previous_modal = round(prev_val, 2)
        if prev_val > 0:
            recent_change_pct = round(((latest_modal - prev_val) / prev_val) * 100.0, 2)

    week_ago_cutoff = latest_dt - timedelta(days=7)
    week_rows = daily_agg[daily_agg["dt"] <= week_ago_cutoff]
    weekly_change_pct = None
    if not week_rows.empty:
        wk_val = float(week_rows.iloc[-1]["modal_price"])
        if wk_val > 0:
            weekly_change_pct = round(((latest_modal - wk_val) / wk_val) * 100.0, 2)

    # Daily trend (last 90 available days for responsive charting)
    daily_tail = daily_agg.tail(120)
    daily_trend = [
        {
            "date": row["dt"].strftime("%Y-%m-%d"),
            "modal_price": round(float(row["modal_price"]), 2),
            "min_price": round(float(row["min_price"]), 2),
            "max_price": round(float(row["max_price"]), 2),
            "arrival_quantity": round(float(row["arrival_quantity"]), 1)
            if not math.isnan(float(row["arrival_quantity"])) and float(row["arrival_quantity"]) > 0
            else None,
            "market_count": int(row["market_count"]),
        }
        for _, row in daily_tail.iterrows()
    ]

    # Weekly aggregation
    weekly_df = (
        df.set_index("dt")
        .resample("W-MON")
        .agg(
            modal_price=("modal_price", "mean"),
            min_price=("min_price", "min"),
            max_price=("max_price", "max"),
            arrival_quantity=("arrival_quantity", "sum"),
        )
        .dropna(subset=["modal_price"])
        .reset_index()
    )
    weekly_trend = [
        {
            "period": row["dt"].strftime("%Y-%m-%d"),
            "modal_price": round(float(row["modal_price"]), 2),
            "min_price": round(float(row["min_price"]), 2),
            "max_price": round(float(row["max_price"]), 2),
            "arrival_quantity": round(float(row["arrival_quantity"]), 1)
            if not math.isnan(float(row["arrival_quantity"])) and float(row["arrival_quantity"]) > 0
            else None,
        }
        for _, row in weekly_df.iterrows()
    ]

    # Monthly aggregation
    monthly_df = (
        df.set_index("dt")
        .resample("MS")
        .agg(
            modal_price=("modal_price", "mean"),
            min_price=("min_price", "min"),
            max_price=("max_price", "max"),
            arrival_quantity=("arrival_quantity", "sum"),
        )
        .dropna(subset=["modal_price"])
        .reset_index()
    )
    monthly_trend = [
        {
            "period": row["dt"].strftime("%Y-%m"),
            "label": row["dt"].strftime("%b %Y"),
            "modal_price": round(float(row["modal_price"]), 2),
            "min_price": round(float(row["min_price"]), 2),
            "max_price": round(float(row["max_price"]), 2),
            "arrival_quantity": round(float(row["arrival_quantity"]), 1)
            if not math.isnan(float(row["arrival_quantity"])) and float(row["arrival_quantity"]) > 0
            else None,
        }
        for _, row in monthly_df.iterrows()
    ]

    # Seasonality by calendar month
    df["month_num"] = df["dt"].dt.month
    distinct_years = sorted(df["dt"].dt.year.unique().tolist())
    span_days = int((df["dt"].max() - df["dt"].min()).days)
    years_covered = round(max(span_days / 365.25, 0.01), 2)

    seasonal_df = (
        df.groupby("month_num", as_index=False)
        .agg(
            avg_price=("modal_price", "mean"),
            min_price=("min_price", "min"),
            max_price=("max_price", "max"),
            observations=("modal_price", "count"),
        )
        .sort_values("month_num")
    )
    seasonality = [
        {
            "month_num": int(row["month_num"]),
            "month": MONTH_NAMES[int(row["month_num"]) - 1],
            "avg_price": round(float(row["avg_price"]), 2),
            "min_price": round(float(row["min_price"]), 2),
            "max_price": round(float(row["max_price"]), 2),
            "observations": int(row["observations"]),
        }
        for _, row in seasonal_df.iterrows()
    ]
    seasonal_high = max(seasonality, key=lambda x: x["avg_price"]) if seasonality else None
    seasonal_low = min(seasonality, key=lambda x: x["avg_price"]) if seasonality else None

    if span_days < 300:
        seasonality_note = (
            f"Only {span_days} days ({years_covered:.2f} years) of data are available. "
            "Observed month averages reflect short-term coverage and do not establish multi-year seasonality."
        )
    else:
        seasonality_note = (
            f"Computed from {len(distinct_years)} calendar years ({', '.join(map(str, distinct_years))}, "
            f"spanning {span_days} days). Multi-year repetition strengthens confidence, though weather and policy shifts still alter timing."
        )

    # Market-wise comparison (latest available per market)
    latest_per_market = (
        df.sort_values("dt")
        .groupby(["market_id", "market_name", "state", "district"], as_index=False)
        .last()
        .sort_values("modal_price", ascending=False)
    )
    market_comparison = [
        {
            "market_id": int(row["market_id"]),
            "market_name": row["market_name"],
            "state": row["state"],
            "district": row["district"],
            "modal_price": round(float(row["modal_price"]), 2),
            "min_price": round(float(row["min_price"]), 2),
            "max_price": round(float(row["max_price"]), 2),
            "reporting_date": row["dt"].strftime("%Y-%m-%d"),
            "arrival_quantity": round(float(row["arrival_quantity"]), 1)
            if not math.isnan(float(row["arrival_quantity"]))
            else None,
        }
        for _, row in latest_per_market.iterrows()
    ]

    # Arrival vs price correlation analysis
    arr_df = daily_agg.dropna(subset=["arrival_quantity"])
    arr_df = arr_df[arr_df["arrival_quantity"] > 0]
    arrival_correlation = None
    arrival_series: list[dict[str, Any]] = []
    if len(arr_df) >= 5:
        corr_val = float(arr_df["arrival_quantity"].corr(arr_df["modal_price"]))
        if not math.isnan(corr_val):
            arrival_correlation = round(corr_val, 3)
        for _, row in arr_df.tail(60).iterrows():
            arrival_series.append(
                {
                    "date": row["dt"].strftime("%Y-%m-%d"),
                    "arrival_quantity": round(float(row["arrival_quantity"]), 1),
                    "modal_price": round(float(row["modal_price"]), 2),
                }
            )

    return {
        "found": True,
        "empty": False,
        "commodity": commodity.commodity_name,
        "category": commodity.category,
        "description": commodity.description,
        "variety": variety or "All",
        "is_demo_included": bool(df["is_demo"].any()),
        "summary": {
            "latest_reporting_date": latest_dt.strftime("%Y-%m-%d"),
            "latest_modal_price": latest_modal,
            "previous_modal_price": previous_modal,
            "latest_min_price": latest_min,
            "latest_max_price": latest_max,
            "historical_avg_price": historical_avg,
            "highest_recorded_price": highest_recorded,
            "lowest_recorded_price": lowest_recorded,
            "volatility_cv_pct": cv_pct,
            "volatility_std": round(std_dev, 2),
            "recent_change_pct": recent_change_pct,
            "weekly_change_pct": weekly_change_pct,
            "reporting_market_coverage": int(df["market_id"].nunique()),
            "total_observations": int(len(df)),
        },
        "daily_trend": daily_trend,
        "weekly_trend": weekly_trend,
        "monthly_trend": monthly_trend,
        "seasonality": {
            "years_covered": years_covered,
            "calendar_years": distinct_years,
            "note": seasonality_note,
            "seasonal_high": seasonal_high,
            "seasonal_low": seasonal_low,
            "months": seasonality,
        },
        "market_comparison": market_comparison,
        "arrival_analysis": {
            "available": len(arrival_series) >= 5,
            "pearson_correlation": arrival_correlation,
            "disclaimer": (
                "Observed co-movement between market arrivals and modal price is statistical correlation only; "
                "correlation does not establish causation, as weather, storage releases, and regional demand also drive prices."
            ),
            "series": arrival_series,
        },
    }
