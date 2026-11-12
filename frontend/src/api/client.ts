import type {
  AlertsResponse,
  AtlasMarketsResponse,
  AtlasSummaryResponse,
  CropIntelligenceResponse,
  DataQualityResponse,
  FilterMetaResponse,
  ForecastResponse,
  MarketComparisonResponse,
  OverviewResponse,
  PriceAdvisorResponse,
  ReportsResponse,
  UserSettings,
  WatchlistItem,
} from "../types/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errData = await res.json();
      if (errData?.detail) message = errData.detail;
    } catch {
      // ignore non-json error bodies
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  getFilters: () => request<FilterMetaResponse>("/api/meta/filters"),

  getOverview: (params: {
    reporting_date?: string;
    state?: string;
    commodity?: string;
    history_days?: number;
  }) => request<OverviewResponse>(`/api/overview${buildQuery(params)}`),

  calculatePriceAdvisor: (payload: {
    commodity: string;
    variety?: string;
    state?: string;
    district?: string;
    origin_market_id?: number | null;
    market_ids?: number[];
    quantity_quintals: number;
    transport_mode: "per_km" | "fixed";
    transport_cost_per_km: number;
    transport_cost_fixed?: number | null;
    manual_distances_km?: Record<number, number>;
    commission_mode: "percentage" | "fixed";
    commission_pct: number;
    commission_fixed?: number | null;
    other_expenses: number;
    limit?: number;
  }) =>
    request<PriceAdvisorResponse>("/api/price-advisor/calculate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getAtlasMarkets: (params: {
    commodity?: string;
    state?: string;
    district?: string;
    min_price?: number;
    max_price?: number;
    search?: string;
  }) => request<AtlasMarketsResponse>(`/api/atlas/markets${buildQuery(params)}`),

  getAtlasSummary: (params: { commodity: string; state?: string }) =>
    request<AtlasSummaryResponse>(`/api/atlas/summary${buildQuery(params)}`),

  getCropIntelligence: (
    commodity: string,
    params: { variety?: string; state?: string; district?: string; market_id?: number }
  ) =>
    request<CropIntelligenceResponse>(
      `/api/crops/${encodeURIComponent(commodity)}${buildQuery(params)}`
    ),

  getMarketComparison: (params: {
    commodity: string;
    market_ids: string;
    variety?: string;
    origin_market_id?: number;
    quantity_quintals?: number;
    transport_cost_per_km?: number;
    commission_pct?: number;
    other_expenses?: number;
    days?: number;
  }) => request<MarketComparisonResponse>(`/api/market-comparison${buildQuery(params)}`),

  getReports: (params: {
    reporting_date?: string;
    state?: string;
    district?: string;
    market?: string;
    commodity?: string;
    variety?: string;
    category?: string;
    search?: string;
    sort_by?: string;
    sort_dir?: string;
    page?: number;
    page_size?: number;
  }) => request<ReportsResponse>(`/api/reports${buildQuery(params)}`),

  getReportExportUrl: (
    format: "csv" | "pdf",
    params: Record<string, string | number | undefined | null>
  ) => `/api/reports/export${buildQuery({ format, ...params })}`,

  getForecast: (params: {
    commodity: string;
    market_id: number;
    variety?: string;
    lookback_days?: number;
    model_type?: string;
  }) => request<ForecastResponse>(`/api/forecast${buildQuery(params)}`),

  getWatchlist: () => request<{ items: WatchlistItem[] }>("/api/watchlist"),

  addWatchlist: (payload: { commodity_id: number; market_id?: number | null }) =>
    request<{ id: number; message: string }>("/api/watchlist", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteWatchlist: (id: number) =>
    request<{ message: string }>(`/api/watchlist/${id}`, { method: "DELETE" }),

  getAlerts: () => request<AlertsResponse>("/api/alerts"),

  createAlert: (payload: {
    commodity_id: number;
    market_id?: number | null;
    condition: string;
    threshold_value: number;
  }) =>
    request<{ id: number; message: string; newly_triggered_count: number }>("/api/alerts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  toggleAlert: (id: number, is_active: boolean) =>
    request<{ id: number; is_active: boolean }>(`/api/alerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active }),
    }),

  deleteAlert: (id: number) =>
    request<{ message: string }>(`/api/alerts/${id}`, { method: "DELETE" }),

  acknowledgeAlertEvent: (id: number) =>
    request<{ id: number; acknowledged: boolean }>(`/api/alerts/events/${id}/ack`, {
      method: "POST",
    }),

  getDataQuality: () => request<DataQualityResponse>("/api/data-quality"),

  importCsv: (file: File, sourceLabel = "User CSV Upload") => {
    const fd = new FormData();
    fd.append("file", file);
    return request<Record<string, unknown>>(
      `/api/data/import${buildQuery({ source_label: sourceLabel })}`,
      { method: "POST", body: fd }
    );
  },

  refreshAgmarknet: (params?: { state?: string; commodity?: string }) =>
    request<{ mode: string; live_fetched: boolean; message: string }>(
      `/api/data/refresh${buildQuery(params || {})}`,
      { method: "POST" }
    ),

  clearDemoData: () =>
    request<{ deleted_demo_records: number }>("/api/data/clear-demo", { method: "DELETE" }),

  seedDemoData: () =>
    request<{ seeded: boolean; message?: string }>("/api/data/seed-demo", { method: "POST" }),

  getSettings: () => request<UserSettings>("/api/settings"),

  updateSettings: (payload: UserSettings) =>
    request<{ message: string }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};
