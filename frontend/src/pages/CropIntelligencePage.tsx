import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  SectionHeader,
  TooltipLabel,
} from "../components/UiPrimitives";
import type { CropIntelligenceResponse, FilterMetaResponse } from "../types/api";
import {
  formatDateShort,
  formatDualPrice,
  formatKgFromQuintal,
  formatNumber,
  formatPct,
  formatQuintalPrice,
} from "../utils/format";

interface CropIntelligencePageProps {
  filters: FilterMetaResponse | null;
  activeCommodity: string;
  onSelectCommodity: (commodity: string) => void;
}

export const CropIntelligencePage: React.FC<CropIntelligencePageProps> = ({
  filters,
  activeCommodity,
  onSelectCommodity,
}) => {
  const [commodity, setCommodity] = useState(activeCommodity || "Onion");
  const [variety, setVariety] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [marketId, setMarketId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"daily" | "weekly" | "monthly" | "seasonal">("daily");

  const [data, setData] = useState<CropIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCommodity) setCommodity(activeCommodity);
  }, [activeCommodity]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getCropIntelligence(commodity, {
        variety,
        state: stateFilter,
        district: districtFilter,
        market_id: marketId ? Number(marketId) : undefined,
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load crop analytics.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [commodity, variety, stateFilter, districtFilter, marketId]);

  const varieties = filters?.varieties_by_commodity?.[commodity] || [];
  const districts =
    stateFilter !== "All" ? filters?.districts_by_state?.[stateFilter] || [] : [];
  const filteredMarkets = (filters?.markets || []).filter(
    (m) =>
      (stateFilter === "All" || m.state === stateFilter) &&
      (districtFilter === "All" || m.district === districtFilter)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">
          Crop Intelligence
        </h1>
      </div>

      {/* Search & Scope Bar */}
      <Card className="p-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <select
            aria-label="Select crop"
            value={commodity}
            onChange={(e) => {
              setCommodity(e.target.value);
              setVariety("All");
              onSelectCommodity(e.target.value);
            }}
            className="px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white font-medium"
          >
            {(filters?.commodities || []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.name} ({c.category})
              </option>
            ))}
          </select>

          <select
            aria-label="Variety filter"
            value={variety}
            onChange={(e) => setVariety(e.target.value)}
            className="px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
          >
            <option value="All">All Varieties</option>
            {varieties.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>

          <select
            aria-label="State filter"
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setDistrictFilter("All");
              setMarketId("");
            }}
            className="px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
          >
            <option value="All">All States</option>
            {(filters?.states || []).map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            aria-label="District filter"
            value={districtFilter}
            onChange={(e) => {
              setDistrictFilter(e.target.value);
              setMarketId("");
            }}
            disabled={stateFilter === "All"}
            className="px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white disabled:bg-[#F7F9F6]"
          >
            <option value="All">All Districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            aria-label="Market filter"
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            className="px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
          >
            <option value="">All Markets</option>
            {filteredMarkets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.state})
              </option>
            ))}
          </select>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingState label={`Analyzing historical records for ${commodity}...`} />}

      {!loading && data && data.empty && (
        <EmptyState
          title={`No records for ${commodity}`}
          description={data.message || "Adjust the state, district, or market filters."}
        />
      )}

      {!loading && data && !data.empty && (
        <>
          {/* 8 Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Latest Reported Modal Price</div>
              <div className="text-[18px] font-semibold text-[#176B45] tabular-nums mt-1">
                {formatQuintalPrice(data.summary.latest_modal_price)}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                {formatKgFromQuintal(data.summary.latest_modal_price)} ·{" "}
                {formatDateShort(data.summary.latest_reporting_date)}
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Latest Min / Max Range</div>
              <div className="text-[15px] font-semibold text-[#202B25] tabular-nums mt-1.5">
                {formatQuintalPrice(data.summary.latest_min_price)} –{" "}
                {formatQuintalPrice(data.summary.latest_max_price)}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5 tabular-nums">
                {formatKgFromQuintal(data.summary.latest_min_price)} –{" "}
                {formatKgFromQuintal(data.summary.latest_max_price)}
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Historical Average</div>
              <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
                {formatQuintalPrice(data.summary.historical_avg_price)}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5 tabular-nums">
                {formatKgFromQuintal(data.summary.historical_avg_price)} ·{" "}
                {data.summary.total_observations.toLocaleString("en-IN")} records
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">All-Time High / Low</div>
              <div className="text-[15px] font-semibold text-[#202B25] tabular-nums mt-1.5">
                {formatQuintalPrice(data.summary.highest_recorded_price)} /{" "}
                {formatQuintalPrice(data.summary.lowest_recorded_price)}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5 tabular-nums">
                {formatKgFromQuintal(data.summary.highest_recorded_price)} /{" "}
                {formatKgFromQuintal(data.summary.lowest_recorded_price)}
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">
                <TooltipLabel
                  label="Price Volatility (CV)"
                  hint="Coefficient of variation: standard deviation divided by mean modal price."
                />
              </div>
              <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
                {data.summary.volatility_cv_pct.toFixed(1)}%
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                Std dev: ₹{data.summary.volatility_std.toLocaleString("en-IN")}
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Recent Price Movement</div>
              <div
                className={`text-[18px] font-semibold tabular-nums mt-1 ${
                  data.summary.recent_change_pct > 0
                    ? "text-[#176B45]"
                    : data.summary.recent_change_pct < 0
                    ? "text-[#C45A50]"
                    : "text-[#202B25]"
                }`}
              >
                {formatPct(data.summary.recent_change_pct)}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                7D move:{" "}
                {data.summary.weekly_change_pct !== null
                  ? formatPct(data.summary.weekly_change_pct)
                  : "—"}
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Reporting Market Coverage</div>
              <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
                {data.summary.reporting_market_coverage} markets
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">{data.category}</div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Historical Span</div>
              <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
                {data.seasonality.years_covered.toFixed(2)} yrs
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                Years: {data.seasonality.calendar_years.join(", ")}
              </div>
            </Card>
          </div>

          {/* Historical Trend & Seasonality */}
          <Card className="p-4">
            <SectionHeader
              title={`${data.commodity} Historical & Seasonal Price Structure`}
              action={
                <div className="inline-flex border border-[#E3E9E4] rounded overflow-hidden">
                  {[
                    { id: "daily", label: "Daily" },
                    { id: "weekly", label: "Weekly" },
                    { id: "monthly", label: "Monthly" },
                    { id: "seasonal", label: "Seasonality" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() =>
                        setViewMode(tab.id as "daily" | "weekly" | "monthly" | "seasonal")
                      }
                      className={`px-3 py-1.5 text-[12px] font-medium ${
                        viewMode === tab.id
                          ? "bg-[#176B45] text-white"
                          : "bg-white text-[#46544B] hover:bg-[#F7F9F6]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              }
            />

            <div className="h-72 w-full">
              {viewMode === "daily" && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6C776F" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6C776F" }} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip formatter={(v: number) => formatDualPrice(v)} />
                    <Line type="monotone" dataKey="modal_price" name="Modal Price" stroke="#176B45" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="min_price" name="Min Price" stroke="#6B9875" strokeDasharray="4 4" strokeWidth={1.3} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="max_price" name="Max Price" stroke="#C48A2C" strokeDasharray="4 4" strokeWidth={1.3} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {viewMode === "weekly" && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.weekly_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#6C776F" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6C776F" }} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip formatter={(v: number) => formatDualPrice(v)} />
                    <Line type="monotone" dataKey="modal_price" name="Weekly Avg Modal" stroke="#176B45" strokeWidth={2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {viewMode === "monthly" && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthly_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6C776F" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6C776F" }} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip formatter={(v: number) => formatDualPrice(v)} />
                    <Bar dataKey="modal_price" name="Monthly Avg Modal" fill="#176B45" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {viewMode === "seasonal" && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.seasonality.months}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                    <XAxis dataKey="month" tick={{ fontSize: 11.5, fill: "#202B25" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6C776F" }} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip formatter={(v: number) => formatDualPrice(v)} />
                    <Bar dataKey="avg_price" name="Month Avg Modal" fill="#176B45" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {data.seasonality.seasonal_high && data.seasonality.seasonal_low && (
              <div className="mt-3 pt-3 border-t border-[#E3E9E4] flex flex-wrap gap-6 text-[12.5px] text-[#46544B]">
                <span>
                  Observed Peak Month:{" "}
                  <strong className="text-[#176B45]">
                    {data.seasonality.seasonal_high.month} (
                    {formatDualPrice(data.seasonality.seasonal_high.avg_price)})
                  </strong>
                </span>
                <span>
                  Observed Low Month:{" "}
                  <strong className="text-[#202B25]">
                    {data.seasonality.seasonal_low.month} (
                    {formatDualPrice(data.seasonality.seasonal_low.avg_price)})
                  </strong>
                </span>
              </div>
            )}
          </Card>

          {/* Arrival Volume vs Price & Market-Wise Comparison */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <Card className="p-4 xl:col-span-6">
              <SectionHeader
                title="Market Arrivals vs Modal Price"
                subtitle={
                  data.arrival_analysis.available
                    ? `Observed Pearson correlation: r = ${
                        data.arrival_analysis.pearson_correlation ?? "—"
                      }`
                    : "Arrival quantity unavailable or insufficient for selected filter"
                }
              />
              {data.arrival_analysis.available ? (
                <>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.arrival_analysis.series}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                        <XAxis dataKey="date" tick={{ fontSize: 10.5, fill: "#6C776F" }} />
                        <YAxis
                          yAxisId="left"
                          tick={{ fontSize: 11, fill: "#6C776F" }}
                          tickFormatter={(v) => `${v}t`}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 11, fill: "#176B45" }}
                          tickFormatter={(v) => `₹${v}`}
                        />
                        <Tooltip />
                        <Bar
                          yAxisId="left"
                          dataKey="arrival_quantity"
                          name="Arrivals (Tonnes)"
                          fill="#CBE2D1"
                          isAnimationActive={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="modal_price"
                          name="Modal Price (₹/qtl)"
                          stroke="#176B45"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-[#6C776F] py-8 text-center">
                  Arrival quantity data is missing or sparse for this selection.
                </p>
              )}
            </Card>

            <Card className="p-4 xl:col-span-6">
              <SectionHeader title="Market-Wise Latest Comparison" />
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                      <th className="py-2 pr-2 font-medium">Market</th>
                      <th className="py-2 px-2 font-medium">State</th>
                      <th className="py-2 px-2 font-medium text-right">Modal</th>
                      <th className="py-2 px-2 font-medium text-right">Arrivals</th>
                      <th className="py-2 pl-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E9E4]">
                    {data.market_comparison.map((row) => (
                      <tr key={row.market_id} className="hover:bg-[#F7F9F6]">
                        <td className="py-2 pr-2 font-medium">{row.market_name}</td>
                        <td className="py-2 px-2 text-[#6C776F]">{row.state}</td>
                        <td className="py-2 px-2 text-right font-semibold text-[#176B45] tabular-nums">
                          <div>{formatQuintalPrice(row.modal_price)}</div>
                          <div className="text-[10.5px] font-normal text-[#6C776F]">
                            {formatKgFromQuintal(row.modal_price)}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-[#6C776F]">
                          {row.arrival_quantity !== null ? `${formatNumber(row.arrival_quantity)} t` : "—"}
                        </td>
                        <td className="py-2 pl-2 text-[#6C776F] tabular-nums">
                          {formatDateShort(row.reporting_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
