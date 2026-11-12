from __future__ import annotations

import math
from typing import Optional

# Verified town/city coordinates for major Indian APMC agricultural markets.
# Markets not present in this verified reference keep latitude=None, longitude=None
# so CropLedger never invents or fabricates geographical coordinates.
VERIFIED_MARKET_COORDS: dict[tuple[str, str], tuple[float, float, str]] = {
    ("Lasalgaon", "Maharashtra"): (20.1456, 74.2286, "Verified Town Reference (Lasalgaon, Nashik)"),
    ("Pimpalgaon", "Maharashtra"): (20.1674, 73.9877, "Verified Town Reference (Pimpalgaon Baswant)"),
    ("Nashik", "Maharashtra"): (19.9975, 73.7898, "Verified City Reference (Nashik APMC)"),
    ("Pune", "Maharashtra"): (18.4898, 73.8669, "Verified City Reference (Gultekdi Market Yard)"),
    ("Vashi (Mumbai)", "Maharashtra"): (19.0748, 73.0005, "Verified APMC Reference (Navi Mumbai)"),
    ("Solapur", "Maharashtra"): (17.6599, 75.9064, "Verified City Reference (Solapur APMC)"),
    ("Nagpur", "Maharashtra"): (21.1458, 79.0882, "Verified City Reference (Kalamna Market)"),
    ("Indore", "Madhya Pradesh"): (22.7196, 75.8577, "Verified City Reference (Devi Ahilyabai Holkar Mandi)"),
    ("Ujjain", "Madhya Pradesh"): (23.1765, 75.7885, "Verified City Reference (Ujjain Krishi Upaj Mandi)"),
    ("Bhopal", "Madhya Pradesh"): (23.2599, 77.4126, "Verified City Reference (Karond Mandi)"),
    ("Neemuch", "Madhya Pradesh"): (24.4764, 74.8726, "Verified Town Reference (Neemuch Mandi)"),
    ("Azadpur", "Delhi"): (28.7155, 77.1704, "Verified APMC Reference (Azadpur Mandi, Delhi)"),
    ("Karnal", "Haryana"): (29.6857, 76.9905, "Verified City Reference (Karnal Grain Market)"),
    ("Hisar", "Haryana"): (29.1492, 75.7217, "Verified City Reference (Hisar Anaj Mandi)"),
    ("Ludhiana", "Punjab"): (30.9010, 75.8573, "Verified City Reference (Ludhiana Grain Market)"),
    ("Khanna", "Punjab"): (30.7071, 76.2222, "Verified Town Reference (Khanna Mandi)"),
    ("Amritsar", "Punjab"): (31.6340, 74.8723, "Verified City Reference (Bhagtanwala Mandi)"),
    ("Jaipur", "Rajasthan"): (26.8606, 75.7641, "Verified City Reference (Muhana Mandi, Jaipur)"),
    ("Kota", "Rajasthan"): (25.1802, 75.8648, "Verified City Reference (Bhamashah Mandi, Kota)"),
    ("Alwar", "Rajasthan"): (27.5530, 76.6346, "Verified City Reference (Alwar Mandi)"),
    ("Agra", "Uttar Pradesh"): (27.1767, 78.0081, "Verified City Reference (Agra Mandi)"),
    ("Kanpur", "Uttar Pradesh"): (26.4499, 80.3319, "Verified City Reference (Naubasta Mandi)"),
    ("Lucknow", "Uttar Pradesh"): (26.8467, 80.9462, "Verified City Reference (Dubagga Mandi)"),
    ("Varanasi", "Uttar Pradesh"): (25.3176, 82.9739, "Verified City Reference (Pahadiya Mandi)"),
    ("Ahmedabad", "Gujarat"): (23.0225, 72.5714, "Verified City Reference (Vasna/Jamalpur APMC)"),
    ("Rajkot", "Gujarat"): (22.3039, 70.8022, "Verified City Reference (Rajkot APMC)"),
    ("Unjha", "Gujarat"): (23.8037, 72.3905, "Verified Town Reference (Unjha APMC)"),
    ("Mahuva", "Gujarat"): (21.0922, 71.7705, "Verified Town Reference (Mahuva APMC)"),
    ("Bengaluru (Yeshwanthpur)", "Karnataka"): (13.0250, 77.5340, "Verified APMC Reference (Yeshwanthpur APMC)"),
    ("Kolar", "Karnataka"): (13.1367, 78.1292, "Verified Town Reference (Kolar APMC)"),
    ("Hubballi", "Karnataka"): (15.3647, 75.1240, "Verified City Reference (Amargol APMC, Hubballi)"),
    ("Bowenpally (Hyderabad)", "Telangana"): (17.4697, 78.4743, "Verified APMC Reference (Bowenpally Market)"),
    ("Warangal", "Telangana"): (17.9689, 79.5941, "Verified City Reference (Enumamula Market)"),
    ("Guntur", "Andhra Pradesh"): (16.3067, 80.4365, "Verified City Reference (Guntur Mirchi Yard)"),
    ("Kurnool", "Andhra Pradesh"): (15.8281, 78.0373, "Verified City Reference (Kurnool Market Yard)"),
    ("Koyambedu (Chennai)", "Tamil Nadu"): (13.0694, 80.1948, "Verified Market Reference (Koyambedu Wholesale)"),
    ("Trichy (Gandhi Market)", "Tamil Nadu"): (10.8165, 78.6987, "Verified City Reference (Gandhi Market, Tiruchirappalli)"),
    ("Oddanchatram", "Tamil Nadu"): (10.4833, 77.7500, "Verified Town Reference (Oddanchatram Vegetable Mandi)"),
    ("Madurai (Mattuthavani)", "Tamil Nadu"): (9.9403, 78.1558, "Verified City Reference (Mattuthavani Vegetable Market)"),
    ("Tirunelveli (Gandhi Market)", "Tamil Nadu"): (8.7274, 77.6838, "Verified City Reference (Gandhi Market, Tirunelveli)"),
    ("Kavalkinaru", "Tamil Nadu"): (8.3210, 77.6030, "Verified Market Reference (Kavalkinaru Vegetable Market, Tirunelveli)"),
    ("Erode", "Tamil Nadu"): (11.3410, 77.7172, "Verified City Reference (Erode Turmeric Market)"),
    ("Patna", "Bihar"): (25.5941, 85.1376, "Verified City Reference (Bazar Samiti, Patna)"),
    ("Kolkata (Mechua)", "West Bengal"): (22.5794, 88.3563, "Verified Market Reference (Koley/Mechua Market)"),
    ("Burdwan", "West Bengal"): (23.2324, 87.8615, "Verified City Reference (Bardhaman Market)"),
}


def lookup_market_coords(market_name: str, state: str) -> tuple[Optional[float], Optional[float], Optional[str]]:
    """Return verified coordinates if the market exists in the reference table, else (None, None, None)."""
    clean_market = market_name.strip().lower()
    clean_state = state.strip().lower()
    for (ref_market, ref_state), (lat, lon, source) in VERIFIED_MARKET_COORDS.items():
        if ref_state.lower() == clean_state and (
            ref_market.lower() == clean_market
            or clean_market in ref_market.lower()
            or ref_market.lower().split(" (")[0] == clean_market
        ):
            return lat, lon, source
    return None, None, None


def estimate_road_distance_km(
    lat1: Optional[float],
    lon1: Optional[float],
    lat2: Optional[float],
    lon2: Optional[float],
    circuity_factor: float = 1.22,
) -> Optional[float]:
    """Estimate road distance from Haversine great-circle distance * road circuity factor."""
    if None in (lat1, lon1, lat2, lon2):
        return None
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)  # type: ignore[arg-type]
    dphi = math.radians(lat2 - lat1)  # type: ignore[operator]
    dlambda = math.radians(lon2 - lon1)  # type: ignore[operator]
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    km = r * c * circuity_factor
    return round(max(km, 1.0), 1)
