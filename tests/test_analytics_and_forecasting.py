from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select

from src.analytics.alerts_engine import evaluate_active_alerts
from src.analytics.crop_analytics import get_crop_intelligence
from src.analytics.forecasting import generate_forecast_from_series
from src.analytics.net_return import compute_net_return_breakdown, rank_markets_by_net_return
from src.data.csv_importer import ingest_records
from src.models import Commodity, Market, PriceAlert


def test_net_return_math_and_ranking_prefers_closer_market_when_transport_offsets_price(temp_db_session):
    # Seed 2 markets: Local Market (2400/qtl) vs Distant Market (2600/qtl, 200 km away)
    # Also test date mismatch detection (11 Nov vs 12 Nov)
    rows = [
        {
            "state": "Maharashtra",
            "district": "Nashik",
            "market": "Lasalgaon",
            "commodity": "Onion",
            "variety": "Red",
            "grade": "FAQ",
            "arrival_date": "2026-11-12",
            "min_price": 2200,
            "max_price": 2500,
            "modal_price": 2400,
            "arrival_quantity": 1200,
        },
        {
            "state": "Maharashtra",
            "district": "Thane",
            "market": "Vashi (Mumbai)",
            "commodity": "Onion",
            "variety": "Red",
            "grade": "FAQ",
            "arrival_date": "2026-11-11",
            "min_price": 2400,
            "max_price": 2700,
            "modal_price": 2600,
            "arrival_quantity": 900,
        },
    ]
    ingest_records(temp_db_session, rows, source="Unit Test", is_demo=False)

    bd = compute_net_return_breakdown(
        modal_price=2400,
        quantity_quintals=20,
        transport_cost_per_km=25,
        distance_km=10,
        commission_pct=2.0,
        other_expenses=300,
    )
    assert bd["gross_revenue"] == 48000.0
    assert bd["transport_cost"] == 250.0
    assert bd["commission_amount"] == 960.0
    assert bd["estimated_net_return"] == 46490.0

    lasalgaon = temp_db_session.scalar(select(Market).where(Market.market_name == "Lasalgaon"))
    assert lasalgaon is not None

    ranking = rank_markets_by_net_return(
        db=temp_db_session,
        commodity_name="Onion",
        origin_market_id=lasalgaon.id,
        quantity_quintals=20,
        transport_cost_per_km=35.0,
        commission_pct=2.5,
        other_expenses=350.0,
    )
    assert ranking["date_mismatch_warning"] is True
    assert len(ranking["ranked_markets"]) == 2
    # Lasalgaon should beat Vashi (Mumbai) when transport is 35/km over ~200km (>6000) vs 4000 gross diff
    assert ranking["ranked_markets"][0]["market_name"] == "Lasalgaon"
    assert "higher modal price" in ranking["explanation"]


def test_forecasting_insufficient_history_and_chronological_evaluation():
    short_dates = [date(2026, 11, 1) + timedelta(days=i) for i in range(10)]
    short_prices = [2000.0 + i * 10 for i in range(10)]
    short_res = generate_forecast_from_series(short_dates, short_prices, model_type="moving_average")
    assert short_res["sufficient_data"] is False
    assert short_res["message"] == "Insufficient historical data to generate a reliable forecast."
    assert short_res["forecast"] == []

    long_dates = [date(2026, 6, 1) + timedelta(days=i) for i in range(60)]
    long_prices = [2200.0 + (i % 7) * 25.0 + i * 2.0 for i in range(60)]
    ma_res = generate_forecast_from_series(long_dates, long_prices, model_type="moving_average")
    rf_res = generate_forecast_from_series(long_dates, long_prices, model_type="random_forest")

    assert ma_res["sufficient_data"] is True
    assert len(ma_res["forecast"]) == 7
    assert ma_res["training_period"]["train_observations"] + ma_res["training_period"]["test_observations"] == 60
    assert rf_res["sufficient_data"] is True
    assert rf_res["evaluation"]["mae"] >= 0
    assert rf_res["evaluation"]["baseline_mae"] == ma_res["evaluation"]["baseline_mae"]


def test_crop_intelligence_and_alert_evaluation(temp_db_session):
    rows = []
    start = date(2026, 10, 1)
    for i in range(25):
        d = start + timedelta(days=i)
        rows.append(
            {
                "state": "Karnataka",
                "district": "Kolar",
                "market": "Kolar",
                "commodity": "Tomato",
                "variety": "Hybrid",
                "grade": "FAQ",
                "arrival_date": d.isoformat(),
                "min_price": 1800 + i * 30,
                "max_price": 2200 + i * 30,
                "modal_price": 2000 + i * 30,
                "arrival_quantity": 950 - i * 10,
            }
        )
    ingest_records(temp_db_session, rows, source="Test Crop", is_demo=False)

    intel = get_crop_intelligence(temp_db_session, "Tomato")
    assert intel["found"] is True
    assert intel["empty"] is False
    assert intel["summary"]["volatility_cv_pct"] > 0
    assert intel["arrival_analysis"]["available"] is True
    assert intel["arrival_analysis"]["pearson_correlation"] < 0
    assert "short-term coverage" in intel["seasonality"]["note"]

    tomato = temp_db_session.scalar(select(Commodity).where(Commodity.commodity_name == "Tomato"))
    kolar = temp_db_session.scalar(select(Market).where(Market.market_name == "Kolar"))
    assert tomato is not None and kolar is not None

    temp_db_session.add(
        PriceAlert(
            local_profile_id="default",
            commodity_id=tomato.id,
            market_id=kolar.id,
            condition="price_above",
            threshold_value=2500.0,
            is_active=True,
        )
    )
    temp_db_session.commit()

    triggered = evaluate_active_alerts(temp_db_session)
    assert len(triggered) == 1
    assert triggered[0]["triggered_price"] == 2000 + 24 * 30
    # Running again should not duplicate the same day event
    assert evaluate_active_alerts(temp_db_session) == []
