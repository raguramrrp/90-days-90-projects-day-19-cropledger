from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class PriceAdvisorRequest(BaseModel):
    commodity: str = Field(..., min_length=1)
    variety: Optional[str] = "All"
    state: Optional[str] = "All"
    district: Optional[str] = "All"
    origin_market_id: Optional[int] = None
    market_ids: Optional[list[int]] = Field(default=None, max_length=4)
    quantity_quintals: float = Field(default=25.0, gt=0, le=50000)
    transport_mode: Literal["per_km", "fixed"] = "per_km"
    transport_cost_per_km: float = Field(default=18.0, ge=0, le=5000)
    transport_cost_fixed: Optional[float] = Field(default=None, ge=0)
    manual_distances_km: Optional[dict[int, float]] = None
    commission_mode: Literal["percentage", "fixed"] = "percentage"
    commission_pct: float = Field(default=2.5, ge=0, le=50)
    commission_fixed: Optional[float] = Field(default=None, ge=0)
    other_expenses: float = Field(default=350.0, ge=0)
    limit: int = Field(default=10, ge=1, le=25)


class WatchlistCreateRequest(BaseModel):
    commodity_id: int
    market_id: Optional[int] = None


class PriceAlertCreateRequest(BaseModel):
    commodity_id: int
    market_id: Optional[int] = None
    condition: Literal[
        "price_above",
        "price_below",
        "pct_increase",
        "pct_decrease",
        "significant_movement",
    ]
    threshold_value: float = Field(..., gt=0)


class PriceAlertToggleRequest(BaseModel):
    is_active: bool


class UserSettingsUpdateRequest(BaseModel):
    preferred_state: str = Field(..., min_length=1)
    preferred_district: str = Field(..., min_length=1)
    preferred_crops: list[str] = Field(default_factory=list)
    currency_display: Literal["INR"] = "INR"
    price_unit: Literal["Quintal", "Kg", "Tonne"] = "Quintal"
    default_quantity_quintals: float = Field(..., gt=0, le=50000)
    transport_cost_per_km: float = Field(..., ge=0, le=5000)
    default_commission_pct: float = Field(..., ge=0, le=50)
    default_handling_cost: float = Field(..., ge=0)
    alert_in_app: bool = True
    theme_preference: Literal["light", "compact"] = "light"
