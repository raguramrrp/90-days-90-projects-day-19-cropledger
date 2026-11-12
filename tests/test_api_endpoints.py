from __future__ import annotations

from src.models import Commodity, Market


def test_core_endpoints_end_to_end(seeded_client):
    health = seeded_client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["data"]["data_mode"] == "demo"

    overview = seeded_client.get("/api/overview?history_days=30&commodity=Onion")
    assert overview.status_code == 200
    ov_json = overview.json()
    assert ov_json["empty"] is False
    assert ov_json["summary"]["markets_reporting"] > 0
    assert ov_json["summary"]["commodities_available"] > 1
    assert ov_json["chart_commodity"] == "Onion"
    assert len(ov_json["price_history"]) > 0
    assert len(ov_json["vegetable_per_kg"]) > 0

    tn_ov = seeded_client.get("/api/overview?state=Tamil%20Nadu").json()
    tn_markets = {row["market"] for row in tn_ov["vegetable_per_kg"]}
    assert {"Kavalkinaru", "Tirunelveli (Gandhi Market)", "Trichy (Gandhi Market)"}.issubset(tn_markets)
    first_veg = tn_ov["vegetable_per_kg"][0]
    assert first_veg["modal_price_per_kg"] == round(first_veg["modal_price_per_quintal"] / 100.0, 2)

    meta = seeded_client.get("/api/meta/filters").json()
    assert len(meta["commodities"]) >= 12
    assert len(meta["markets"]) >= 25

    advisor = seeded_client.post(
        "/api/price-advisor/calculate",
        json={
            "commodity": "Onion",
            "quantity_quintals": 25,
            "transport_mode": "per_km",
            "transport_cost_per_km": 18,
            "commission_mode": "percentage",
            "commission_pct": 2.5,
            "other_expenses": 350,
        },
    )
    assert advisor.status_code == 200
    adv_json = advisor.json()
    assert len(adv_json["ranked_markets"]) > 1
    assert adv_json["ranked_markets"][0]["estimated_net_return"] >= adv_json["ranked_markets"][1]["estimated_net_return"]

    atlas = seeded_client.get("/api/atlas/markets?commodity=Cotton")
    assert atlas.status_code == 200
    assert atlas.json()["mapped_count"] >= 3
    assert atlas.json()["unmapped_count"] >= 1  # Nizamabad Yard has no invented coords

    atlas_summary = seeded_client.get("/api/atlas/summary?commodity=Onion")
    assert atlas_summary.status_code == 200
    assert atlas_summary.json()["price_spread"] >= 0

    crop_intel = seeded_client.get("/api/crops/Onion")
    assert crop_intel.status_code == 200
    assert crop_intel.json()["seasonality"]["years_covered"] >= 1.0

    # Market comparison
    mkt_ids = ",".join(str(m["id"]) for m in meta["markets"][:3])
    comp = seeded_client.get(f"/api/market-comparison?commodity=Wheat&market_ids={mkt_ids}")
    assert comp.status_code == 200

    # Reports + CSV + PDF exports
    reports = seeded_client.get("/api/reports?commodity=Onion&page=1&page_size=10")
    assert reports.status_code == 200
    assert len(reports.json()["records"]) == 10

    csv_exp = seeded_client.get("/api/reports/export?format=csv&commodity=Onion")
    assert csv_exp.status_code == 200
    assert "text/csv" in csv_exp.headers["content-type"]

    pdf_exp = seeded_client.get("/api/reports/export?format=pdf&commodity=Onion")
    assert pdf_exp.status_code == 200
    assert "application/pdf" in pdf_exp.headers["content-type"]
    assert pdf_exp.content.startswith(b"%PDF")


def test_forecast_watchlist_alerts_settings_and_data_quality_endpoints(seeded_client):
    meta = seeded_client.get("/api/meta/filters").json()
    lasalgaon = next(m for m in meta["markets"] if m["name"] == "Lasalgaon")
    chennai = next(m for m in meta["markets"] if m["name"] == "Koyambedu (Chennai)")

    # Sufficient history forecast
    fc_ok = seeded_client.get(
        f"/api/forecast?commodity=Onion&market_id={lasalgaon['id']}&model_type=gradient_boosting"
    )
    assert fc_ok.status_code == 200
    assert fc_ok.json()["sufficient_data"] is True
    assert len(fc_ok.json()["forecast"]) == 7

    # Insufficient history forecast (Banana intentionally seeded with ~10 days)
    fc_short = seeded_client.get(
        f"/api/forecast?commodity=Banana&market_id={chennai['id']}&model_type=moving_average"
    )
    assert fc_short.status_code == 200
    assert fc_short.json()["sufficient_data"] is False
    assert fc_short.json()["message"] == "Insufficient historical data to generate a reliable forecast."

    # Watchlist create & delete
    wheat = next(c for c in meta["commodities"] if c["name"] == "Wheat")
    wl_add = seeded_client.post("/api/watchlist", json={"commodity_id": wheat["id"], "market_id": None})
    assert wl_add.status_code == 200
    wl_id = wl_add.json()["id"]
    wl_del = seeded_client.delete(f"/api/watchlist/{wl_id}")
    assert wl_del.status_code == 200

    # Alerts create, toggle, delete
    al_add = seeded_client.post(
        "/api/alerts",
        json={
            "commodity_id": wheat["id"],
            "market_id": None,
            "condition": "price_above",
            "threshold_value": 2000,
        },
    )
    assert al_add.status_code == 200
    al_id = al_add.json()["id"]
    assert seeded_client.patch(f"/api/alerts/{al_id}", json={"is_active": False}).status_code == 200
    assert seeded_client.delete(f"/api/alerts/{al_id}").status_code == 200

    # Data quality & CSV import
    dq = seeded_client.get("/api/data-quality")
    assert dq.status_code == 200
    assert len(dq.json()["stale_or_delayed_markets"]) >= 2

    csv_payload = (
        "state,district,market,commodity,variety,grade,arrival_date,min_price,max_price,modal_price\n"
        "Maharashtra,Pune,Pune,Onion,Red,FAQ,12/11/2026,2200,2600,2450\n"
    ).encode("utf-8")
    imp = seeded_client.post(
        "/api/data/import",
        files={"file": ("official_sample.csv", csv_payload, "text/csv")},
    )
    assert imp.status_code == 200
    assert imp.json()["imported_records"] == 1

    # Settings persistence
    put_res = seeded_client.put(
        "/api/settings",
        json={
            "preferred_state": "Karnataka",
            "preferred_district": "Kolar",
            "preferred_crops": ["Tomato", "Onion"],
            "currency_display": "INR",
            "price_unit": "Quintal",
            "default_quantity_quintals": 40,
            "transport_cost_per_km": 22,
            "default_commission_pct": 2.0,
            "default_handling_cost": 400,
            "alert_in_app": True,
            "theme_preference": "compact",
        },
    )
    assert put_res.status_code == 200
    get_res = seeded_client.get("/api/settings")
    assert get_res.json()["preferred_state"] == "Karnataka"
    assert get_res.json()["default_quantity_quintals"] == 40
