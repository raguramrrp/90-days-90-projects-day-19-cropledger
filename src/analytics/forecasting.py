from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from src.models import Commodity, DailyPrice, ForecastResult, Market

MIN_OBSERVATIONS_FOR_FORECAST = 21
HORIZON_DAYS = 7


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[float, float]:
    mae = float(np.mean(np.abs(y_true - y_pred)))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    return round(mae, 2), round(rmse, 2)


def _build_lag_features(prices: list[float], dates: list[date], idx: int) -> list[float]:
    """Build strictly causal lagged features using only indices < idx (zero leakage)."""
    p_1 = prices[idx - 1]
    p_2 = prices[idx - 2] if idx >= 2 else p_1
    p_3 = prices[idx - 3] if idx >= 3 else p_2
    p_7 = prices[idx - 7] if idx >= 7 else prices[max(0, idx - 1)]
    window_7 = prices[max(0, idx - 7) : idx]
    window_14 = prices[max(0, idx - 14) : idx]
    roll_7 = float(np.mean(window_7))
    roll_14 = float(np.mean(window_14))
    roll_std_7 = float(np.std(window_7)) if len(window_7) > 1 else 0.0
    d = dates[idx]
    month_sin = math.sin(2.0 * math.pi * d.month / 12.0)
    month_cos = math.cos(2.0 * math.pi * d.month / 12.0)
    dow = float(d.weekday())
    return [p_1, p_2, p_3, p_7, roll_7, roll_14, roll_std_7, month_sin, month_cos, dow]


def generate_forecast_from_series(
    dates: list[date],
    prices: list[float],
    model_type: str = "moving_average",  # "moving_average" | "seasonal_baseline" | "random_forest" | "gradient_boosting"
    horizon_days: int = HORIZON_DAYS,
) -> dict[str, Any]:
    """Generate a chronological, leakage-free forecast with baseline comparison and uncertainty intervals."""
    if len(dates) < MIN_OBSERVATIONS_FOR_FORECAST:
        return {
            "sufficient_data": False,
            "message": "Insufficient historical data to generate a reliable forecast.",
            "minimum_required_days": MIN_OBSERVATIONS_FOR_FORECAST,
            "available_days": len(dates),
            "historical": [
                {"date": d.isoformat(), "actual_price": round(float(p), 2)}
                for d, p in zip(dates, prices)
            ],
            "forecast": [],
        }

    # Chronological train/test split (last 20% or at least 7 points for out-of-sample evaluation)
    n = len(prices)
    test_size = max(7, min(21, int(round(n * 0.2))))
    split_idx = n - test_size
    if split_idx < 14:
        return {
            "sufficient_data": False,
            "message": "Insufficient historical data to generate a reliable forecast.",
            "minimum_required_days": MIN_OBSERVATIONS_FOR_FORECAST,
            "available_days": n,
            "historical": [
                {"date": d.isoformat(), "actual_price": round(float(p), 2)}
                for d, p in zip(dates, prices)
            ],
            "forecast": [],
        }

    # Baseline 1: 7-day trailing Moving Average (strictly past values)
    ma_test_preds: list[float] = []
    # Baseline 2: Seasonal / 6-reporting-day lag naive
    sb_test_preds: list[float] = []
    for i in range(split_idx, n):
        ma_test_preds.append(float(np.mean(prices[max(0, i - 7) : i])))
        sb_test_preds.append(float(prices[max(0, i - 6)]))

    y_test = np.array(prices[split_idx:], dtype=float)
    baseline_mae, baseline_rmse = _compute_metrics(y_test, np.array(ma_test_preds, dtype=float))
    sb_mae, sb_rmse = _compute_metrics(y_test, np.array(sb_test_preds, dtype=float))

    residuals_std = float(np.std(y_test - np.array(ma_test_preds, dtype=float), ddof=1)) if len(y_test) > 1 else 0.0
    selected_model_label = "7-Day Historical Moving Average"
    model_mae = baseline_mae
    model_rmse = baseline_rmse

    ml_model = None
    if model_type == "seasonal_baseline":
        selected_model_label = "Recent-Cycle Lagged Baseline (6-Day Lag)"
        model_mae = sb_mae
        model_rmse = sb_rmse
        residuals_std = float(np.std(y_test - np.array(sb_test_preds, dtype=float), ddof=1)) if len(y_test) > 1 else 0.0
    elif model_type in {"random_forest", "gradient_boosting"}:
        start_feat_idx = 7
        X_train = np.array([_build_lag_features(prices, dates, i) for i in range(start_feat_idx, split_idx)])
        y_train = np.array(prices[start_feat_idx:split_idx], dtype=float)
        X_test = np.array([_build_lag_features(prices, dates, i) for i in range(split_idx, n)])

        if model_type == "random_forest":
            selected_model_label = "Random Forest Regressor (Lagged Features)"
            ml_model = RandomForestRegressor(n_estimators=120, max_depth=6, random_state=42)
        else:
            selected_model_label = "Gradient Boosting Regressor (Lagged Features)"
            ml_model = GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=0.06, random_state=42)

        ml_model.fit(X_train, y_train)
        ml_test_preds = ml_model.predict(X_test)
        model_mae, model_rmse = _compute_metrics(y_test, ml_test_preds)
        residuals_std = float(np.std(y_test - ml_test_preds, ddof=1)) if len(y_test) > 1 else 0.0

        # Refit on all observed history strictly for future horizon generation
        X_all = np.array([_build_lag_features(prices, dates, i) for i in range(start_feat_idx, n)])
        y_all = np.array(prices[start_feat_idx:n], dtype=float)
        ml_model.fit(X_all, y_all)

    # Ensure sensible minimum uncertainty band (at least 1.5% of latest price or residual std)
    latest_price = float(prices[-1])
    sigma = max(residuals_std, latest_price * 0.015)

    # Iterative horizon predictions (skipping Sundays just like APMC calendars)
    working_dates = list(dates)
    working_prices = list(prices)
    forecast_points: list[dict[str, Any]] = []

    cursor_date = dates[-1]
    step = 0
    while len(forecast_points) < horizon_days:
        cursor_date = cursor_date + timedelta(days=1)
        if cursor_date.weekday() == 6:
            continue
        step += 1
        idx = len(working_prices)
        working_dates.append(cursor_date)

        if model_type == "moving_average":
            pred = float(np.mean(working_prices[max(0, idx - 7) : idx]))
        elif model_type == "seasonal_baseline":
            pred = float(working_prices[max(0, idx - 6)])
        else:
            # Need a dummy placeholder in working_prices? No, _build_lag_features only reads indices < idx
            feat = np.array([_build_lag_features(working_prices, working_dates, idx)])
            pred = float(ml_model.predict(feat)[0])  # type: ignore[union-attr]

        pred = max(100.0, pred)
        working_prices.append(pred)
        # Uncertainty widens gently with sqrt(step)
        half_width = 1.28 * sigma * math.sqrt(step)
        forecast_points.append(
            {
                "date": cursor_date.isoformat(),
                "predicted_price": round(pred, 2),
                "lower_bound": round(max(50.0, pred - half_width), 2),
                "upper_bound": round(pred + half_width, 2),
            }
        )

    return {
        "sufficient_data": True,
        "model_key": model_type,
        "model_name": selected_model_label,
        "horizon_days": horizon_days,
        "training_period": {
            "start": dates[0].isoformat(),
            "end": dates[-1].isoformat(),
            "total_observations": n,
            "train_observations": split_idx,
            "test_observations": test_size,
        },
        "evaluation": {
            "mae": model_mae,
            "rmse": model_rmse,
            "baseline_model": "7-Day Historical Moving Average",
            "baseline_mae": baseline_mae,
            "baseline_rmse": baseline_rmse,
            "beats_baseline_mae": model_mae < baseline_mae,
            "note": (
                "Evaluated using a strict chronological holdout split (last ~20% of dates) with zero future leakage. "
                "Complex models do not always outperform simple baselines on volatile agricultural series."
            ),
        },
        "historical": [
            {"date": d.isoformat(), "actual_price": round(float(p), 2)}
            for d, p in zip(dates[-60:], prices[-60:])
        ],
        "forecast": forecast_points,
    }


def run_market_forecast(
    db: Session,
    commodity_name: str,
    market_id: int,
    variety: Optional[str] = None,
    lookback_days: int = 180,
    model_type: str = "moving_average",
) -> dict[str, Any]:
    commodity = db.scalar(select(Commodity).where(Commodity.commodity_name == commodity_name))
    market = db.get(Market, market_id)
    if commodity is None or market is None:
        return {
            "sufficient_data": False,
            "message": "Selected commodity or market was not found.",
            "historical": [],
            "forecast": [],
            "selling_window_observations": [],
        }

    stmt = (
        select(DailyPrice)
        .where(
            DailyPrice.commodity_id == commodity.id,
            DailyPrice.market_id == market.id,
        )
        .order_by(asc(DailyPrice.arrival_date))
    )
    if variety and variety.lower() != "all":
        stmt = stmt.where(DailyPrice.variety == variety)

    records = db.scalars(stmt).all()
    if not records:
        return {
            "sufficient_data": False,
            "commodity": commodity.commodity_name,
            "market": market.market_name,
            "message": "Insufficient historical data to generate a reliable forecast.",
            "historical": [],
            "forecast": [],
            "selling_window_observations": [
                "Current market data is unavailable for this commodity and market combination."
            ],
        }

    df = pd.DataFrame(
        [
            {
                "arrival_date": r.arrival_date,
                "modal_price": float(r.modal_price),
                "arrival_quantity": float(r.arrival_quantity) if r.arrival_quantity is not None else np.nan,
            }
            for r in records
        ]
    )
    daily = df.groupby("arrival_date", as_index=False).agg(
        modal_price=("modal_price", "mean"),
        arrival_quantity=("arrival_quantity", "mean"),
    ).sort_values("arrival_date")

    if lookback_days > 0 and len(daily) > lookback_days:
        daily_model = daily.tail(lookback_days)
    else:
        daily_model = daily

    dates_list = daily_model["arrival_date"].tolist()
    prices_list = daily_model["modal_price"].astype(float).tolist()

    forecast_out = generate_forecast_from_series(
        dates=dates_list,
        prices=prices_list,
        model_type=model_type,
        horizon_days=HORIZON_DAYS,
    )

    # Persist forecast points when sufficient
    if forecast_out.get("sufficient_data") and forecast_out.get("forecast"):
        ev = forecast_out["evaluation"]
        tp = forecast_out["training_period"]
        for pt in forecast_out["forecast"]:
            db.add(
                ForecastResult(
                    commodity_id=commodity.id,
                    market_id=market.id,
                    variety=variety or "All",
                    model_name=forecast_out["model_name"],
                    forecast_date=date.fromisoformat(pt["date"]),
                    predicted_price=pt["predicted_price"],
                    lower_bound=pt["lower_bound"],
                    upper_bound=pt["upper_bound"],
                    mae=ev["mae"],
                    rmse=ev["rmse"],
                    baseline_mae=ev["baseline_mae"],
                    baseline_rmse=ev["baseline_rmse"],
                    training_start=date.fromisoformat(tp["start"]),
                    training_end=date.fromisoformat(tp["end"]),
                )
            )
        db.commit()

    # Evidence-based Selling Window Observations (never guarantees future prices)
    observations: list[str] = []
    latest_price = prices_list[-1]
    hist_avg = float(np.mean(prices_list))
    if latest_price > hist_avg * 1.03:
        observations.append(
            f"Latest modal price (₹{latest_price:,.0f}/qtl) is {((latest_price / hist_avg) - 1) * 100:.1f}% "
            f"above its {len(prices_list)}-day historical average (₹{hist_avg:,.0f}/qtl)."
        )
    elif latest_price < hist_avg * 0.97:
        observations.append(
            f"Latest modal price (₹{latest_price:,.0f}/qtl) is {((1 - latest_price / hist_avg)) * 100:.1f}% "
            f"below its {len(prices_list)}-day historical average (₹{hist_avg:,.0f}/qtl)."
        )
    else:
        observations.append(
            f"Latest modal price (₹{latest_price:,.0f}/qtl) is trading close to its {len(prices_list)}-day average (₹{hist_avg:,.0f}/qtl)."
        )

    if len(prices_list) >= 6:
        recent_5_change = ((prices_list[-1] - prices_list[-6]) / prices_list[-6]) * 100.0
        if recent_5_change >= 2.0:
            observations.append(
                f"Prices have increased by {recent_5_change:.1f}% over the last 5 reporting days."
            )
        elif recent_5_change <= -2.0:
            observations.append(
                f"Prices have declined by {abs(recent_5_change):.1f}% over the last 5 reporting days."
            )

    # Check if another market currently has a higher modal price for same commodity
    other_latest = db.execute(
        select(DailyPrice.modal_price, Market.market_name, DailyPrice.arrival_date)
        .join(Market, DailyPrice.market_id == Market.id)
        .where(
            DailyPrice.commodity_id == commodity.id,
            Market.id != market.id,
        )
        .order_by(DailyPrice.arrival_date.desc(), DailyPrice.modal_price.desc())
        .limit(25)
    ).all()
    if other_latest:
        top_other = max(other_latest, key=lambda x: x[0])
        if top_other[0] > latest_price * 1.04:
            observations.append(
                f"{top_other[1]} recently reported ₹{top_other[0]:,.0f}/qtl (on {top_other[2].isoformat()}); "
                "use Price Advisor to verify whether net return remains higher after transport cost."
            )

    if not forecast_out.get("sufficient_data"):
        observations.append(
            f"Current market history ({len(prices_list)} reporting days) is insufficient for reliable forecasting."
        )
    else:
        avg_fcst = float(np.mean([p["predicted_price"] for p in forecast_out["forecast"]]))
        pct_diff = ((avg_fcst - latest_price) / latest_price) * 100.0
        observations.append(
            f"Model baseline indicates an average 7-day projection of ₹{avg_fcst:,.0f}/qtl "
            f"({pct_diff:+.1f}% vs latest observed), subject to ±₹{forecast_out['evaluation']['mae']:,.0f}/qtl holdout MAE. "
            "Forecasts are statistical estimates and never guarantee future prices."
        )

    return {
        "commodity": commodity.commodity_name,
        "market": market.market_name,
        "state": market.state,
        "variety": variety or "All",
        "selling_window_observations": observations,
        **forecast_out,
    }
