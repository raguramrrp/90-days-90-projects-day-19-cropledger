import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "../api/client";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  SectionHeader,
  TooltipLabel,
} from "../components/UiPrimitives";
import type { FilterMetaResponse, PriceAdvisorResponse, UserSettings } from "../types/api";
import { formatDateShort, formatINR, formatKgFromQuintal, formatQuintalPrice } from "../utils/format";

interface PriceAdvisorPageProps {
  filters: FilterMetaResponse | null;
  settings: UserSettings | null;
  activeCommodity: string;
  onSelectCommodity: (commodity: string) => void;
}

export const PriceAdvisorPage: React.FC<PriceAdvisorPageProps> = ({
  filters,
  settings,
  activeCommodity,
  onSelectCommodity,
}) => {
  const [commodity, setCommodity] = useState(activeCommodity || "Onion");
  const [variety, setVariety] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [originMarketId, setOriginMarketId] = useState<string>("");
  const [compareMarketIds, setCompareMarketIds] = useState<number[]>([]);

  // User-entered What-If Assumptions
  const [quantity, setQuantity] = useState<number>(settings?.default_quantity_quintals ?? 25);
  const [transportMode, setTransportMode] = useState<"per_km" | "fixed">("per_km");
  const [transportPerKm, setTransportPerKm] = useState<number>(settings?.transport_cost_per_km ?? 18);
  const [transportFixed, setTransportFixed] = useState<number>(1800);
  const [commissionMode, setCommissionMode] = useState<"percentage" | "fixed">("percentage");
  const [commissionPct, setCommissionPct] = useState<number>(settings?.default_commission_pct ?? 2.5);
  const [commissionFixed, setCommissionFixed] = useState<number>(1200);
  const [otherExpenses, setOtherExpenses] = useState<number>(settings?.default_handling_cost ?? 350);

  const [result, setResult] = useState<PriceAdvisorResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCommodity) setCommodity(activeCommodity);
  }, [activeCommodity]);

  useEffect(() => {
    if (settings) {
      setQuantity(settings.default_quantity_quintals);
      setTransportPerKm(settings.transport_cost_per_km);
      setCommissionPct(settings.default_commission_pct);
      setOtherExpenses(settings.default_handling_cost);
    }
  }, [settings]);

  // Default origin market to Lasalgaon / first market when filters load
  useEffect(() => {
    if (!originMarketId && filters?.markets?.length) {
      const lasalgaon = filters.markets.find((m) => m.name === "Lasalgaon");
      setOriginMarketId(String((lasalgaon || filters.markets[0]).id));
    }
  }, [filters, originMarketId]);

  const runCalculation = () => {
    if (!commodity || quantity <= 0) return;
    setLoading(true);
    setError(null);
    api
      .calculatePriceAdvisor({
        commodity,
        variety,
        state: stateFilter,
        district: districtFilter,
        origin_market_id: originMarketId ? Number(originMarketId) : null,
        market_ids: compareMarketIds.length > 0 ? compareMarketIds : undefined,
        quantity_quintals: quantity,
        transport_mode: transportMode,
        transport_cost_per_km: transportPerKm,
        transport_cost_fixed: transportMode === "fixed" ? transportFixed : null,
        commission_mode: commissionMode,
        commission_pct: commissionPct,
        commission_fixed: commissionMode === "fixed" ? commissionFixed : null,
        other_expenses: otherExpenses,
        limit: 12,
      })
      .then((res) => setResult(res))
      .catch((err) => setError(err instanceof Error ? err.message : "Calculation failed."))
      .finally(() => setLoading(false));
  };

  // Immediate live recalculation when user adjusts any What-If parameter
  useEffect(() => {
    const timer = setTimeout(() => {
      runCalculation();
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    commodity,
    variety,
    stateFilter,
    districtFilter,
    originMarketId,
    compareMarketIds,
    quantity,
    transportMode,
    transportPerKm,
    transportFixed,
    commissionMode,
    commissionPct,
    commissionFixed,
    otherExpenses,
  ]);

  const varieties = filters?.varieties_by_commodity?.[commodity] || [];
  const districts =
    stateFilter !== "All" ? filters?.districts_by_state?.[stateFilter] || [] : [];

  const toggleMarketSelection = (id: number) => {
    setCompareMarketIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">
          Net-Return Price Advisor
        </h1>
      </div>

      {/* Inputs & What-If Calculator Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="p-4 xl:col-span-4 space-y-4">
          <SectionHeader title="Crop & Market Assumptions" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Commodity
              </label>
              <select
                value={commodity}
                onChange={(e) => {
                  setCommodity(e.target.value);
                  setVariety("All");
                  setCompareMarketIds([]);
                  onSelectCommodity(e.target.value);
                }}
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white"
              >
                {(filters?.commodities || []).map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Variety
              </label>
              <select
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white"
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
                Target State Filter
              </label>
              <select
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value);
                  setDistrictFilter("All");
                }}
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white"
              >
                <option value="All">All States</option>
                {(filters?.states || []).map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Target District Filter
              </label>
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                disabled={stateFilter === "All"}
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white disabled:bg-[#F7F9F6]"
              >
                <option value="All">All Districts</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                <TooltipLabel
                  label="Origin Location (for Road Distance Estimate)"
                  hint="Estimates distance to destination APMCs using verified coordinates where available."
                />
              </label>
              <select
                value={originMarketId}
                onChange={(e) => setOriginMarketId(e.target.value)}
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white"
              >
                <option value="">No origin selected (use 35 km local assumption)</option>
                {(filters?.markets || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.district}, {m.state})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E3E9E4] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#202B25]">
                What-If Expense Calculator
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-[#EAF3EC] text-[#176B45] font-medium">
                User-Entered Assumptions
              </span>
            </div>

            <div>
              <div className="flex justify-between text-[12px] mb-1">
                <label className="font-medium text-[#46544B]">Produce Quantity (Quintals)</label>
                <span className="font-semibold tabular-nums">{quantity} qtl</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={200}
                  step={1}
                  value={Math.min(quantity, 200)}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="flex-1 accent-[#176B45]"
                />
                <input
                  type="number"
                  min={1}
                  max={50000}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 px-2 py-1 text-[12.5px] border border-[#E3E9E4] rounded text-right tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[12px] font-medium text-[#46544B]">Transport Cost</label>
                  <select
                    aria-label="Transport calculation mode"
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value as "per_km" | "fixed")}
                    className="text-[11.5px] border border-[#E3E9E4] rounded px-1.5 py-0.5 bg-[#F7F9F6]"
                  >
                    <option value="per_km">₹ / km</option>
                    <option value="fixed">Fixed ₹</option>
                  </select>
                </div>
                {transportMode === "per_km" ? (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={transportPerKm}
                    onChange={(e) => setTransportPerKm(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
                  />
                ) : (
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={transportFixed}
                    onChange={(e) => setTransportFixed(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[12px] font-medium text-[#46544B]">Mandi Commission</label>
                  <select
                    aria-label="Commission calculation mode"
                    value={commissionMode}
                    onChange={(e) => setCommissionMode(e.target.value as "percentage" | "fixed")}
                    className="text-[11.5px] border border-[#E3E9E4] rounded px-1.5 py-0.5 bg-[#F7F9F6]"
                  >
                    <option value="percentage">% of Gross</option>
                    <option value="fixed">Fixed ₹</option>
                  </select>
                </div>
                {commissionMode === "percentage" ? (
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.25}
                    value={commissionPct}
                    onChange={(e) => setCommissionPct(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
                  />
                ) : (
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={commissionFixed}
                    onChange={(e) => setCommissionFixed(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
                  />
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[12px] mb-1">
                <label className="font-medium text-[#46544B]">
                  Other Handling / Loading / Weighing Expenses (₹)
                </label>
                <span className="font-semibold tabular-nums">{formatINR(otherExpenses)}</span>
              </div>
              <input
                type="number"
                min={0}
                step={50}
                value={otherExpenses}
                onChange={(e) => setOtherExpenses(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
              />
            </div>

            {/* Optional Up to 4 Markets Filter */}
            <div className="pt-2 border-t border-[#E3E9E4]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-[#46544B]">
                  Compare Specific Markets (up to 4)
                </span>
                {compareMarketIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCompareMarketIds([])}
                    className="text-[11.5px] text-[#176B45] hover:underline"
                  >
                    Clear ({compareMarketIds.length})
                  </button>
                )}
              </div>
              <div className="max-h-28 overflow-y-auto border border-[#E3E9E4] rounded-md p-2 flex flex-wrap gap-1.5 bg-[#F7F9F6]">
                {(filters?.markets || []).map((m) => {
                  const selected = compareMarketIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMarketSelection(m.id)}
                      className={`px-2 py-1 text-[11.5px] rounded border ${
                        selected
                          ? "bg-[#176B45] text-white border-[#176B45]"
                          : "bg-white text-[#46544B] border-[#E3E9E4] hover:border-[#176B45]"
                      }`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Ranked Output & Explanation */}
        <div className="xl:col-span-8 space-y-4 min-w-0">
          {error && <ErrorBanner message={error} />}

          {result && (
            <>
              {/* Dynamic Recommendation Explanation */}
              <Card className="p-4 border-l-4 border-l-[#176B45]">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#176B45] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[13px] font-semibold text-[#124D35]">
                      Net Return Summary
                    </div>
                    <p className="text-[13px] text-[#202B25] mt-1 leading-relaxed">
                      {result.explanation}
                    </p>
                  </div>
                </div>
              </Card>

              {result.date_mismatch_warning && (
                <div className="px-3.5 py-2.5 rounded-lg border border-[#F2DCAD] bg-[#FEF7EA] text-[12.5px] text-[#785110] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#C48A2C]" />
                  <span>
                    <strong>Reporting Date Mismatch:</strong> Compared markets have latest reports on
                    different dates ({result.reporting_dates.map(formatDateShort).join(", ")}). Do not
                    treat prices from different days as strictly equivalent.
                  </span>
                </div>
              )}

              {loading && !result.ranked_markets.length ? (
                <LoadingState label="Calculating net returns..." />
              ) : result.ranked_markets.length === 0 ? (
                <EmptyState
                  title="No matching market quotes"
                  description="Try clearing the State/District filter or selecting 'All Varieties' to view available markets."
                />
              ) : (
                <Card className="p-4">
                  <SectionHeader
                    title={`Market Ranking for ${result.commodity} (${result.quantity_quintals} qtl)`}
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                          <th className="py-2 pr-1.5 font-medium">Rank</th>
                          <th className="py-2 px-1.5 font-medium">Market</th>
                          <th className="py-2 px-1.5 font-medium text-right">Modal</th>
                          <th className="py-2 px-1.5 font-medium text-right">Gross</th>
                          <th className="py-2 px-1.5 font-medium text-right">Transport</th>
                          <th className="py-2 px-1.5 font-medium text-right">Comm.</th>
                          <th className="py-2 px-1.5 font-medium text-right">Other</th>
                          <th className="py-2 px-1.5 font-medium text-right">Est. Net Return</th>
                          <th className="py-2 pl-1.5 font-medium whitespace-nowrap">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E3E9E4]">
                        {result.ranked_markets.map((row) => (
                          <tr
                            key={row.market_id}
                            className={row.rank === 1 ? "bg-[#EAF3EC]/45" : "hover:bg-[#F7F9F6]"}
                          >
                            <td className="py-2.5 pr-1.5 font-semibold tabular-nums">#{row.rank}</td>
                            <td className="py-2.5 px-1.5">
                              <div className="font-medium text-[#202B25]">{row.market_name}</div>
                              <div className="text-[11px] text-[#6C776F]">
                                {row.state} · {row.variety}
                              </div>
                              <div className="text-[11px] text-[#6C776F]">{row.transport_note}</div>
                            </td>
                            <td className="py-2.5 px-1.5 text-right tabular-nums whitespace-nowrap">
                              <div>{formatQuintalPrice(row.modal_price)}</div>
                              <div className="text-[10.5px] text-[#6C776F]">
                                {formatKgFromQuintal(row.modal_price)}
                              </div>
                            </td>
                            <td className="py-2.5 px-1.5 text-right tabular-nums whitespace-nowrap">
                              {formatINR(row.gross_revenue)}
                            </td>
                            <td className="py-2.5 px-1.5 text-right text-[#C45A50] tabular-nums whitespace-nowrap">
                              −{formatINR(row.transport_cost)}
                            </td>
                            <td className="py-2.5 px-1.5 text-right text-[#C45A50] tabular-nums whitespace-nowrap">
                              −{formatINR(row.commission_amount)}
                            </td>
                            <td className="py-2.5 px-1.5 text-right text-[#C45A50] tabular-nums whitespace-nowrap">
                              −{formatINR(row.other_expenses)}
                            </td>
                            <td className="py-2.5 px-1.5 text-right font-semibold text-[#176B45] tabular-nums whitespace-nowrap">
                              {formatINR(row.estimated_net_return)}
                              <div className="text-[10.5px] font-normal text-[#6C776F]">
                                {formatQuintalPrice(row.net_price_per_quintal)} ·{" "}
                                {formatKgFromQuintal(row.net_price_per_quintal)} net
                              </div>
                            </td>
                            <td className="py-2.5 pl-1.5 text-[11.5px] text-[#6C776F] tabular-nums whitespace-nowrap">
                              {formatDateShort(row.reporting_date)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
