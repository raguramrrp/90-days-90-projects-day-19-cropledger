from __future__ import annotations

import csv
import math
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.config import BASE_DIR
from src.data.csv_importer import ingest_records
from src.models import (
    Commodity,
    DailyPrice,
    Market,
    PriceAlert,
    UserPreference,
    UserWatchlist,
)

DEMO_SOURCE_LABEL = "CropLedger Demo Dataset (AGMARKNET Schema)"

# Market catalog with realistic regional specializations
MARKET_CATALOG: list[dict[str, Any]] = [
    {"market": "Lasalgaon", "state": "Maharashtra", "district": "Nashik", "lag_days": 0},
    {"market": "Pimpalgaon", "state": "Maharashtra", "district": "Nashik", "lag_days": 0},
    {"market": "Pune", "state": "Maharashtra", "district": "Pune", "lag_days": 0},
    {"market": "Vashi (Mumbai)", "state": "Maharashtra", "district": "Thane", "lag_days": 0},
    {"market": "Solapur", "state": "Maharashtra", "district": "Solapur", "lag_days": 1},
    {"market": "Nagpur", "state": "Maharashtra", "district": "Nagpur", "lag_days": 3},
    {"market": "Indore", "state": "Madhya Pradesh", "district": "Indore", "lag_days": 0},
    {"market": "Ujjain", "state": "Madhya Pradesh", "district": "Ujjain", "lag_days": 1},
    {"market": "Bhopal", "state": "Madhya Pradesh", "district": "Bhopal", "lag_days": 4},
    {"market": "Neemuch", "state": "Madhya Pradesh", "district": "Neemuch", "lag_days": 0},
    {"market": "Azadpur", "state": "Delhi", "district": "Delhi", "lag_days": 0},
    {"market": "Karnal", "state": "Haryana", "district": "Karnal", "lag_days": 0},
    {"market": "Ludhiana", "state": "Punjab", "district": "Ludhiana", "lag_days": 1},
    {"market": "Khanna", "state": "Punjab", "district": "Ludhiana", "lag_days": 2},
    {"market": "Jaipur", "state": "Rajasthan", "district": "Jaipur", "lag_days": 0},
    {"market": "Kota", "state": "Rajasthan", "district": "Kota", "lag_days": 1},
    {"market": "Agra", "state": "Uttar Pradesh", "district": "Agra", "lag_days": 0},
    {"market": "Kanpur", "state": "Uttar Pradesh", "district": "Kanpur", "lag_days": 4},
    {"market": "Ahmedabad", "state": "Gujarat", "district": "Ahmedabad", "lag_days": 0},
    {"market": "Rajkot", "state": "Gujarat", "district": "Rajkot", "lag_days": 1},
    {"market": "Bengaluru (Yeshwanthpur)", "state": "Karnataka", "district": "Bengaluru", "lag_days": 0},
    {"market": "Kolar", "state": "Karnataka", "district": "Kolar", "lag_days": 0},
    {"market": "Bowenpally (Hyderabad)", "state": "Telangana", "district": "Hyderabad", "lag_days": 0},
    {"market": "Erode", "state": "Tamil Nadu", "district": "Erode", "lag_days": 1},
    {"market": "Koyambedu (Chennai)", "state": "Tamil Nadu", "district": "Chennai", "lag_days": 0},
    {"market": "Trichy (Gandhi Market)", "state": "Tamil Nadu", "district": "Tiruchirappalli", "lag_days": 0},
    {"market": "Oddanchatram", "state": "Tamil Nadu", "district": "Dindigul", "lag_days": 0},
    {"market": "Madurai (Mattuthavani)", "state": "Tamil Nadu", "district": "Madurai", "lag_days": 0},
    {"market": "Tirunelveli (Gandhi Market)", "state": "Tamil Nadu", "district": "Tirunelveli", "lag_days": 0},
    {"market": "Kavalkinaru", "state": "Tamil Nadu", "district": "Tirunelveli", "lag_days": 0},
    # Deliberately unmapped coordinates (not in VERIFIED_MARKET_COORDS) + stale lag for Data Quality realism
    {"market": "Nizamabad Yard", "state": "Telangana", "district": "Nizamabad", "lag_days": 9},
    {"market": "Sagar Mandi", "state": "Madhya Pradesh", "district": "Sagar", "lag_days": 11},
]

ALL_VEG_HUBS = [
    "Koyambedu (Chennai)",
    "Tirunelveli (Gandhi Market)",
    "Kavalkinaru",
    "Trichy (Gandhi Market)",
    "Oddanchatram",
    "Madurai (Mattuthavani)",
    "Vashi (Mumbai)",
    "Pune",
    "Bengaluru (Yeshwanthpur)",
    "Kolar",
    "Bowenpally (Hyderabad)",
    "Azadpur",
    "Ahmedabad",
    "Indore",
    "Jaipur",
    "Agra",
    "Ludhiana",
]

# Commodity profiles: base_price (INR/qtl), seasonal amplitude, volatility, peak_month, markets, history_days
COMMODITY_PROFILES: list[dict[str, Any]] = [
    {
        "commodity": "Onion",
        "category": "Vegetables",
        "variety": "Red / Bellary",
        "base": 2150.0,
        "amp": 620.0,
        "vol": 0.032,
        "peak_month": 10,
        "base_arrivals": 1450.0,
        "days": 420,
        "markets": ["Lasalgaon", "Pimpalgaon", "Pune", "Vashi (Mumbai)", "Solapur", "Azadpur", "Indore", "Bengaluru (Yeshwanthpur)", "Bowenpally (Hyderabad)", "Ahmedabad", "Koyambedu (Chennai)", "Trichy (Gandhi Market)", "Oddanchatram", "Madurai (Mattuthavani)", "Tirunelveli (Gandhi Market)", "Kavalkinaru"],
    },
    {
        "commodity": "Tomato",
        "category": "Vegetables",
        "variety": "Hybrid / Nattu",
        "base": 2300.0,
        "amp": 850.0,
        "vol": 0.055,
        "peak_month": 7,
        "base_arrivals": 880.0,
        "days": 420,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Potato",
        "category": "Vegetables",
        "variety": "Jyoti / Kolar",
        "base": 1820.0,
        "amp": 290.0,
        "vol": 0.024,
        "peak_month": 11,
        "base_arrivals": 1850.0,
        "days": 420,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Brinjal",
        "category": "Vegetables",
        "variety": "Round / Violet",
        "base": 2650.0,
        "amp": 420.0,
        "vol": 0.036,
        "peak_month": 6,
        "base_arrivals": 520.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Okra (Bhindi)",
        "category": "Vegetables",
        "variety": "Green Tender",
        "base": 3400.0,
        "amp": 510.0,
        "vol": 0.034,
        "peak_month": 5,
        "base_arrivals": 460.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Cabbage",
        "category": "Vegetables",
        "variety": "Green Compact",
        "base": 1650.0,
        "amp": 280.0,
        "vol": 0.031,
        "peak_month": 9,
        "base_arrivals": 740.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Cauliflower",
        "category": "Vegetables",
        "variety": "Snowball",
        "base": 2450.0,
        "amp": 460.0,
        "vol": 0.035,
        "peak_month": 8,
        "base_arrivals": 610.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Carrot",
        "category": "Vegetables",
        "variety": "Ooty / Red",
        "base": 3250.0,
        "amp": 490.0,
        "vol": 0.029,
        "peak_month": 10,
        "base_arrivals": 530.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Green Chilli",
        "category": "Vegetables",
        "variety": "G4 / Samba",
        "base": 4600.0,
        "amp": 720.0,
        "vol": 0.041,
        "peak_month": 4,
        "base_arrivals": 380.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "French Beans",
        "category": "Vegetables",
        "variety": "Bush / Flat",
        "base": 5400.0,
        "amp": 840.0,
        "vol": 0.038,
        "peak_month": 7,
        "base_arrivals": 290.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Drumstick (Moringa)",
        "category": "Vegetables",
        "variety": "PKM-1",
        "base": 4800.0,
        "amp": 920.0,
        "vol": 0.042,
        "peak_month": 3,
        "base_arrivals": 260.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Bottle Gourd (Lauki)",
        "category": "Vegetables",
        "variety": "Long Green",
        "base": 1750.0,
        "amp": 260.0,
        "vol": 0.028,
        "peak_month": 6,
        "base_arrivals": 490.0,
        "days": 90,
        "markets": ALL_VEG_HUBS,
    },
    {
        "commodity": "Wheat",
        "category": "Cereals",
        "variety": "Lokwan",
        "base": 2580.0,
        "amp": 180.0,
        "vol": 0.012,
        "peak_month": 2,
        "base_arrivals": 2100.0,
        "days": 420,
        "markets": ["Indore", "Ujjain", "Bhopal", "Karnal", "Ludhiana", "Khanna", "Kota", "Jaipur", "Kanpur", "Sagar Mandi"],
    },
    {
        "commodity": "Paddy (Common)",
        "category": "Cereals",
        "variety": "Common",
        "base": 2340.0,
        "amp": 150.0,
        "vol": 0.014,
        "peak_month": 9,
        "base_arrivals": 2400.0,
        "days": 380,
        "markets": ["Karnal", "Ludhiana", "Khanna", "Koyambedu (Chennai)", "Bowenpally (Hyderabad)", "Agra"],
    },
    {
        "commodity": "Soybean",
        "category": "Oilseeds",
        "variety": "Yellow",
        "base": 4620.0,
        "amp": 340.0,
        "vol": 0.019,
        "peak_month": 5,
        "base_arrivals": 1150.0,
        "days": 420,
        "markets": ["Indore", "Ujjain", "Bhopal", "Neemuch", "Nagpur", "Kota", "Solapur", "Sagar Mandi"],
    },
    {
        "commodity": "Mustard",
        "category": "Oilseeds",
        "variety": "Mustard",
        "base": 5720.0,
        "amp": 390.0,
        "vol": 0.018,
        "peak_month": 1,
        "base_arrivals": 950.0,
        "days": 380,
        "markets": ["Jaipur", "Kota", "Agra", "Karnal", "Neemuch"],
    },
    {
        "commodity": "Chana (Bengal Gram)",
        "category": "Pulses",
        "variety": "Desi",
        "base": 6180.0,
        "amp": 420.0,
        "vol": 0.020,
        "peak_month": 12,
        "base_arrivals": 680.0,
        "days": 380,
        "markets": ["Indore", "Bhopal", "Jaipur", "Kota", "Solapur", "Nagpur", "Rajkot"],
    },
    {
        "commodity": "Tur (Arhar)",
        "category": "Pulses",
        "variety": "Red",
        "base": 9250.0,
        "amp": 680.0,
        "vol": 0.022,
        "peak_month": 11,
        "base_arrivals": 420.0,
        "days": 380,
        "markets": ["Nagpur", "Solapur", "Pune", "Bowenpally (Hyderabad)", "Bengaluru (Yeshwanthpur)"],
    },
    {
        "commodity": "Cotton",
        "category": "Fibre Crops",
        "variety": "H-4",
        "base": 7180.0,
        "amp": 410.0,
        "vol": 0.017,
        "peak_month": 3,
        "base_arrivals": 1050.0,
        "days": 380,
        "markets": ["Rajkot", "Ahmedabad", "Nagpur", "Neemuch", "Nizamabad Yard"],
    },
    {
        "commodity": "Turmeric",
        "category": "Spices",
        "variety": "Finger",
        "base": 13400.0,
        "amp": 980.0,
        "vol": 0.025,
        "peak_month": 4,
        "base_arrivals": 310.0,
        "days": 380,
        "markets": ["Erode", "Nizamabad Yard", "Pune"],
    },
    {
        "commodity": "Banana",
        "category": "Fruits",
        "variety": "Robusta",
        "base": 1890.0,
        "amp": 240.0,
        "vol": 0.028,
        "peak_month": 8,
        "base_arrivals": 620.0,
        "days": 10,  # Intentionally short history for insufficient-history forecast testing
        "markets": ["Koyambedu (Chennai)", "Vashi (Mumbai)"],
    },
]

MARKET_PREMIUMS: dict[str, float] = {
    "Vashi (Mumbai)": 1.13,
    "Azadpur": 1.11,
    "Koyambedu (Chennai)": 1.09,
    "Bengaluru (Yeshwanthpur)": 1.08,
    "Pune": 1.06,
    "Ahmedabad": 1.04,
    "Bowenpally (Hyderabad)": 1.03,
    "Jaipur": 1.02,
    "Indore": 1.00,
    "Lasalgaon": 0.96,
    "Pimpalgaon": 0.95,
    "Kolar": 0.94,
    "Agra": 0.96,
    "Karnal": 0.99,
    "Ludhiana": 1.01,
    "Khanna": 0.98,
    "Ujjain": 0.97,
    "Bhopal": 0.98,
    "Neemuch": 0.96,
    "Solapur": 0.97,
    "Nagpur": 1.00,
    "Kota": 0.98,
    "Kanpur": 0.97,
    "Rajkot": 0.99,
    "Erode": 1.05,
    "Trichy (Gandhi Market)": 1.03,
    "Oddanchatram": 0.96,
    "Madurai (Mattuthavani)": 1.02,
    "Tirunelveli (Gandhi Market)": 1.01,
    "Kavalkinaru": 0.95,
    "Nizamabad Yard": 0.97,
    "Sagar Mandi": 0.95,
}


def generate_demo_rows(end_date: date | None = None) -> list[dict[str, Any]]:
    """Generate deterministic, realistic multi-month AGMARKNET-schema demo records."""
    anchor_date = end_date or date(2026, 11, 12)
    rng = np.random.default_rng(42)
    market_lookup = {m["market"]: m for m in MARKET_CATALOG}
    rows: list[dict[str, Any]] = []

    for profile in COMMODITY_PROFILES:
        history_days = profile["days"]
        base_price = profile["base"]
        amp = profile["amp"]
        vol = profile["vol"]
        peak_month = profile["peak_month"]
        base_arrivals = profile["base_arrivals"]

        # Create commodity-level daily latent price series
        latent_prices: dict[date, float] = {}
        drift = 0.0
        for offset in range(history_days, -1, -1):
            d = anchor_date - timedelta(days=offset)
            # Skip Sundays (many Indian APMCs are closed on Sunday)
            if d.weekday() == 6:
                continue
            month_angle = 2 * math.pi * ((d.month - peak_month) / 12.0) + (d.day / 30.0) * (math.pi / 6.0)
            seasonal = amp * math.cos(month_angle)
            drift = 0.92 * drift + float(rng.normal(0.0, base_price * vol * 0.45))
            # Recent realistic momentum for overview & alerts variety
            recent_nudge = 0.0
            if offset <= 14:
                if profile["commodity"] == "Tomato":
                    recent_nudge = 320.0 * (1.0 - offset / 14.0)
                elif profile["commodity"] == "Onion":
                    recent_nudge = 240.0 * (1.0 - offset / 14.0)
                elif profile["commodity"] == "Potato":
                    recent_nudge = -160.0 * (1.0 - offset / 14.0)
                elif profile["commodity"] == "Soybean":
                    recent_nudge = -220.0 * (1.0 - offset / 14.0)

            price = max(350.0, base_price + seasonal + drift + recent_nudge)
            latent_prices[d] = price

        for m_name in profile["markets"]:
            m_info = market_lookup[m_name]
            lag_days = int(m_info["lag_days"])
            prem = MARKET_PREMIUMS.get(m_name, 1.0)
            m_cutoff = anchor_date - timedelta(days=lag_days)

            for d, base_day_price in latent_prices.items():
                if d > m_cutoff:
                    continue
                # Occasional missing report day (~4%) to mirror real APMC reporting gaps
                if rng.random() < 0.04 and d != m_cutoff:
                    continue

                local_noise = float(rng.normal(1.0, vol * 0.65))
                modal = round(max(300.0, base_day_price * prem * local_noise), 0)
                spread_low = float(rng.uniform(0.05, 0.12))
                spread_high = float(rng.uniform(0.05, 0.12))
                min_p = round(max(200.0, modal * (1.0 - spread_low)), 0)
                max_p = round(modal * (1.0 + spread_high), 0)
                # Inverse arrival-price relationship with noise
                rel_price = modal / base_price
                arrivals = round(
                    max(25.0, base_arrivals * (1.15 / max(rel_price, 0.55)) * float(rng.uniform(0.75, 1.25))),
                    1,
                )

                rows.append(
                    {
                        "state": m_info["state"],
                        "district": m_info["district"],
                        "market": m_name,
                        "commodity": profile["commodity"],
                        "category": profile["category"],
                        "variety": profile["variety"],
                        "grade": "FAQ",
                        "arrival_date": d.isoformat(),
                        "min_price": min_p,
                        "max_price": max_p,
                        "modal_price": modal,
                        "arrival_quantity": arrivals,
                        "original_unit": "INR/Quintal",
                    }
                )

    return rows


def export_sample_csv(target_path: Path | None = None) -> Path:
    out_path = target_path or (BASE_DIR / "data" / "sample_agmarknet_prices.csv")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows = generate_demo_rows()
    fieldnames = [
        "state",
        "district",
        "market",
        "commodity",
        "category",
        "variety",
        "grade",
        "arrival_date",
        "min_price",
        "max_price",
        "modal_price",
        "arrival_quantity",
        "original_unit",
    ]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return out_path


def seed_demo_data_if_empty(db: Session) -> dict[str, Any] | None:
    """Seed the clearly labelled CropLedger Demo Dataset only when daily_prices is empty."""
    existing_count = db.scalar(select(func.count(DailyPrice.id))) or 0
    if existing_count > 0:
        return None

    rows = generate_demo_rows()
    summary = ingest_records(db, rows, source=DEMO_SOURCE_LABEL, is_demo=True)

    # Seed sensible default user preferences, starter watchlist, and example alerts
    pref = db.get(UserPreference, "default")
    if pref is None:
        db.add(UserPreference(local_profile_id="default"))

    onion = db.scalar(select(Commodity).where(Commodity.commodity_name == "Onion"))
    tomato = db.scalar(select(Commodity).where(Commodity.commodity_name == "Tomato"))
    wheat = db.scalar(select(Commodity).where(Commodity.commodity_name == "Wheat"))
    soybean = db.scalar(select(Commodity).where(Commodity.commodity_name == "Soybean"))

    lasalgaon = db.scalar(select(Market).where(Market.market_name == "Lasalgaon"))
    kolar = db.scalar(select(Market).where(Market.market_name == "Kolar"))
    indore = db.scalar(select(Market).where(Market.market_name == "Indore"))

    existing_watchlist = db.scalar(select(func.count(UserWatchlist.id))) or 0
    if existing_watchlist == 0:
        watchlist_pairs = [
            (onion, lasalgaon),
            (tomato, kolar),
            (wheat, indore),
            (soybean, indore),
        ]
        for comm, mkt in watchlist_pairs:
            if comm is not None:
                db.add(
                    UserWatchlist(
                        local_profile_id="default",
                        commodity_id=comm.id,
                        market_id=mkt.id if mkt else None,
                    )
                )

    existing_alerts = db.scalar(select(func.count(PriceAlert.id))) or 0
    if existing_alerts == 0:
        if tomato is not None and kolar is not None:
            db.add(
                PriceAlert(
                    local_profile_id="default",
                    commodity_id=tomato.id,
                    market_id=kolar.id,
                    condition="price_above",
                    threshold_value=2400.0,
                    is_active=True,
                )
            )
        if onion is not None and lasalgaon is not None:
            db.add(
                PriceAlert(
                    local_profile_id="default",
                    commodity_id=onion.id,
                    market_id=lasalgaon.id,
                    condition="pct_increase",
                    threshold_value=5.0,
                    is_active=True,
                )
            )
    db.commit()

    # Evaluate initial alerts so alert centre shows real triggered events from the dataset
    from src.analytics.alerts_engine import evaluate_active_alerts

    evaluate_active_alerts(db)
    return summary
