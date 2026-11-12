import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
} from "../components/UiPrimitives";
import type { FilterMetaResponse, MarketComparisonResponse, UserSettings } from "../types/api";
import {
  formatDateShort,
  formatDualPrice,
  formatINR,
  formatKgFromQuintal,
  formatNumber,
  formatPct,
  formatQuintalPrice,
} from "../utils/format";

interface MarketComparisonPageProps {
  filters: FilterMetaResponse | null;
  settings: UserSettings | null;
  activeCommodity: string;
  onSelectCommodity: (commodity: string) => void;
}

const LINE_COLORS = ["#176B45", "#C48A2C", "#3A6EA5", "#8B5E3C"];

export const MarketComparisonPage: React.FC<MarketComparisonPageProps> = ({
  filters,
  settings,
  activeCommodity,
  onSelectCommodity,
}) => {
  const [commodity, setCommodity] = useState(activeCommodity || "Onion");
  const [variety, setVariety] = useState("All");
  const [selectedMarketIds, setSelectedMarketIds] = useState<number[]>([]);
  const [originMarketId, setOriginMarketId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(settings?.default_quantity_quintals ?? 25);
  const [days, setDays] = useState<number>(60);

  const [data, setData] = useState<MarketComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCommodity) setCommodity(activeCommodity);
  }, [activeCommodity]);

  // Seed 3-4 sensible default markets on initial load
  useEffect(() => {
    if (filters?.markets?.length && selectedMarketIds.length === 0) {
      const defaults = filters.markets
        .filter((m) =>
          ["Lasalgaon", "Pune", "Vashi (Mumbai)", "Indore", "Azadpur", "Kolar"].includes(m.name)
        )
        .slice(0, 4)
        .map((m) => m.id);
      if (defaults.length > 0) {
        setSelectedMarketIds(defaults);
        setOriginMarketId(String(defaults[0]));
      }
    }
  }, [filters, selectedMarketIds.length]);

  useEffect(() => {
    if (!commodity || selectedMarketIds.length === 0) return;
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getMarketComparison({
        commodity,
        variety,
        market_ids: selectedMarketIds.join(","),
        origin_market_id: originMarketId ? Number(originMarketId) : undefined,
        quantity_quintals: quantity,
        transport_cost_per_km: settings?.transport_cost_per_km ?? 18,
        commission_pct: settings?.default_commission_pct ?? 2.5,
        other_expenses: settings?.default_handling_cost ?? 350,
        days,
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to compare markets.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [commodity, variety, selectedMarketIds, originMarketId, quantity, days, settings]);

  const toggleMarket = (id: number) => {
    setSelectedMarketIds((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const varieties = filters?.varieties_by_commodity?.[commodity] || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">
          Side-by-Side Market Comparison
        </h1>
      </div>

      {/* Selection Controls */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[12px] font-medium text-[#46544B] mb-1">Crop</label>
            <select
              value={commodity}
              onChange={(e) => {
                setCommodity(e.target.value);
                setVariety("All");
                onSelectCommodity(e.target.value);
              }}
              className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
            >
              {(filters?.commodities || []).map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#46544B] mb-1">Variety</label>
            <select
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
            >
              <option value="All">All Varieties</option>
              {varieties.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#46544B] mb-1">
              Origin Market (for transport)
            </label>
            <select
              value={originMarketId}
              onChange={(e) => setOriginMarketId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
            >
              <option value="">35 km default</option>
              {(filters?.markets || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.state})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#46544B] mb-1">
              Quantity (Quintals)
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded tabular-nums"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#46544B] mb-1">
              Historical Window
            </label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
            >
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
            </select>
          </div>
        </div>

        <div>
          <div className="text-[12px] font-medium text-[#46544B] mb-1.5">
            Select up to 4 markets to compare ({selectedMarketIds.length}/4 selected)
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 border border-[#E3E9E4] rounded bg-[#F7F9F6]">
            {(filters?.markets || []).map((m) => {
              const active = selectedMarketIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMarket(m.id)}
                  className={`px-2.5 py-1 text-[12px] rounded border ${
                    active
                      ? "bg-[#176B45] text-white border-[#176B45]"
                      : "bg-white text-[#46544B] border-[#E3E9E4] hover:border-[#176B45]"
                  }`}
                >
                  {m.name} ({m.state})
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingState label="Building side-by-side comparison..." />}

      {!loading && data && data.empty && (
        <EmptyState
          title="No overlapping market data"
          description={`None of the selected markets have price reports for ${commodity}. Select markets where ${commodity} is traded.`}
        />
      )}

      {!loading && data && !data.empty && (
        <>
          {data.date_mismatch_warning && (
            <div className="px-3.5 py-2.5 rounded-lg border border-[#F2DCAD] bg-[#FEF7EA] text-[12.5px] text-[#785110] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#C48A2C]" />
              <span>
                Reporting dates differ across compared markets ({data.reporting_dates.map(formatDateShort).join(", ")}).
              </span>
            </div>
          )}

          {/* Separate Outcome Summary */}
          {data.summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="text-[12px] text-[#6C776F]">Highest Reported Modal Price</div>
                <div className="text-[17px] font-semibold text-[#202B25] mt-1">
                  {data.summary.highest_reported_price_market.market_name} —{" "}
                  <span className="tabular-nums">
                    {formatQuintalPrice(data.summary.highest_reported_price_market.modal_price)}
                  </span>
                </div>
                <div className="text-[12px] text-[#176B45] font-medium tabular-nums mt-0.5">
                  {formatKgFromQuintal(data.summary.highest_reported_price_market.modal_price)}
                </div>
                <div className="text-[12px] text-[#6C776F] mt-0.5">
                  Report date: {formatDateShort(data.summary.highest_reported_price_market.reporting_date)}
                </div>
              </Card>

              <Card className="p-4 border-l-4 border-l-[#176B45]">
                <div className="text-[12px] text-[#176B45] font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Best Estimated Net Return ({quantity} qtl)
                </div>
                <div className="text-[17px] font-semibold text-[#124D35] mt-1">
                  {data.summary.best_net_return_market.market_name} —{" "}
                  <span className="tabular-nums">
                    {formatINR(data.summary.best_net_return_market.estimated_net_return)}
                  </span>
                </div>
                <div className="text-[12px] text-[#6C776F] mt-0.5">
                  {data.summary.outcomes_differ
                    ? "Note: Best net-return market differs from highest headline modal price due to transport/cost assumptions."
                    : "Leads on both reported modal price and estimated net return."}
                </div>
              </Card>
            </div>
          )}

          {/* Side-by-Side Comparison Table */}
          <Card className="p-4">
            <SectionHeader title="Comparison Matrix" />
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                    <th className="py-2 pr-3 font-medium">Market</th>
                    <th className="py-2 px-2 font-medium text-right">Modal Price</th>
                    <th className="py-2 px-2 font-medium text-right">Min – Max</th>
                    <th className="py-2 px-2 font-medium text-right">Hist. Avg</th>
                    <th className="py-2 px-2 font-medium text-right">Move</th>
                    <th className="py-2 px-2 font-medium text-right">Diff vs Lowest</th>
                    <th className="py-2 px-2 font-medium text-right">Arrivals</th>
                    <th className="py-2 px-2 font-medium text-right">Est. Transport</th>
                    <th className="py-2 px-2 font-medium text-right">Est. Net Return</th>
                    <th className="py-2 pl-2 font-medium">Report Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E9E4]">
                  {data.markets.map((m) => (
                    <tr key={m.market_id} className="hover:bg-[#F7F9F6]">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-[#202B25]">{m.market_name}</div>
                        <div className="text-[11px] text-[#6C776F]">{m.state}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                        <div>{formatQuintalPrice(m.modal_price)}</div>
                        <div className="text-[10.5px] font-normal text-[#6C776F]">
                          {formatKgFromQuintal(m.modal_price)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right text-[#6C776F] tabular-nums">
                        <div>
                          {formatINR(m.min_price)} – {formatINR(m.max_price)}
                        </div>
                        <div className="text-[10.5px]">
                          {formatKgFromQuintal(m.min_price)} – {formatKgFromQuintal(m.max_price)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums">
                        <div>{formatQuintalPrice(m.historical_avg)}</div>
                        <div className="text-[10.5px] text-[#6C776F]">
                          {formatKgFromQuintal(m.historical_avg)}
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right tabular-nums font-medium ${
                          (m.movement_pct || 0) > 0
                            ? "text-[#176B45]"
                            : (m.movement_pct || 0) < 0
                            ? "text-[#C45A50]"
                            : "text-[#6C776F]"
                        }`}
                      >
                        {formatPct(m.movement_pct)}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums">
                        {formatPct(m.price_diff_vs_lowest_pct)}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-[#6C776F]">
                        {m.arrival_quantity !== null ? `${formatNumber(m.arrival_quantity)} t` : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-[#C45A50]">
                        {formatINR(m.estimated_transport_cost)}
                        <div className="text-[10.5px] text-[#6C776F]">~{m.estimated_distance_km} km</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-[#176B45] tabular-nums">
                        {formatINR(m.estimated_net_return)}
                      </td>
                      <td className="py-2.5 pl-2 text-[#6C776F] tabular-nums">
                        {formatDateShort(m.reporting_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Horizontal Bar Chart + Historical Line Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <Card className="p-4 xl:col-span-5">
              <SectionHeader
                title={`Estimated Net Return (${quantity} qtl)`}
              />
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.markets} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#6C776F" }} tickFormatter={(v) => `₹${v}`} />
                    <YAxis type="category" dataKey="market_name" width={115} tick={{ fontSize: 11.5 }} />
                    <Tooltip formatter={(v: number) => formatINR(v)} />
                    <Bar dataKey="estimated_net_return" name="Est. Net Return" fill="#176B45" radius={[0, 3, 3, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 xl:col-span-7">
              <SectionHeader
                title={`Historical Modal Price Trajectory (${days}D)`}
              />
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.historical_series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6C776F" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6C776F" }} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip formatter={(v: number) => formatDualPrice(v)} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    {data.markets.map((m, idx) => (
                      <Line
                        key={m.market_id}
                        type="monotone"
                        dataKey={m.market_name}
                        stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
