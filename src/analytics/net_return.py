from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from src.data.market_coords import estimate_road_distance_km
from src.models import Commodity, DailyPrice, Market


@dataclass
class MarketReturnInput:
    market_id: int
    market_name: str
    state: str
    district: str
    commodity_name: str
    variety: str
    modal_price: float
    min_price: float
    max_price: float
    reporting_date: date
    source: str
    is_demo: bool
    quantity_quintals: float
    transport_cost: float
    transport_mode_note: str
    distance_km: Optional[float]
    commission_amount: float
    other_expenses: float

    @property
    def gross_revenue(self) -> float:
        return round(self.modal_price * self.quantity_quintals, 2)

    @property
    def estimated_net_return(self) -> float:
        return round(
            self.gross_revenue - self.transport_cost - self.commission_amount - self.other_expenses,
            2,
        )

    @property
    def net_price_per_quintal(self) -> float:
        if self.quantity_quintals <= 0:
            return 0.0
        return round(self.estimated_net_return / self.quantity_quintals, 2)


def compute_net_return_breakdown(
    modal_price: float,
    quantity_quintals: float,
    transport_cost_total: Optional[float] = None,
    transport_cost_per_km: float = 18.0,
    distance_km: Optional[float] = None,
    commission_pct: Optional[float] = 2.5,
    commission_fixed: Optional[float] = None,
    other_expenses: float = 350.0,
) -> dict[str, float]:
    if quantity_quintals <= 0:
        raise ValueError("Quantity in quintals must be greater than zero.")

    gross_revenue = round(modal_price * quantity_quintals, 2)

    if transport_cost_total is not None and transport_cost_total >= 0:
        transport_cost = round(float(transport_cost_total), 2)
    else:
        effective_km = max(float(distance_km or 0.0), 0.0)
        transport_cost = round(effective_km * max(float(transport_cost_per_km), 0.0), 2)

    if commission_fixed is not None and commission_fixed >= 0:
        commission_amount = round(float(commission_fixed), 2)
    else:
        pct = max(float(commission_pct or 0.0), 0.0)
        commission_amount = round(gross_revenue * (pct / 100.0), 2)

    handling = round(max(float(other_expenses), 0.0), 2)
    net_return = round(gross_revenue - transport_cost - commission_amount - handling, 2)
    net_per_qtl = round(net_return / quantity_quintals, 2)

    return {
        "gross_revenue": gross_revenue,
        "transport_cost": transport_cost,
        "commission_amount": commission_amount,
        "other_expenses": handling,
        "estimated_net_return": net_return,
        "net_price_per_quintal": net_per_qtl,
    }


def _build_dynamic_explanation(ranked: list[dict[str, Any]], date_mismatch: bool) -> str:
    if not ranked:
        return "No matching market records are available for the selected filters."

    best_net = ranked[0]
    highest_modal = max(ranked, key=lambda r: r["modal_price"])

    if len(ranked) == 1:
        msg = (
            f"Only {best_net['market_name']} ({best_net['state']}) has a matching price report "
            f"at ₹{best_net['modal_price']:,.0f}/quintal, yielding an estimated net return of "
            f"₹{best_net['estimated_net_return']:,.0f} after ₹{best_net['total_expenses']:,.0f} in user-entered expenses."
        )
    elif best_net["market_id"] != highest_modal["market_id"]:
        price_gap = highest_modal["modal_price"] - best_net["modal_price"]
        transport_gap = highest_modal["transport_cost"] - best_net["transport_cost"]
        net_advantage = best_net["estimated_net_return"] - highest_modal["estimated_net_return"]
        msg = (
            f"{highest_modal['market_name']} reports a higher modal price (₹{highest_modal['modal_price']:,.0f}/qtl, "
            f"₹{price_gap:,.0f}/qtl above {best_net['market_name']}), but its estimated transport cost is "
            f"₹{transport_gap:,.0f} higher. Under your cost assumptions, {best_net['market_name']} provides an "
            f"estimated ₹{net_advantage:,.0f} higher net return (₹{best_net['estimated_net_return']:,.0f} vs "
            f"₹{highest_modal['estimated_net_return']:,.0f})."
        )
    else:
        if len(ranked) > 1:
            runner_up = ranked[1]
            net_advantage = best_net["estimated_net_return"] - runner_up["estimated_net_return"]
            msg = (
                f"{best_net['market_name']} leads on both modal price (₹{best_net['modal_price']:,.0f}/qtl) and "
                f"estimated net return (₹{best_net['estimated_net_return']:,.0f}), outperforming second-ranked "
                f"{runner_up['market_name']} by ₹{net_advantage:,.0f} under your current cost assumptions."
            )
        else:
            msg = f"{best_net['market_name']} leads with an estimated net return of ₹{best_net['estimated_net_return']:,.0f}."

    if date_mismatch:
        msg += (
            " Caution: compared markets have different latest reporting dates, so treat this comparison "
            "as indicative rather than same-day equivalent."
        )
    return msg


def rank_markets_by_net_return(
    db: Session,
    commodity_name: str,
    variety: Optional[str] = None,
    state: Optional[str] = None,
    district: Optional[str] = None,
    origin_market_id: Optional[int] = None,
    market_ids: Optional[list[int]] = None,
    quantity_quintals: float = 25.0,
    transport_mode: str = "per_km",  # "per_km" | "fixed"
    transport_cost_per_km: float = 18.0,
    transport_cost_fixed: Optional[float] = None,
    manual_distances_km: Optional[dict[int, float]] = None,
    commission_mode: str = "percentage",  # "percentage" | "fixed"
    commission_pct: float = 2.5,
    commission_fixed: Optional[float] = None,
    other_expenses: float = 350.0,
    limit: int = 10,
) -> dict[str, Any]:
    commodity = db.scalar(select(Commodity).where(Commodity.commodity_name == commodity_name))
    if commodity is None:
        return {
            "commodity": commodity_name,
            "variety": variety or "All",
            "quantity_quintals": quantity_quintals,
            "date_mismatch_warning": False,
            "reporting_dates": [],
            "explanation": f"Commodity '{commodity_name}' was not found in the database.",
            "ranked_markets": [],
        }

    origin_market = db.get(Market, origin_market_id) if origin_market_id else None

    stmt = (
        select(DailyPrice, Market)
        .join(Market, DailyPrice.market_id == Market.id)
        .where(DailyPrice.commodity_id == commodity.id)
    )
    if variety and variety.lower() != "all":
        stmt = stmt.where(DailyPrice.variety == variety)
    if state and state.lower() != "all":
        stmt = stmt.where(Market.state == state)
    if district and district.lower() != "all":
        stmt = stmt.where(Market.district == district)
    if market_ids:
        stmt = stmt.where(Market.id.in_(market_ids[:4]))

    stmt = stmt.order_by(desc(DailyPrice.arrival_date), desc(DailyPrice.imported_at))
    rows = db.execute(stmt).all()

    # Keep latest report per market (and variety if "All" was selected)
    latest_by_market: dict[int, tuple[DailyPrice, Market]] = {}
    for dp, mkt in rows:
        if mkt.id not in latest_by_market:
            latest_by_market[mkt.id] = (dp, mkt)

    if not latest_by_market:
        return {
            "commodity": commodity.commodity_name,
            "variety": variety or "All",
            "quantity_quintals": quantity_quintals,
            "date_mismatch_warning": False,
            "reporting_dates": [],
            "explanation": "No market price records match the selected commodity and location filters.",
            "ranked_markets": [],
        }

    manual_dist_map = manual_distances_km or {}
    items: list[dict[str, Any]] = []

    for mkt_id, (dp, mkt) in latest_by_market.items():
        dist_km: Optional[float] = None
        transport_note = "User-entered fixed transport cost"

        if mkt_id in manual_dist_map:
            dist_km = max(float(manual_dist_map[mkt_id]), 0.0)
            transport_note = f"User-entered distance ({dist_km:.0f} km)"
        elif origin_market is not None:
            if origin_market.id == mkt.id:
                dist_km = 5.0
                transport_note = "Local market assumption (5 km)"
            else:
                est = estimate_road_distance_km(
                    origin_market.latitude,
                    origin_market.longitude,
                    mkt.latitude,
                    mkt.longitude,
                )
                if est is not None:
                    dist_km = est
                    transport_note = f"Estimated road distance from {origin_market.market_name} (~{est:.0f} km)"
                else:
                    dist_km = 120.0
                    transport_note = "Default 120 km fallback (coordinates unavailable for one or both markets)"
        else:
            dist_km = 35.0
            transport_note = "Default 35 km local haul assumption (select an origin market or enter exact distance)"

        use_fixed_transport = transport_mode == "fixed" and transport_cost_fixed is not None
        breakdown = compute_net_return_breakdown(
            modal_price=dp.modal_price,
            quantity_quintals=quantity_quintals,
            transport_cost_total=transport_cost_fixed if use_fixed_transport else None,
            transport_cost_per_km=transport_cost_per_km,
            distance_km=dist_km,
            commission_pct=commission_pct if commission_mode == "percentage" else None,
            commission_fixed=commission_fixed if commission_mode == "fixed" else None,
            other_expenses=other_expenses,
        )

        total_expenses = round(
            breakdown["transport_cost"] + breakdown["commission_amount"] + breakdown["other_expenses"],
            2,
        )

        items.append(
            {
                "market_id": mkt.id,
                "market_name": mkt.market_name,
                "state": mkt.state,
                "district": mkt.district,
                "commodity": commodity.commodity_name,
                "variety": dp.variety,
                "grade": dp.grade,
                "modal_price": round(dp.modal_price, 2),
                "min_price": round(dp.min_price, 2),
                "max_price": round(dp.max_price, 2),
                "gross_revenue": breakdown["gross_revenue"],
                "transport_cost": breakdown["transport_cost"],
                "transport_note": transport_note if not use_fixed_transport else "User-entered fixed transport cost",
                "distance_km": dist_km if not use_fixed_transport else None,
                "commission_amount": breakdown["commission_amount"],
                "other_expenses": breakdown["other_expenses"],
                "total_expenses": total_expenses,
                "estimated_net_return": breakdown["estimated_net_return"],
                "net_price_per_quintal": breakdown["net_price_per_quintal"],
                "reporting_date": dp.arrival_date.isoformat(),
                "source": dp.source,
                "is_demo": dp.is_demo,
            }
        )

    items.sort(key=lambda x: x["estimated_net_return"], reverse=True)
    items = items[:limit]
    for idx, item in enumerate(items, start=1):
        item["rank"] = idx

    distinct_dates = sorted({item["reporting_date"] for item in items}, reverse=True)
    date_mismatch = len(distinct_dates) > 1
    explanation = _build_dynamic_explanation(items, date_mismatch)

    return {
        "commodity": commodity.commodity_name,
        "variety": variety or "All",
        "quantity_quintals": quantity_quintals,
        "date_mismatch_warning": date_mismatch,
        "reporting_dates": distinct_dates,
        "explanation": explanation,
        "ranked_markets": items,
    }
