import React, { useEffect, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import {
  CartesianGrid,
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
  FreshnessBadge,
  LoadingState,
  SectionHeader,
  SourceBanner,
  TooltipLabel,
} from "../components/UiPrimitives";
import type { FilterMetaResponse, ModuleRoute, OverviewResponse } from "../types/api";
import type { PriceUnitMode } from "../utils/format";
import {
  formatDateShort,
  formatDirectKgPrice,
  formatDisplayPrice,
  formatKgFromQuintal,
  formatPct,
  formatQuintalPrice,
  formatSecondaryPrice,
  formatTimestamp,
} from "../utils/format";

interface OverviewPageProps {
  filters: FilterMetaResponse | null;
  selectedState: string;
  selectedDate: string;
  activeCommodity: string;
  priceUnit?: PriceUnitMode;
  onSelectCommodity: (commodity: string) => void;
  onNavigate: (route: ModuleRoute) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  filters,
  selectedState,
  selectedDate,
  activeCommodity,
  priceUnit = "Quintal",
  onSelectCommodity,
  onNavigate,
}) => {
  const [historyDays, setHistoryDays] = useState<number>(30);
  const [chartCommodity, setChartCommodity] = useState<string>(activeCommodity || "Onion");
  const [vegViewMode, setVegViewMode] = useState<"summary" | "markets">("summary");
  const [vegMarketFilter, setVegMarketFilter] = useState<string>("All");
  const [vegCropFilter, setVegCropFilter] = useState<string>("All");
  const [vegSearch, setVegSearch] = useState<string>("");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVegMarketFilter("All");
  }, [selectedState]);

  useEffect(() => {
    if (activeCommodity) {
      setChartCommodity(activeCommodity);
    }
  }, [activeCommodity]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getOverview({
        reporting_date: selectedDate || undefined,
        state: selectedState || undefined,
        commodity: chartCommodity || undefined,
        history_days: historyDays,
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load market overview.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDate, selectedState, chartCommodity, historyDays]);

  if (loading && !data) return <LoadingState label="Loading daily agricultural market briefing..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!data || data.empty) {
    return (
      <EmptyState
        title="No market records loaded"
        description="Import an AGMARKNET CSV file or load the sample dataset in Data Quality to inspect market prices."
        action={
          <button
            type="button"
            onClick={() => onNavigate("/data-quality")}
            className="px-4 py-2 text-[13px] font-medium rounded-md bg-[#176B45] text-white hover:bg-[#124D35]"
          >
            Open Data Quality Centre
          </button>
        }
      />
    );
  }

  const { summary, daily_briefing, followed_crops, price_history, source_status } = data;
  const vegRows = data.vegetable_per_kg || [];
  const vegMarkets = Array.from(new Set(vegRows.map((v) => v.market))).sort();
  const vegNames = Array.from(new Set(vegRows.map((v) => v.commodity))).sort();

  const vegSummaries = vegNames.map((name) => {
    const matches = vegRows.filter((r) => r.commodity === name);
    let minRow = matches[0];
    let maxRow = matches[0];
    let sumKg = 0;
    for (const row of matches) {
      sumKg += row.modal_price_per_kg;
      if (row.modal_price_per_kg < minRow.modal_price_per_kg) minRow = row;
      if (row.modal_price_per_kg > maxRow.modal_price_per_kg) maxRow = row;
    }
    return {
      commodity: name,
      variety: matches[0]?.variety || "",
      marketCount: matches.length,
      avgKg: matches.length ? sumKg / matches.length : 0,
      minRow,
      maxRow,
    };
  });

  const vegQuery = vegSearch.trim().toLowerCase();
  const filteredVeg = vegRows.filter((r) => {
    if (vegMarketFilter !== "All" && r.market !== vegMarketFilter) return false;
    if (vegCropFilter !== "All" && r.commodity !== vegCropFilter) return false;
    if (
      vegQuery &&
      !`${r.commodity} ${r.variety} ${r.market} ${r.district} ${r.state}`
        .toLowerCase()
        .includes(vegQuery)
    ) {
      return false;
    }
    return true;
  });

  const chartData = price_history.map((pt) => ({
    ...pt,
    display_modal: priceUnit === "Kg" ? Number((pt.modal_price / 100).toFixed(2)) : pt.modal_price,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">Market Overview</h1>
          <p className="text-[12.5px] text-[#6C776F] mt-0.5">
            <strong className="text-[#202B25]">
              {selectedState === "All" ? "All Reporting States" : selectedState}
            </strong>{" "}
            · {formatDateShort(summary.selected_date)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("/price-advisor")}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-md bg-[#176B45] text-white hover:bg-[#124D35]"
        >
          <span>Compare Net Return in Price Advisor</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <SourceBanner status={source_status} />

      {/* Market Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card className="p-3.5">
          <div className="text-[12px] text-[#6C776F]">Markets Reporting</div>
          <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
            {summary.markets_reporting}
          </div>
          <div className="text-[11.5px] text-[#6C776F] mt-0.5">
            On {formatDateShort(summary.selected_date)}
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="text-[12px] text-[#6C776F]">Commodities Available</div>
          <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
            {summary.commodities_available}
          </div>
          <div className="text-[11.5px] text-[#6C776F] mt-0.5">Active crop varieties</div>
        </Card>

        <Card className="p-3.5">
          <div className="text-[12px] text-[#6C776F]">
            <TooltipLabel
              label="Highest Modal Price"
              hint="Highest modal price across all reported crops (grains, pulses, spices & vegetables)."
            />
          </div>
          <div className="text-[18px] font-semibold text-[#176B45] tabular-nums mt-1">
            {summary.highest_modal_price
              ? formatDisplayPrice(summary.highest_modal_price.price, priceUnit)
              : "—"}
          </div>
          <div className="text-[11.5px] text-[#202B25] mt-0.5 truncate">
            {summary.highest_modal_price
              ? `${summary.highest_modal_price.commodity} · ${summary.highest_modal_price.market}`
              : "No report on date"}
          </div>
          {summary.highest_modal_price && (
            <div className="text-[11px] text-[#6C776F] tabular-nums mt-0.5">
              {priceUnit === "Kg"
                ? formatQuintalPrice(summary.highest_modal_price.price)
                : formatKgFromQuintal(summary.highest_modal_price.price)}
            </div>
          )}
        </Card>

        <Card className="p-3.5">
          <div className="text-[12px] text-[#6C776F]">Lowest Modal Price</div>
          <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
            {summary.lowest_modal_price
              ? formatDisplayPrice(summary.lowest_modal_price.price, priceUnit)
              : "—"}
          </div>
          <div className="text-[11.5px] text-[#202B25] mt-0.5 truncate">
            {summary.lowest_modal_price
              ? `${summary.lowest_modal_price.commodity} · ${summary.lowest_modal_price.market}`
              : "No report on date"}
          </div>
          {summary.lowest_modal_price && (
            <div className="text-[11px] text-[#6C776F] tabular-nums mt-0.5">
              {priceUnit === "Kg"
                ? formatQuintalPrice(summary.lowest_modal_price.price)
                : formatKgFromQuintal(summary.lowest_modal_price.price)}
            </div>
          )}
        </Card>

        <Card className="p-3.5">
          <div className="text-[12px] text-[#6C776F]">Followed Crops Updated</div>
          <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
            {summary.followed_crops_updated} / {summary.followed_crops_total ?? followed_crops.length}
          </div>
          <div className="text-[11.5px] text-[#6C776F] mt-0.5">Matching selected date</div>
        </Card>

        <Card className="p-3.5">
          <div className="text-[12px] text-[#6C776F]">Data Last Refreshed</div>
          <div className="text-[13.5px] font-semibold text-[#202B25] mt-1.5">
            {formatTimestamp(summary.last_refreshed)}
          </div>
          <div className="text-[11.5px] text-[#6C776F] mt-0.5 truncate">
            {source_status.last_refresh_source || "Local database"}
          </div>
        </Card>
      </div>

      {/* Prominent All-Vegetables Per-Kg & Highest Price Board */}
      {vegRows.length > 0 && (
        <Card className="p-4">
          <SectionHeader
            title={`All Vegetables Per-Kg Rates & Highest Prices (${
              selectedState === "All" ? "Main Indian Markets" : selectedState
            })`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex border border-[#E3E9E4] rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setVegViewMode("summary");
                      setVegMarketFilter("All");
                      setVegCropFilter("All");
                      setVegSearch("");
                    }}
                    className={`px-2.5 py-1.5 text-[12px] font-medium ${
                      vegViewMode === "summary"
                        ? "bg-[#176B45] text-white"
                        : "bg-white text-[#46544B] hover:bg-[#F7F9F6]"
                    }`}
                  >
                    All {vegNames.length} Vegetables (Min / Avg / Highest)
                  </button>
                  <button
                    type="button"
                    onClick={() => setVegViewMode("markets")}
                    className={`px-2.5 py-1.5 text-[12px] font-medium border-l border-[#E3E9E4] ${
                      vegViewMode === "markets"
                        ? "bg-[#176B45] text-white"
                        : "bg-white text-[#46544B] hover:bg-[#F7F9F6]"
                    }`}
                  >
                    By Main Market ({vegRows.length} quotes)
                  </button>
                </div>
              </div>
            }
          />

          {vegViewMode === "summary" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                    <th className="py-2 pr-3 font-medium">Vegetable</th>
                    <th className="py-2 px-3 font-medium text-right">Markets</th>
                    <th className="py-2 px-3 font-medium text-right">Lowest Modal (₹/kg)</th>
                    <th className="py-2 px-3 font-medium text-right">Avg Modal (₹/kg)</th>
                    <th className="py-2 px-3 font-medium text-right">Highest Modal (₹/kg)</th>
                    <th className="py-2 px-3 font-medium text-right">Highest (₹/qtl)</th>
                    <th className="py-2 pl-3 font-medium text-right">Market Quotes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E9E4]">
                  {vegSummaries.map((item) => (
                    <tr
                      key={item.commodity}
                      onClick={() => {
                        setVegCropFilter(item.commodity);
                        setVegMarketFilter("All");
                        setVegViewMode("markets");
                      }}
                      className="hover:bg-[#F7F9F6] cursor-pointer"
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium text-[#202B25]">{item.commodity}</div>
                        <div className="text-[11px] text-[#6C776F]">{item.variety}</div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-[#6C776F]">
                        {item.marketCount}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        <div className="font-medium text-[#202B25]">
                          {formatDirectKgPrice(item.minRow?.modal_price_per_kg)} ·{" "}
                          <span className="text-[#6C776F] font-normal">
                            {formatQuintalPrice(item.minRow?.modal_price_per_quintal)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#6C776F]">
                          {item.minRow?.market} ({item.minRow?.state})
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-[#46544B]">
                        <div className="font-medium">{formatDirectKgPrice(item.avgKg)}</div>
                        <div className="text-[11px] text-[#6C776F]">
                          {formatQuintalPrice(item.avgKg * 100)}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        <div className="font-semibold text-[#176B45]">
                          {formatDirectKgPrice(item.maxRow?.modal_price_per_kg)}
                        </div>
                        <div className="text-[11px] text-[#202B25]">
                          {item.maxRow?.market} ({item.maxRow?.state})
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-[#46544B]">
                        {formatQuintalPrice(item.maxRow?.modal_price_per_quintal)}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <span className="inline-block px-2 py-0.5 text-[11px] font-medium rounded border border-[#CBE2D1] bg-[#EAF3EC] text-[#176B45]">
                          View {item.marketCount} markets
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  type="text"
                  value={vegSearch}
                  onChange={(e) => setVegSearch(e.target.value)}
                  placeholder="Search market (e.g. Kavalkinaru, Gandhi Market) or vegetable..."
                  aria-label="Search vegetable quotes"
                  className="px-2.5 py-1.5 text-[12px] border border-[#E3E9E4] rounded bg-white min-w-[260px] flex-1 max-w-sm"
                />
                <select
                  aria-label="Filter vegetable market"
                  value={vegMarketFilter}
                  onChange={(e) => setVegMarketFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-[12px] border border-[#E3E9E4] rounded bg-white"
                >
                  <option value="All">All Main Markets ({vegMarkets.length})</option>
                  {vegMarkets.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter vegetable crop"
                  value={vegCropFilter}
                  onChange={(e) => setVegCropFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-[12px] border border-[#E3E9E4] rounded bg-white"
                >
                  <option value="All">All Vegetables ({vegNames.length})</option>
                  {vegNames.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <span className="text-[11.5px] text-[#6C776F] ml-auto tabular-nums">
                  Showing {filteredVeg.length} of {vegRows.length} quotes
                </span>
              </div>
              <div className="overflow-x-auto max-h-96 border border-[#E3E9E4] rounded">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_#E3E9E4]">
                    <tr className="text-left text-[#6C776F]">
                      <th className="py-2 px-3 font-medium">Vegetable</th>
                      <th className="py-2 px-3 font-medium">Main Market & District</th>
                      <th className="py-2 px-3 font-medium">State</th>
                      <th className="py-2 px-3 font-medium text-right">Min – Max (₹/kg)</th>
                      <th className="py-2 px-3 font-medium text-right">Modal (₹/kg)</th>
                      <th className="py-2 px-3 font-medium text-right">Quintal (₹/qtl)</th>
                      <th className="py-2 px-3 font-medium">Report Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E9E4]">
                    {filteredVeg.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 px-3 text-center text-[#6C776F]">
                          No vegetable quotes matched your current filter or search term.
                        </td>
                      </tr>
                    ) : (
                      filteredVeg.map((row) => (
                        <tr
                          key={`${row.market}-${row.commodity}`}
                          onClick={() => {
                            onSelectCommodity(row.commodity);
                            onNavigate("/crops");
                          }}
                          className="hover:bg-[#F7F9F6] cursor-pointer"
                        >
                          <td className="py-2 px-3">
                            <div className="font-medium text-[#202B25]">{row.commodity}</div>
                            <div className="text-[11px] text-[#6C776F]">{row.variety}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-medium text-[#202B25]">{row.market}</div>
                            <div className="text-[11px] text-[#6C776F]">{row.district} District</div>
                          </td>
                          <td className="py-2 px-3 text-[#6C776F]">{row.state}</td>
                          <td className="py-2 px-3 text-right text-[#6C776F] tabular-nums whitespace-nowrap">
                            {formatDirectKgPrice(row.min_price_per_kg)} –{" "}
                            {formatDirectKgPrice(row.max_price_per_kg)}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-[#176B45] tabular-nums whitespace-nowrap">
                            {formatDirectKgPrice(row.modal_price_per_kg)}
                          </td>
                          <td className="py-2 px-3 text-right text-[#46544B] tabular-nums whitespace-nowrap">
                            {formatQuintalPrice(row.modal_price_per_quintal)}
                          </td>
                          <td className="py-2 px-3 text-[#6C776F] tabular-nums whitespace-nowrap">
                            {formatDateShort(row.reporting_date)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Price Movement Chart + Followed Crops */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="p-4 xl:col-span-7">
          <SectionHeader
            title={`Historical Modal Price Movement — ${data.chart_commodity || chartCommodity} (${
              priceUnit === "Kg" ? "₹/kg" : "₹/qtl"
            })`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Chart commodity"
                  value={chartCommodity}
                  onChange={(e) => {
                    setChartCommodity(e.target.value);
                    onSelectCommodity(e.target.value);
                  }}
                  className="px-2.5 py-1 text-[12.5px] border border-[#E3E9E4] rounded bg-white"
                >
                  {(filters?.commodities || []).map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="inline-flex border border-[#E3E9E4] rounded overflow-hidden">
                  {[
                    { label: "7D", days: 7 },
                    { label: "30D", days: 30 },
                    { label: "90D", days: 90 },
                    { label: "1Y", days: 365 },
                  ].map((opt) => (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => setHistoryDays(opt.days)}
                      className={`px-2.5 py-1 text-[12px] font-medium ${
                        historyDays === opt.days
                          ? "bg-[#176B45] text-white"
                          : "bg-white text-[#46544B] hover:bg-[#F7F9F6]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            }
          />
          {chartData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center px-4 gap-3">
              <p className="text-[13px] text-[#6C776F]">
                No historical price records found for <strong>{chartCommodity}</strong>
                {selectedState !== "All" ? ` in ${selectedState}` : ""}.
              </p>
              {(() => {
                const stateCrops = Array.from(
                  new Set([
                    ...daily_briefing.highest_markets.map((m) => m.commodity),
                    ...daily_briefing.price_increases.map((m) => m.commodity),
                    ...daily_briefing.price_decreases.map((m) => m.commodity),
                  ])
                ).filter((c) => c !== chartCommodity);
                if (stateCrops.length === 0) return null;
                return (
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="text-[12px] text-[#6C776F]">Switch to active crops here:</span>
                    {stateCrops.slice(0, 4).map((cropName) => (
                      <button
                        key={cropName}
                        type="button"
                        onClick={() => {
                          setChartCommodity(cropName);
                          onSelectCommodity(cropName);
                        }}
                        className="px-2.5 py-1 text-[12px] font-medium rounded border border-[#CBE2D1] bg-[#EAF3EC] text-[#176B45] hover:bg-[#176B45] hover:text-white"
                      >
                        {cropName}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#6C776F" }}
                    tickFormatter={(val) => formatDateShort(val).replace(/ \d{4}$/, "")}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6C776F" }}
                    tickFormatter={(v) => (priceUnit === "Kg" ? `₹${v}/kg` : `₹${v}`)}
                    width={priceUnit === "Kg" ? 68 : 62}
                  />
                  <Tooltip
                    formatter={(val: number) => {
                      const qtl = priceUnit === "Kg" ? val * 100 : val;
                      return [
                        `${formatDisplayPrice(qtl, priceUnit)} · ${formatSecondaryPrice(qtl, priceUnit)}`,
                        "Avg Modal Price",
                      ];
                    }}
                    labelFormatter={(lbl) => `Reporting Date: ${formatDateShort(String(lbl))}`}
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderColor: "#E3E9E4",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="display_modal"
                    stroke="#176B45"
                    strokeWidth={2}
                    dot={historyDays <= 30 ? { r: 2.5, fill: "#176B45" } : false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4 xl:col-span-5">
          <SectionHeader
            title="Followed Crops"
            action={
              <button
                type="button"
                onClick={() => onNavigate("/watchlist")}
                className="text-[12.5px] font-medium text-[#176B45] hover:underline"
              >
                Manage Watchlist
              </button>
            }
          />
          {followed_crops.length === 0 ? (
            <p className="text-[13px] text-[#6C776F] py-8 text-center">
              No followed crops configured yet. Add crops in Watchlist & Alerts.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                    <th className="py-2 pr-2 font-medium">Crop & Market</th>
                    <th className="py-2 px-2 font-medium text-right">Latest Modal</th>
                    <th className="py-2 px-2 font-medium text-right">Previous</th>
                    <th className="py-2 pl-2 font-medium text-right">Move</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E9E4]">
                  {followed_crops.map((item) => (
                    <tr
                      key={item.watchlist_id}
                      className="hover:bg-[#F7F9F6] cursor-pointer"
                      onClick={() => {
                        onSelectCommodity(item.commodity);
                        onNavigate("/crops");
                      }}
                    >
                      <td className="py-2.5 pr-2">
                        <div className="font-medium text-[#202B25]">{item.commodity}</div>
                        <div className="text-[11.5px] text-[#6C776F]">
                          {item.market} · {formatDateShort(item.reporting_date)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                        <div>{formatDisplayPrice(item.latest_modal_price, priceUnit)}</div>
                        <div className="text-[10.5px] font-normal text-[#6C776F]">
                          {formatSecondaryPrice(item.latest_modal_price, priceUnit)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right text-[#6C776F] tabular-nums">
                        <div>{formatDisplayPrice(item.previous_modal_price, priceUnit)}</div>
                        <div className="text-[10.5px] text-[#6C776F]">
                          {formatSecondaryPrice(item.previous_modal_price, priceUnit)}
                        </div>
                      </td>
                      <td className="py-2.5 pl-2 text-right tabular-nums">
                        {item.movement_pct !== null ? (
                          <span
                            className={`inline-flex items-center gap-0.5 font-medium ${
                              item.movement_pct > 0
                                ? "text-[#176B45]"
                                : item.movement_pct < 0
                                ? "text-[#C45A50]"
                                : "text-[#6C776F]"
                            }`}
                          >
                            {item.movement_pct > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}
                            {item.movement_pct < 0 && <ArrowDownRight className="w-3.5 h-3.5" />}
                            {formatPct(item.movement_pct)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Daily Market Briefing */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4">
          <SectionHeader title="Price Increases" />
          {daily_briefing.price_increases.length === 0 ? (
            <p className="text-[12.5px] text-[#6C776F]">No crops showed day-over-day increases.</p>
          ) : (
            <ul className="space-y-2.5 text-[12.5px]">
              {daily_briefing.price_increases.map((item) => (
                <li key={item.commodity} className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#202B25]">{item.commodity}</div>
                    <div className="text-[11px] text-[#6C776F]">{formatDateShort(item.reporting_date)}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-semibold text-[#176B45]">{formatPct(item.movement_pct)}</div>
                    <div className="text-[11px] text-[#6C776F]">
                      {formatDisplayPrice(item.latest_avg_modal, priceUnit)} ·{" "}
                      {formatSecondaryPrice(item.latest_avg_modal, priceUnit)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader title="Price Decreases" />
          {daily_briefing.price_decreases.length === 0 ? (
            <p className="text-[12.5px] text-[#6C776F]">No crops showed day-over-day decreases.</p>
          ) : (
            <ul className="space-y-2.5 text-[12.5px]">
              {daily_briefing.price_decreases.map((item) => (
                <li key={item.commodity} className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#202B25]">{item.commodity}</div>
                    <div className="text-[11px] text-[#6C776F]">{formatDateShort(item.reporting_date)}</div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-semibold text-[#C45A50]">{formatPct(item.movement_pct)}</div>
                    <div className="text-[11px] text-[#6C776F]">
                      {formatDisplayPrice(item.latest_avg_modal, priceUnit)} ·{" "}
                      {formatSecondaryPrice(item.latest_avg_modal, priceUnit)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader title="Highest-Price Markets" />
          {daily_briefing.highest_markets.length === 0 ? (
            <p className="text-[12.5px] text-[#6C776F]">No reports on selected date.</p>
          ) : (
            <ul className="space-y-2.5 text-[12.5px]">
              {daily_briefing.highest_markets.map((item, idx) => (
                <li key={`${item.market}-${item.commodity}-${idx}`} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-[#202B25] truncate">
                      {item.market} ({item.commodity})
                    </div>
                    <div className="text-[11px] text-[#6C776F]">
                      {item.state} · {formatDateShort(item.reporting_date)}
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <div className="font-semibold text-[#202B25]">
                      {formatDisplayPrice(item.modal_price, priceUnit)}
                    </div>
                    <div className="text-[10.5px] text-[#6C776F]">
                      {formatSecondaryPrice(item.modal_price, priceUnit)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader title="Wide Intra-Day Spreads" />
          {daily_briefing.wide_spread_markets.length === 0 ? (
            <p className="text-[12.5px] text-[#6C776F]">No spread data on selected date.</p>
          ) : (
            <ul className="space-y-2.5 text-[12.5px]">
              {daily_briefing.wide_spread_markets.map((item, idx) => (
                <li key={`${item.market}-${item.commodity}-${idx}`} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-[#202B25] truncate">
                      {item.market} ({item.commodity})
                    </div>
                    <div className="text-[11px] text-[#6C776F]">
                      {formatDisplayPrice(item.min_price, priceUnit)} – {formatDisplayPrice(item.max_price, priceUnit)}
                    </div>
                    <div className="text-[10.5px] text-[#6C776F]">
                      {formatSecondaryPrice(item.min_price, priceUnit)} – {formatSecondaryPrice(item.max_price, priceUnit)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-[#C48A2C] tabular-nums">
                      {priceUnit === "Kg"
                        ? `${formatDirectKgPrice(item.spread / 100)} (${formatQuintalPrice(item.spread)})`
                        : `₹${item.spread.toLocaleString("en-IN")} (${formatDirectKgPrice(item.spread / 100)})`}
                    </div>
                    <div className="text-[11px] text-[#6C776F]">{formatDateShort(item.reporting_date)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Recently Updated Market Reports */}
      <Card className="p-4">
        <SectionHeader
          title="Recently Updated Market Reports"
          action={
            <button
              type="button"
              onClick={() => onNavigate("/reports")}
              className="text-[12.5px] font-medium text-[#176B45] hover:underline"
            >
              Open Full Price Reports
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                <th className="py-2 pr-3 font-medium">Reporting Date</th>
                <th className="py-2 px-3 font-medium">Commodity</th>
                <th className="py-2 px-3 font-medium">Market</th>
                <th className="py-2 px-3 font-medium">State</th>
                <th className="py-2 px-3 font-medium text-right">Modal Price</th>
                <th className="py-2 pl-3 font-medium">Source Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E9E4]">
              {daily_briefing.recently_updated_reports.map((rep, i) => (
                <tr key={`${rep.market}-${rep.commodity}-${rep.reporting_date}-${i}`} className="hover:bg-[#F7F9F6]">
                  <td className="py-2 pr-3 tabular-nums">{formatDateShort(rep.reporting_date)}</td>
                  <td className="py-2 px-3 font-medium">{rep.commodity}</td>
                  <td className="py-2 px-3">{rep.market}</td>
                  <td className="py-2 px-3 text-[#6C776F]">{rep.state}</td>
                  <td className="py-2 px-3 text-right font-semibold tabular-nums">
                    <div>{formatDisplayPrice(rep.modal_price, priceUnit)}</div>
                    <div className="text-[10.5px] font-normal text-[#6C776F]">
                      {formatSecondaryPrice(rep.modal_price, priceUnit)}
                    </div>
                  </td>
                  <td className="py-2 pl-3">
                    <FreshnessBadge status={rep.is_demo ? "Demo Dataset" : "Official Feed"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
