# CropLedger — 90-Second Portfolio Demo Script

**Target Duration:** 60–120 seconds  
**Goal:** Demonstrate how CropLedger helps Indian farmers, FPOs, and agricultural analysts move beyond headline market prices to evidence-based net-return selling decisions.

---

## Step-by-Step Walkthrough

1. **Market Overview (`/overview`) — 15s**
   - Point out the clean agricultural SaaS workspace, honest `Demo Mode` banner (distinguishing sample records from official `data.gov.in` feeds), reporting-date selector, followed crops table, and historical price chart (`7D / 30D / 90D / 1Y`).

2. **Net-Return Price Advisor (`/price-advisor`) — 25s**
   - Select **Onion**, set origin market to **Lasalgaon**, set quantity to **25 quintals**, and set transport rate to **₹30/km**.
   - Show how **Vashi (Mumbai)** or **Azadpur** may report a higher headline modal price, yet **Lasalgaon** or **Pune** ranks #1 on **Estimated Net Return** once transport distance, mandi commission, and handling expenses are deducted.
   - Read the dynamically generated plain-English recommendation explaining the exact rupee trade-off.

3. **Market Atlas (`/market-atlas`) — 15s**
   - Open the interactive Leaflet India APMC map with clustered price pins, click a market marker to inspect min/max/modal quotes and freshness status, and note how unmapped markets are explicitly listed rather than plotted at fabricated coordinates.

4. **Crop Intelligence & Market Comparison (`/crops`, `/market-comparison`) — 20s**
   - Switch between **Daily / Weekly / Monthly / Seasonality** views, inspect arrival-volume correlation (noting correlation != causation), and compare up to 4 markets side by side.

5. **Forecast & Data Quality (`/forecast`, `/data-quality`) — 20s**
   - Show chronological train/test evaluation (MAE/RMSE vs 7-day moving average baseline) and demonstrate how sparse crops like **Banana** display `"Insufficient historical data to generate a reliable forecast."` instead of fabricating output.
   - Finish in **Data Quality** showing validation rule diagnostics, CSV import, and `data.gov.in` AGMARKNET sync fallback.
