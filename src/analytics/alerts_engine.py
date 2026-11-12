from __future__ import annotations

from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from src.models import AlertEvent, Commodity, DailyPrice, Market, PriceAlert


def evaluate_active_alerts(db: Session, local_profile_id: str = "default") -> list[dict[str, Any]]:
    """Evaluate active price alert rules against latest stored price records."""
    alerts = db.scalars(
        select(PriceAlert).where(
            PriceAlert.local_profile_id == local_profile_id,
            PriceAlert.is_active.is_(True),
        )
    ).all()

    newly_triggered: list[dict[str, Any]] = []
    for alert in alerts:
        stmt = (
            select(DailyPrice, Market, Commodity)
            .join(Market, DailyPrice.market_id == Market.id)
            .join(Commodity, DailyPrice.commodity_id == Commodity.id)
            .where(DailyPrice.commodity_id == alert.commodity_id)
        )
        if alert.market_id is not None:
            stmt = stmt.where(DailyPrice.market_id == alert.market_id)

        stmt = stmt.order_by(desc(DailyPrice.arrival_date)).limit(30)
        rows = db.execute(stmt).all()
        if not rows:
            continue

        # Group latest 2 reporting dates per market
        by_market: dict[int, list[tuple[DailyPrice, Market, Commodity]]] = {}
        for dp, mkt, comm in rows:
            bucket = by_market.setdefault(mkt.id, [])
            if len(bucket) < 2 and all(existing[0].arrival_date != dp.arrival_date for existing in bucket):
                bucket.append((dp, mkt, comm))

        for mkt_id, entries in by_market.items():
            latest_dp, mkt, comm = entries[0]
            prev_dp = entries[1][0] if len(entries) > 1 else None

            triggered = False
            reason = ""
            cond = alert.condition
            thresh = alert.threshold_value

            if cond == "price_above" and latest_dp.modal_price > thresh:
                triggered = True
                reason = (
                    f"{comm.commodity_name} modal price (₹{latest_dp.modal_price:,.0f}/qtl) "
                    f"exceeded threshold ₹{thresh:,.0f}/qtl."
                )
            elif cond == "price_below" and latest_dp.modal_price < thresh:
                triggered = True
                reason = (
                    f"{comm.commodity_name} modal price (₹{latest_dp.modal_price:,.0f}/qtl) "
                    f"fell below threshold ₹{thresh:,.0f}/qtl."
                )
            elif prev_dp is not None and prev_dp.modal_price > 0:
                pct_change = ((latest_dp.modal_price - prev_dp.modal_price) / prev_dp.modal_price) * 100.0
                if cond == "pct_increase" and pct_change >= thresh:
                    triggered = True
                    reason = (
                        f"{comm.commodity_name} rose {pct_change:.1f}% "
                        f"(₹{prev_dp.modal_price:,.0f} -> ₹{latest_dp.modal_price:,.0f}/qtl), exceeding +{thresh:.1f}%."
                    )
                elif cond == "pct_decrease" and pct_change <= -abs(thresh):
                    triggered = True
                    reason = (
                        f"{comm.commodity_name} dropped {abs(pct_change):.1f}% "
                        f"(₹{prev_dp.modal_price:,.0f} -> ₹{latest_dp.modal_price:,.0f}/qtl), exceeding -{abs(thresh):.1f}%."
                    )
                elif cond == "significant_movement" and abs(pct_change) >= abs(thresh):
                    triggered = True
                    reason = (
                        f"{comm.commodity_name} moved {pct_change:+.1f}% "
                        f"(₹{prev_dp.modal_price:,.0f} -> ₹{latest_dp.modal_price:,.0f}/qtl), exceeding ±{abs(thresh):.1f}%."
                    )

            if not triggered:
                continue

            existing_event = db.scalar(
                select(AlertEvent).where(
                    AlertEvent.alert_id == alert.id,
                    AlertEvent.market_id == mkt.id,
                    AlertEvent.reporting_date == latest_dp.arrival_date,
                )
            )
            if existing_event is None:
                ev = AlertEvent(
                    alert_id=alert.id,
                    commodity_id=comm.id,
                    market_id=mkt.id,
                    triggered_price=latest_dp.modal_price,
                    reporting_date=latest_dp.arrival_date,
                    trigger_reason=reason,
                )
                db.add(ev)
                newly_triggered.append(
                    {
                        "alert_id": alert.id,
                        "commodity": comm.commodity_name,
                        "market": mkt.market_name,
                        "triggered_price": latest_dp.modal_price,
                        "reporting_date": latest_dp.arrival_date.isoformat(),
                        "trigger_reason": reason,
                    }
                )

    if newly_triggered:
        db.commit()
    return newly_triggered
