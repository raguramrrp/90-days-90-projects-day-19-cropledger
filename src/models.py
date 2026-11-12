from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Commodity(Base):
    __tablename__ = "commodities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    commodity_name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, default="General")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    daily_prices: Mapped[list["DailyPrice"]] = relationship(
        back_populates="commodity", cascade="all, delete-orphan"
    )


class Market(Base):
    __tablename__ = "markets"
    __table_args__ = (
        UniqueConstraint("market_name", "state", "district", name="uq_market_state_district"),
        Index("ix_markets_state_district", "state", "district"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    market_name: Mapped[str] = mapped_column(String(150), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    district: Mapped[str] = mapped_column(String(120), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_source: Mapped[str | None] = mapped_column(String(180), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    daily_prices: Mapped[list["DailyPrice"]] = relationship(
        back_populates="market", cascade="all, delete-orphan"
    )


class DailyPrice(Base):
    __tablename__ = "daily_prices"
    __table_args__ = (
        UniqueConstraint(
            "commodity_id",
            "market_id",
            "variety",
            "grade",
            "arrival_date",
            "source",
            name="uq_daily_price_record",
        ),
        Index("ix_daily_prices_date", "arrival_date"),
        Index("ix_daily_prices_commodity_date", "commodity_id", "arrival_date"),
        Index("ix_daily_prices_market_date", "market_id", "arrival_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    commodity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("commodities.id", ondelete="CASCADE"), nullable=False
    )
    market_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"), nullable=False
    )
    variety: Mapped[str] = mapped_column(String(120), nullable=False, default="FAQ")
    grade: Mapped[str] = mapped_column(String(60), nullable=False, default="FAQ")
    arrival_date: Mapped[date] = mapped_column(Date, nullable=False)
    min_price: Mapped[float] = mapped_column(Float, nullable=False)
    max_price: Mapped[float] = mapped_column(Float, nullable=False)
    modal_price: Mapped[float] = mapped_column(Float, nullable=False)
    arrival_quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    original_unit: Mapped[str] = mapped_column(String(50), nullable=False, default="INR/Quintal")
    source: Mapped[str] = mapped_column(String(160), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    commodity: Mapped["Commodity"] = relationship(back_populates="daily_prices")
    market: Mapped["Market"] = relationship(back_populates="daily_prices")


class Arrival(Base):
    __tablename__ = "arrivals"
    __table_args__ = (
        UniqueConstraint(
            "commodity_id",
            "market_id",
            "arrival_date",
            "source",
            name="uq_arrival_record",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    commodity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("commodities.id", ondelete="CASCADE"), nullable=False
    )
    market_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"), nullable=False
    )
    arrival_date: Mapped[date] = mapped_column(Date, nullable=False)
    arrival_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(40), nullable=False, default="Tonnes")
    source: Mapped[str] = mapped_column(String(160), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class UserWatchlist(Base):
    __tablename__ = "user_watchlist"
    __table_args__ = (
        UniqueConstraint(
            "local_profile_id", "commodity_id", "market_id", name="uq_watchlist_entry"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    local_profile_id: Mapped[str] = mapped_column(String(80), nullable=False, default="default")
    commodity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("commodities.id", ondelete="CASCADE"), nullable=False
    )
    market_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    commodity: Mapped["Commodity"] = relationship()
    market: Mapped["Market | None"] = relationship()


class PriceAlert(Base):
    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    local_profile_id: Mapped[str] = mapped_column(String(80), nullable=False, default="default")
    commodity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("commodities.id", ondelete="CASCADE"), nullable=False
    )
    market_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"), nullable=True
    )
    condition: Mapped[str] = mapped_column(String(40), nullable=False)
    threshold_value: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    commodity: Mapped["Commodity"] = relationship()
    market: Mapped["Market | None"] = relationship()


class AlertEvent(Base):
    __tablename__ = "alert_events"
    __table_args__ = (
        UniqueConstraint("alert_id", "market_id", "reporting_date", name="uq_alert_event_day"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("price_alerts.id", ondelete="CASCADE"), nullable=False
    )
    commodity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("commodities.id", ondelete="CASCADE"), nullable=False
    )
    market_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"), nullable=False
    )
    triggered_price: Mapped[float] = mapped_column(Float, nullable=False)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    trigger_reason: Mapped[str] = mapped_column(Text, nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class DataRefreshLog(Base):
    __tablename__ = "data_refresh_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(160), nullable=False)
    source_reporting_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    imported_records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    missing_field_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    invalid_price_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class ValidationIssue(Base):
    __tablename__ = "validation_issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    refresh_log_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_refresh_logs.id", ondelete="CASCADE"), nullable=False
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(160), nullable=False)
    issue_type: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="warning")
    field_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    raw_record_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ForecastResult(Base):
    __tablename__ = "forecast_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    commodity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("commodities.id", ondelete="CASCADE"), nullable=False
    )
    market_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("markets.id", ondelete="CASCADE"), nullable=False
    )
    variety: Mapped[str] = mapped_column(String(120), nullable=False, default="All")
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    forecast_date: Mapped[date] = mapped_column(Date, nullable=False)
    predicted_price: Mapped[float] = mapped_column(Float, nullable=False)
    lower_bound: Mapped[float | None] = mapped_column(Float, nullable=True)
    upper_bound: Mapped[float | None] = mapped_column(Float, nullable=True)
    mae: Mapped[float | None] = mapped_column(Float, nullable=True)
    rmse: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_mae: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_rmse: Mapped[float | None] = mapped_column(Float, nullable=True)
    training_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    training_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    model_version: Mapped[str] = mapped_column(String(40), nullable=False, default="1.0.0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    local_profile_id: Mapped[str] = mapped_column(String(80), primary_key=True, default="default")
    preferred_state: Mapped[str] = mapped_column(String(100), nullable=False, default="Maharashtra")
    preferred_district: Mapped[str] = mapped_column(String(120), nullable=False, default="Nashik")
    preferred_crops_json: Mapped[str] = mapped_column(
        Text, nullable=False, default='["Onion","Tomato","Wheat","Soybean"]'
    )
    currency_display: Mapped[str] = mapped_column(String(20), nullable=False, default="INR")
    price_unit: Mapped[str] = mapped_column(String(30), nullable=False, default="Quintal")
    default_quantity_quintals: Mapped[float] = mapped_column(Float, nullable=False, default=25.0)
    transport_cost_per_km: Mapped[float] = mapped_column(Float, nullable=False, default=18.0)
    default_commission_pct: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    default_handling_cost: Mapped[float] = mapped_column(Float, nullable=False, default=350.0)
    alert_in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    theme_preference: Mapped[str] = mapped_column(String(20), nullable=False, default="light")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
