-- CropLedger PostgreSQL Schema (PostgreSQL 15+ / 18+)
-- Normalized agricultural market intelligence schema with foreign keys,
-- unique constraints for duplicate prevention, and analytical indexes.

CREATE TABLE IF NOT EXISTS commodities (
    id SERIAL PRIMARY KEY,
    commodity_name VARCHAR(120) NOT NULL UNIQUE,
    category VARCHAR(80) NOT NULL DEFAULT 'General',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS markets (
    id SERIAL PRIMARY KEY,
    market_name VARCHAR(150) NOT NULL,
    state VARCHAR(100) NOT NULL,
    district VARCHAR(120) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location_source VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_market_state_district UNIQUE (market_name, state, district)
);

CREATE INDEX IF NOT EXISTS ix_markets_state_district ON markets (state, district);

CREATE TABLE IF NOT EXISTS daily_prices (
    id SERIAL PRIMARY KEY,
    commodity_id INTEGER NOT NULL REFERENCES commodities(id) ON DELETE CASCADE,
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    variety VARCHAR(120) NOT NULL DEFAULT 'FAQ',
    grade VARCHAR(60) NOT NULL DEFAULT 'FAQ',
    arrival_date DATE NOT NULL,
    min_price DOUBLE PRECISION NOT NULL CHECK (min_price >= 0),
    max_price DOUBLE PRECISION NOT NULL CHECK (max_price >= 0),
    modal_price DOUBLE PRECISION NOT NULL CHECK (modal_price >= 0),
    arrival_quantity DOUBLE PRECISION,
    original_unit VARCHAR(50) NOT NULL DEFAULT 'INR/Quintal',
    source VARCHAR(160) NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_price_record UNIQUE (commodity_id, market_id, variety, grade, arrival_date, source)
);

CREATE INDEX IF NOT EXISTS ix_daily_prices_date ON daily_prices (arrival_date DESC);
CREATE INDEX IF NOT EXISTS ix_daily_prices_commodity_date ON daily_prices (commodity_id, arrival_date DESC);
CREATE INDEX IF NOT EXISTS ix_daily_prices_market_date ON daily_prices (market_id, arrival_date DESC);

CREATE TABLE IF NOT EXISTS arrivals (
    id SERIAL PRIMARY KEY,
    commodity_id INTEGER NOT NULL REFERENCES commodities(id) ON DELETE CASCADE,
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    arrival_date DATE NOT NULL,
    arrival_quantity DOUBLE PRECISION NOT NULL CHECK (arrival_quantity >= 0),
    unit VARCHAR(40) NOT NULL DEFAULT 'Tonnes',
    source VARCHAR(160) NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_arrival_record UNIQUE (commodity_id, market_id, arrival_date, source)
);

CREATE TABLE IF NOT EXISTS user_watchlist (
    id SERIAL PRIMARY KEY,
    local_profile_id VARCHAR(80) NOT NULL DEFAULT 'default',
    commodity_id INTEGER NOT NULL REFERENCES commodities(id) ON DELETE CASCADE,
    market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_watchlist_entry UNIQUE (local_profile_id, commodity_id, market_id)
);

CREATE TABLE IF NOT EXISTS price_alerts (
    id SERIAL PRIMARY KEY,
    local_profile_id VARCHAR(80) NOT NULL DEFAULT 'default',
    commodity_id INTEGER NOT NULL REFERENCES commodities(id) ON DELETE CASCADE,
    market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,
    condition VARCHAR(40) NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_events (
    id SERIAL PRIMARY KEY,
    alert_id INTEGER NOT NULL REFERENCES price_alerts(id) ON DELETE CASCADE,
    commodity_id INTEGER NOT NULL REFERENCES commodities(id) ON DELETE CASCADE,
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    triggered_price DOUBLE PRECISION NOT NULL,
    reporting_date DATE NOT NULL,
    trigger_reason TEXT NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_alert_event_day UNIQUE (alert_id, market_id, reporting_date)
);

CREATE TABLE IF NOT EXISTS data_refresh_logs (
    id SERIAL PRIMARY KEY,
    source VARCHAR(160) NOT NULL,
    source_reporting_date DATE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL,
    imported_records INTEGER NOT NULL DEFAULT 0,
    duplicate_records INTEGER NOT NULL DEFAULT 0,
    rejected_records INTEGER NOT NULL DEFAULT 0,
    missing_field_count INTEGER NOT NULL DEFAULT 0,
    invalid_price_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS validation_issues (
    id SERIAL PRIMARY KEY,
    refresh_log_id INTEGER NOT NULL REFERENCES data_refresh_logs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    source VARCHAR(160) NOT NULL,
    issue_type VARCHAR(80) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    field_name VARCHAR(80),
    raw_record_json TEXT,
    explanation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecast_results (
    id SERIAL PRIMARY KEY,
    commodity_id INTEGER NOT NULL REFERENCES commodities(id) ON DELETE CASCADE,
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    variety VARCHAR(120) NOT NULL DEFAULT 'All',
    model_name VARCHAR(100) NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_price DOUBLE PRECISION NOT NULL,
    lower_bound DOUBLE PRECISION,
    upper_bound DOUBLE PRECISION,
    mae DOUBLE PRECISION,
    rmse DOUBLE PRECISION,
    baseline_mae DOUBLE PRECISION,
    baseline_rmse DOUBLE PRECISION,
    training_start DATE,
    training_end DATE,
    model_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
    local_profile_id VARCHAR(80) PRIMARY KEY,
    preferred_state VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',
    preferred_district VARCHAR(120) NOT NULL DEFAULT 'Nashik',
    preferred_crops_json TEXT NOT NULL DEFAULT '["Onion","Tomato","Wheat","Soybean"]',
    currency_display VARCHAR(20) NOT NULL DEFAULT 'INR',
    price_unit VARCHAR(30) NOT NULL DEFAULT 'Quintal',
    default_quantity_quintals DOUBLE PRECISION NOT NULL DEFAULT 25.0,
    transport_cost_per_km DOUBLE PRECISION NOT NULL DEFAULT 18.0,
    default_commission_pct DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    default_handling_cost DOUBLE PRECISION NOT NULL DEFAULT 350.0,
    alert_in_app BOOLEAN NOT NULL DEFAULT TRUE,
    theme_preference VARCHAR(20) NOT NULL DEFAULT 'light',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
