export type ModuleRoute =
  | "/overview"
  | "/price-advisor"
  | "/market-atlas"
  | "/crops"
  | "/market-comparison"
  | "/reports"
  | "/forecast"
  | "/watchlist"
  | "/data-quality"
  | "/settings";

export interface SourceStatus {
  total_records: number;
  demo_records: number;
  official_records: number;
  data_mode: "empty" | "demo" | "official" | "mixed";
  latest_reporting_date: string | null;
  last_refreshed_at: string | null;
  last_refresh_source: string | null;
  api_key_configured: boolean;
}

export interface CommodityOption {
  id: number;
  name: string;
  category: string;
  description: string | null;
}

export interface MarketOption {
  id: number;
  name: string;
  state: string;
  district: string;
  has_coords: boolean;
}

export interface FilterMetaResponse {
  commodities: CommodityOption[];
  varieties_by_commodity: Record<string, string[]>;
  states: string[];
  districts_by_state: Record<string, string[]>;
  markets: MarketOption[];
  available_dates: string[];
}

export interface OverviewResponse {
  empty: boolean;
  source_status: SourceStatus;
  chart_commodity?: string;
  summary: {
    selected_date: string | null;
    markets_reporting: number;
    commodities_available: number;
    highest_modal_price: {
      price: number;
      commodity: string;
      market: string;
      reporting_date: string;
    } | null;
    lowest_modal_price: {
      price: number;
      commodity: string;
      market: string;
      reporting_date: string;
    } | null;
    followed_crops_updated: number;
    followed_crops_total?: number;
    last_refreshed: string | null;
  };
  daily_briefing: {
    price_increases: Array<{
      commodity: string;
      latest_avg_modal: number;
      previous_avg_modal: number;
      movement_pct: number;
      reporting_date: string;
    }>;
    price_decreases: Array<{
      commodity: string;
      latest_avg_modal: number;
      previous_avg_modal: number;
      movement_pct: number;
      reporting_date: string;
    }>;
    highest_markets: Array<{
      commodity: string;
      market: string;
      state: string;
      modal_price: number;
      reporting_date: string;
    }>;
    wide_spread_markets: Array<{
      commodity: string;
      market: string;
      state: string;
      min_price: number;
      max_price: number;
      spread: number;
      reporting_date: string;
    }>;
    recently_updated_reports: Array<{
      commodity: string;
      market: string;
      state: string;
      modal_price: number;
      reporting_date: string;
      source: string;
      is_demo: boolean;
    }>;
  };
  followed_crops: Array<{
    watchlist_id: number;
    commodity: string;
    market: string;
    state: string;
    latest_modal_price: number;
    previous_modal_price: number | null;
    movement_pct: number | null;
    reporting_date: string;
    freshness: string;
  }>;
  price_history: Array<{
    date: string;
    modal_price: number;
    min_price: number;
    max_price: number;
    report_count: number;
  }>;
  vegetable_per_kg?: Array<{
    commodity: string;
    variety: string;
    market: string;
    district: string;
    state: string;
    min_price_per_kg: number;
    max_price_per_kg: number;
    modal_price_per_kg: number;
    modal_price_per_quintal: number;
    reporting_date: string;
  }>;
}

export interface RankedMarketResult {
  rank: number;
  market_id: number;
  market_name: string;
  state: string;
  district: string;
  commodity: string;
  variety: string;
  grade: string;
  modal_price: number;
  min_price: number;
  max_price: number;
  gross_revenue: number;
  transport_cost: number;
  transport_note: string;
  distance_km: number | null;
  commission_amount: number;
  other_expenses: number;
  total_expenses: number;
  estimated_net_return: number;
  net_price_per_quintal: number;
  reporting_date: string;
  source: string;
  is_demo: boolean;
}

export interface PriceAdvisorResponse {
  commodity: string;
  variety: string;
  quantity_quintals: number;
  date_mismatch_warning: boolean;
  reporting_dates: string[];
  explanation: string;
  ranked_markets: RankedMarketResult[];
}

export interface AtlasMarketPoint {
  market_id: number;
  market_name: string;
  state: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  location_source: string | null;
  commodity: string;
  latest_modal_price: number;
  min_price: number;
  max_price: number;
  reporting_date: string;
  freshness: string;
  record_count: number;
  is_demo: boolean;
}

export interface AtlasMarketsResponse {
  mapped_count: number;
  unmapped_count: number;
  mapped_markets: AtlasMarketPoint[];
  unmapped_markets: AtlasMarketPoint[];
  attribution: string;
}

export interface AtlasSummaryResponse {
  commodity: string;
  empty: boolean;
  highest_market: {
    market_id: number;
    market_name: string;
    state: string;
    modal_price: number;
    reporting_date: string;
  } | null;
  lowest_market: {
    market_id: number;
    market_name: string;
    state: string;
    modal_price: number;
    reporting_date: string;
  } | null;
  national_avg_modal: number | null;
  price_spread: number | null;
  state_comparison: Array<{
    state: string;
    avg_modal_price: number;
    min_modal_price: number;
    max_modal_price: number;
    market_count: number;
  }>;
  top_10_markets: Array<{
    market_id: number;
    market_name: string;
    state: string;
    district: string;
    modal_price: number;
    min_price: number;
    max_price: number;
    reporting_date: string;
  }>;
}

export interface CropIntelligenceResponse {
  found: boolean;
  empty: boolean;
  commodity: string;
  category: string;
  description: string | null;
  variety: string;
  is_demo_included: boolean;
  message?: string;
  summary: {
    latest_reporting_date: string;
    latest_modal_price: number;
    previous_modal_price: number | null;
    latest_min_price: number;
    latest_max_price: number;
    historical_avg_price: number;
    highest_recorded_price: number;
    lowest_recorded_price: number;
    volatility_cv_pct: number;
    volatility_std: number;
    recent_change_pct: number;
    weekly_change_pct: number | null;
    reporting_market_coverage: number;
    total_observations: number;
  };
  daily_trend: Array<{
    date: string;
    modal_price: number;
    min_price: number;
    max_price: number;
    arrival_quantity: number | null;
  }>;
  weekly_trend: Array<{
    period: string;
    modal_price: number;
    min_price: number;
    max_price: number;
  }>;
  monthly_trend: Array<{
    period: string;
    label: string;
    modal_price: number;
    min_price: number;
    max_price: number;
  }>;
  seasonality: {
    years_covered: number;
    calendar_years: number[];
    note: string;
    seasonal_high: { month: string; avg_price: number } | null;
    seasonal_low: { month: string; avg_price: number } | null;
    months: Array<{
      month_num: number;
      month: string;
      avg_price: number;
      min_price: number;
      max_price: number;
      observations: number;
    }>;
  };
  market_comparison: Array<{
    market_id: number;
    market_name: string;
    state: string;
    district: string;
    modal_price: number;
    min_price: number;
    max_price: number;
    reporting_date: string;
    arrival_quantity: number | null;
  }>;
  arrival_analysis: {
    available: boolean;
    pearson_correlation: number | null;
    disclaimer: string;
    series: Array<{
      date: string;
      arrival_quantity: number;
      modal_price: number;
    }>;
  };
}

export interface MarketComparisonResponse {
  commodity: string;
  variety: string;
  empty: boolean;
  date_mismatch_warning: boolean;
  reporting_dates: string[];
  markets: Array<{
    market_id: number;
    market_name: string;
    state: string;
    district: string;
    variety: string;
    reporting_date: string;
    modal_price: number;
    min_price: number;
    max_price: number;
    historical_avg: number;
    movement_pct: number | null;
    arrival_quantity: number | null;
    estimated_distance_km: number;
    estimated_transport_cost: number;
    estimated_commission: number;
    estimated_net_return: number;
    price_diff_vs_lowest_pct: number;
  }>;
  historical_series: Array<Record<string, string | number>>;
  summary: {
    highest_reported_price_market: {
      market_name: string;
      modal_price: number;
      reporting_date: string;
    };
    best_net_return_market: {
      market_name: string;
      estimated_net_return: number;
      reporting_date: string;
    };
    outcomes_differ: boolean;
  } | null;
}

export interface PriceReportRecord {
  id: number;
  arrival_date: string;
  state: string;
  district: string;
  market: string;
  commodity: string;
  category: string;
  variety: string;
  grade: string;
  min_price: number;
  max_price: number;
  modal_price: number;
  arrival_quantity: number | null;
  original_unit: string;
  source: string;
  is_demo: boolean;
}

export interface ReportsResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  records: PriceReportRecord[];
}

export interface ForecastResponse {
  sufficient_data: boolean;
  commodity?: string;
  market?: string;
  state?: string;
  variety?: string;
  message?: string;
  minimum_required_days?: number;
  available_days?: number;
  model_key?: string;
  model_name?: string;
  horizon_days?: number;
  training_period?: {
    start: string;
    end: string;
    total_observations: number;
    train_observations: number;
    test_observations: number;
  };
  evaluation?: {
    mae: number;
    rmse: number;
    baseline_model: string;
    baseline_mae: number;
    baseline_rmse: number;
    beats_baseline_mae: boolean;
    note: string;
  };
  historical: Array<{ date: string; actual_price: number }>;
  forecast: Array<{
    date: string;
    predicted_price: number;
    lower_bound: number;
    upper_bound: number;
  }>;
  selling_window_observations: string[];
}

export interface WatchlistItem {
  id: number;
  commodity_id: number;
  commodity: string;
  market_id: number | null;
  market: string;
  state: string | null;
  latest_modal_price: number | null;
  previous_modal_price: number | null;
  movement_pct: number | null;
  reporting_date: string | null;
  freshness: string;
}

export interface AlertsResponse {
  rules: Array<{
    id: number;
    commodity_id: number;
    commodity: string;
    market_id: number | null;
    market: string;
    condition: string;
    threshold_value: number;
    is_active: boolean;
    created_at: string;
  }>;
  events: Array<{
    id: number;
    alert_id: number;
    condition: string;
    threshold_value: number;
    commodity: string;
    market: string;
    state: string;
    triggered_price: number;
    reporting_date: string;
    trigger_reason: string;
    acknowledged: boolean;
  }>;
  delivery_note: string;
}

export interface DataQualityResponse {
  source_status: SourceStatus;
  freshness_rules: Array<{ label: string; rule: string; max_age_days: number | null }>;
  freshness_summary: Record<string, number>;
  total_markets: number;
  stale_or_delayed_markets: Array<{
    market_id: number;
    market_name: string;
    state: string;
    district: string;
    latest_reporting_date: string | null;
    lag_days: number | null;
    freshness: string;
    record_count: number;
    coordinates_verified: boolean;
  }>;
  market_coverage: Array<{
    market_id: number;
    market_name: string;
    state: string;
    district: string;
    latest_reporting_date: string | null;
    lag_days: number | null;
    freshness: string;
    record_count: number;
    coordinates_verified: boolean;
  }>;
  refresh_logs: Array<{
    id: number;
    source: string;
    source_reporting_date: string | null;
    started_at: string | null;
    completed_at: string | null;
    status: string;
    imported_records: number;
    duplicate_records: number;
    rejected_records: number;
    missing_field_count: number;
    invalid_price_count: number;
    error_message: string | null;
  }>;
  validation_issues: Array<{
    id: number;
    refresh_log_id: number;
    row_number: number;
    source: string;
    issue_type: string;
    severity: string;
    field_name: string | null;
    explanation: string;
    created_at: string | null;
  }>;
}

export interface UserSettings {
  preferred_state: string;
  preferred_district: string;
  preferred_crops: string[];
  currency_display: "INR";
  price_unit: "Quintal" | "Kg" | "Tonne";
  default_quantity_quintals: number;
  transport_cost_per_km: number;
  default_commission_pct: number;
  default_handling_cost: number;
  alert_in_app: boolean;
  theme_preference: "light" | "compact";
  source_status?: SourceStatus;
}
