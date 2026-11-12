# CropLedger Data Sources & Schema Documentation

## 1. Official Data Sources

CropLedger is designed around the official Government of India **AGMARKNET** wholesale agricultural price reporting schema published via the Open Government Data (OGD) platform:

- **API Endpoint:** `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070`
- **Dataset:** *Current Daily Price of Various Commodities from Various Markets (Mandi)* — Ministry of Agriculture & Farmers Welfare / Directorate of Marketing & Inspection (AGMARKNET).
- **License / Attribution:** Open Government Data License - India (`https://data.gov.in/`).
- **Authentication:** Requires a free `data.gov.in` API key configured via `DATA_GOV_IN_API_KEY` in `.env` (never committed or exposed to frontend clients).

## 2. Sample & Demo Dataset (`sample_agmarknet_prices.csv`)

When no official API key is configured and the database is empty, CropLedger can seed `CropLedger Demo Dataset (AGMARKNET Schema)` (`is_demo=true`).

- **Generated file:** `data/sample_agmarknet_prices.csv` (regenerated via `python scripts/init_db.py --export-csv`)
- **Coverage:** 12 Indian agricultural commodities (Onion, Tomato, Potato, Wheat, Paddy (Common), Soybean, Mustard, Chana (Bengal Gram), Tur (Arhar), Cotton, Turmeric, Banana) across 27 Indian APMC markets spanning 14+ months (`>25,000` rows).
- **Honesty Safeguards:**
  - Every demo record carries `is_demo=True` and `source="CropLedger Demo Dataset (AGMARKNET Schema)"`.
  - The UI always displays a visible **Demo Mode Active** banner whenever demo records are present.
  - Two markets (`Nizamabad Yard`, `Sagar Mandi`) have intentionally unverified coordinates (`latitude=NULL, longitude=NULL`) and multi-day reporting lags so Market Atlas missing-coordinate handling and Data Quality freshness diagnostics are grounded in real records.
  - `Banana` has intentionally short history (`~10` days) so Forecast & Trends triggers its insufficient-data guard cleanly.

## 3. Normalized Record Schema

| Column | Type | Description |
| :--- | :--- | :--- |
| `state` | String | Indian State/UT name |
| `district` | String | District name |
| `market` | String | APMC / Agricultural market yard name |
| `commodity` | String | Commodity name |
| `category` | String | Produce category (Vegetables, Cereals, Oilseeds, Pulses, etc.) |
| `variety` | String | Commercial variety (e.g., Red, Hybrid, Lokwan) |
| `grade` | String | Quality grade (e.g., FAQ) |
| `arrival_date` | Date | ISO `YYYY-MM-DD` (also parses `DD/MM/YYYY`, `DD-MM-YYYY`) |
| `min_price` | Float | Minimum wholesale price normalized to **₹/Quintal** |
| `max_price` | Float | Maximum wholesale price normalized to **₹/Quintal** |
| `modal_price` | Float | Most common wholesale transaction price normalized to **₹/Quintal** |
| `arrival_quantity` | Float (nullable) | Market arrival volume (Tonnes) when supplied |
| `original_unit` | String | Original source unit before quintal normalization |
