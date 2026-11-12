# Project Overview — CropLedger

## Problem Statement

Indian farmers, Farmer Producer Organizations (FPOs), and small agricultural traders often compare markets solely by **headline modal price**. A distant terminal market may quote ₹300/quintal higher than a local APMC, yet once transport cost per kilometre, mandi commission, and loading/handling charges are deducted, selling at the distant market can yield a **lower net return**. Furthermore, agricultural price feeds frequently suffer from missing reporting days, mixed units (kg vs quintal vs tonne), stale market reports, and overconfident price predictions.

## Objectives

1. **Answer five practical questions with evidence:**
   - What is the latest reported wholesale price for my crop?
   - Which agricultural market offers a higher reported modal price?
   - Which market provides the highest **estimated net return** after my transport, commission, and handling expenses?
   - How have prices evolved over recent days, weeks, months, and seasons?
   - What does historical market evidence suggest about current selling conditions without fabricating certainty?
2. **Enforce strict data honesty:** Never invent coordinates, never interpolate missing reporting days silently, never mix unlabelled demo data with official records, and never hide validation anomalies.

## Target Users

- Farmers & FPOs evaluating nearby vs terminal APMC yards
- Agricultural traders & commission agents monitoring regional spreads
- AgriTech students, analysts, and researchers studying price discovery

## MVP Scope & Boundaries

- **Included:** Full-stack React/TypeScript + FastAPI + SQLAlchemy (PostgreSQL-ready with SQLite zero-config fallback) application covering all 10 analytical modules, CSV import, `data.gov.in` AGMARKNET connector, PDF/CSV report exports, chronological forecasting, and in-app alerts.
- **Out of Scope for MVP:** Multi-tenant user authentication, live SMS/WhatsApp push gateways, and paid satellite/weather feeds.
