import React, { useEffect, useState } from "react";
import { Bell, Check, Info, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import {
  Card,
  ErrorBanner,
  FreshnessBadge,
  LoadingState,
  SectionHeader,
} from "../components/UiPrimitives";
import type { AlertsResponse, FilterMetaResponse, WatchlistItem } from "../types/api";
import { formatDateShort, formatKgFromQuintal, formatPct, formatQuintalPrice } from "../utils/format";

interface WatchlistAlertsPageProps {
  filters: FilterMetaResponse | null;
}

const CONDITION_LABELS: Record<string, string> = {
  price_above: "Modal price above (₹/qtl)",
  price_below: "Modal price below (₹/qtl)",
  pct_increase: "Percentage increase ≥ (%)",
  pct_decrease: "Percentage decrease ≥ (%)",
  significant_movement: "Significant price movement ± (%)",
};

export const WatchlistAlertsPage: React.FC<WatchlistAlertsPageProps> = ({ filters }) => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Add Watchlist Form
  const [watchCommodityId, setWatchCommodityId] = useState<string>("");
  const [watchMarketId, setWatchMarketId] = useState<string>("");

  // Add Alert Form
  const [alertCommodityId, setAlertCommodityId] = useState<string>("");
  const [alertMarketId, setAlertMarketId] = useState<string>("");
  const [condition, setCondition] = useState<string>("price_above");
  const [threshold, setThreshold] = useState<string>("2500");

  useEffect(() => {
    if (filters?.commodities?.length) {
      if (!watchCommodityId) setWatchCommodityId(String(filters.commodities[0].id));
      if (!alertCommodityId) setAlertCommodityId(String(filters.commodities[0].id));
    }
  }, [filters, watchCommodityId, alertCommodityId]);

  const loadAll = () => {
    setLoading(true);
    setError(null);
    Promise.all([api.getWatchlist(), api.getAlerts()])
      .then(([wRes, aRes]) => {
        setWatchlist(wRes.items);
        setAlerts(aRes);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load watchlist & alerts."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!watchCommodityId) return;
    try {
      await api.addWatchlist({
        commodity_id: Number(watchCommodityId),
        market_id: watchMarketId ? Number(watchMarketId) : null,
      });
      setFeedback("Watchlist updated.");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to watchlist.");
    }
  };

  const handleDeleteWatchlist = async (id: number) => {
    if (!window.confirm("Remove this crop/market from your watchlist?")) return;
    try {
      await api.deleteWatchlist(id);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove watchlist entry.");
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertCommodityId || Number(threshold) <= 0) return;
    try {
      const res = await api.createAlert({
        commodity_id: Number(alertCommodityId),
        market_id: alertMarketId ? Number(alertMarketId) : null,
        condition,
        threshold_value: Number(threshold),
      });
      setFeedback(
        `Price alert created (${res.newly_triggered_count} matching event(s) detected immediately).`
      );
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alert.");
    }
  };

  const handleToggleAlert = async (id: number, current: boolean) => {
    await api.toggleAlert(id, !current);
    loadAll();
  };

  const handleDeleteAlert = async (id: number) => {
    if (!window.confirm("Delete this price alert rule?")) return;
    await api.deleteAlert(id);
    loadAll();
  };

  const handleAcknowledge = async (eventId: number) => {
    await api.acknowledgeAlertEvent(eventId);
    loadAll();
  };

  if (loading && !alerts) return <LoadingState label="Loading watchlist and alert rules..." />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">
          Watchlist & Price Alerts
        </h1>
      </div>

      {error && <ErrorBanner message={error} />}
      {feedback && (
        <div className="px-3.5 py-2.5 rounded-lg border border-[#CBE2D1] bg-[#EAF3EC] text-[12.5px] text-[#124D35]">
          {feedback}
        </div>
      )}

      {/* Watchlist Section */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="p-4 xl:col-span-4">
          <SectionHeader title="Follow Crop & Market" />
          <form onSubmit={handleAddWatchlist} className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">Crop</label>
              <select
                value={watchCommodityId}
                onChange={(e) => setWatchCommodityId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
              >
                {(filters?.commodities || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Preferred Market
              </label>
              <select
                value={watchMarketId}
                onChange={(e) => setWatchMarketId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
              >
                <option value="">All Reporting Markets</option>
                {(filters?.markets || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.state})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-md bg-[#176B45] text-white hover:bg-[#124D35]"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Watchlist</span>
            </button>
          </form>
        </Card>

        <Card className="p-4 xl:col-span-8">
          <SectionHeader title="Followed Crops & Markets" />
          {watchlist.length === 0 ? (
            <p className="text-[13px] text-[#6C776F] py-6 text-center">
              Your watchlist is empty. Add a crop on the left.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                    <th className="py-2 pr-2 font-medium">Crop</th>
                    <th className="py-2 px-2 font-medium">Market</th>
                    <th className="py-2 px-2 font-medium text-right">Latest Modal</th>
                    <th className="py-2 px-2 font-medium text-right">Move</th>
                    <th className="py-2 px-2 font-medium">Freshness</th>
                    <th className="py-2 pl-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E9E4]">
                  {watchlist.map((w) => (
                    <tr key={w.id} className="hover:bg-[#F7F9F6]">
                      <td className="py-2.5 pr-2 font-medium">{w.commodity}</td>
                      <td className="py-2.5 px-2">
                        {w.market}
                        {w.reporting_date && (
                          <span className="block text-[11px] text-[#6C776F]">
                            {formatDateShort(w.reporting_date)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                        <div>{formatQuintalPrice(w.latest_modal_price)}</div>
                        <div className="text-[10.5px] font-normal text-[#6C776F]">
                          {formatKgFromQuintal(w.latest_modal_price)}
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-medium tabular-nums ${
                          (w.movement_pct || 0) > 0
                            ? "text-[#176B45]"
                            : (w.movement_pct || 0) < 0
                            ? "text-[#C45A50]"
                            : "text-[#6C776F]"
                        }`}
                      >
                        {formatPct(w.movement_pct)}
                      </td>
                      <td className="py-2.5 px-2">
                        <FreshnessBadge status={w.freshness} />
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteWatchlist(w.id)}
                          className="p-1 text-[#6C776F] hover:text-[#C45A50]"
                          aria-label={`Remove ${w.commodity}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Price Alerts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="p-4 xl:col-span-4 space-y-3">
          <SectionHeader title="Create Price Alert" />
          <form onSubmit={handleCreateAlert} className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">Crop</label>
              <select
                value={alertCommodityId}
                onChange={(e) => setAlertCommodityId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
              >
                {(filters?.commodities || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">Market</label>
              <select
                value={alertMarketId}
                onChange={(e) => setAlertMarketId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
              >
                <option value="">Any Reporting Market</option>
                {(filters?.markets || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.state})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
              >
                {Object.entries(CONDITION_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Threshold ({condition.startsWith("price") ? "₹/quintal" : "%"})
              </label>
              <input
                type="number"
                min={0.1}
                step={condition.startsWith("price") ? 50 : 0.5}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded tabular-nums"
              />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-md bg-[#176B45] text-white hover:bg-[#124D35]"
            >
              <Bell className="w-4 h-4" />
              <span>Save Alert Rule</span>
            </button>
          </form>

          {alerts?.delivery_note && (
            <p className="text-[11.5px] text-[#6C776F] pt-2 border-t border-[#E3E9E4] flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{alerts.delivery_note}</span>
            </p>
          )}
        </Card>

        <div className="xl:col-span-8 space-y-4">
          <Card className="p-4">
            <SectionHeader title="Alert Centre" />
            {!alerts || alerts.events.length === 0 ? (
              <p className="text-[13px] text-[#6C776F] py-5 text-center">
                No alert conditions have triggered on the latest market reports.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                      <th className="py-2 pr-2 font-medium">Crop & Market</th>
                      <th className="py-2 px-2 font-medium text-right">Triggered Price</th>
                      <th className="py-2 px-2 font-medium">Report Date</th>
                      <th className="py-2 px-2 font-medium">Trigger Reason</th>
                      <th className="py-2 pl-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E9E4]">
                    {alerts.events.map((ev) => (
                      <tr key={ev.id} className={ev.acknowledged ? "opacity-65" : ""}>
                        <td className="py-2.5 pr-2">
                          <div className="font-medium">{ev.commodity}</div>
                          <div className="text-[11px] text-[#6C776F]">{ev.market}</div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold text-[#176B45] tabular-nums">
                          <div>{formatQuintalPrice(ev.triggered_price)}</div>
                          <div className="text-[10.5px] font-normal text-[#6C776F]">
                            {formatKgFromQuintal(ev.triggered_price)}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 tabular-nums">
                          {formatDateShort(ev.reporting_date)}
                        </td>
                        <td className="py-2.5 px-2 text-[#202B25]">{ev.trigger_reason}</td>
                        <td className="py-2.5 pl-2 text-right">
                          {ev.acknowledged ? (
                            <span className="text-[11.5px] text-[#6C776F]">Reviewed</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAcknowledge(ev.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11.5px] rounded border border-[#CBE2D1] bg-[#EAF3EC] text-[#176B45]"
                            >
                              <Check className="w-3 h-3" />
                              <span>Acknowledge</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionHeader title="Configured Alert Rules" />
            {!alerts || alerts.rules.length === 0 ? (
              <p className="text-[13px] text-[#6C776F]">No alert rules defined.</p>
            ) : (
              <div className="space-y-2">
                {alerts.rules.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded border border-[#E3E9E4] text-[12.5px]"
                  >
                    <div>
                      <span className="font-medium">{r.commodity}</span> · {r.market} —{" "}
                      <span className="text-[#46544B]">
                        {CONDITION_LABELS[r.condition] || r.condition}:{" "}
                        <strong className="tabular-nums">
                          {r.condition.startsWith("price")
                            ? `${formatQuintalPrice(r.threshold_value)} (${formatKgFromQuintal(r.threshold_value)})`
                            : `${r.threshold_value}%`}
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleAlert(r.id, r.is_active)}
                        className={`px-2 py-0.5 text-[11.5px] rounded border ${
                          r.is_active
                            ? "bg-[#EAF3EC] text-[#176B45] border-[#CBE2D1]"
                            : "bg-[#F3F5F3] text-[#6C776F] border-[#E3E9E4]"
                        }`}
                      >
                        {r.is_active ? "Active" : "Paused"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAlert(r.id)}
                        className="p-1 text-[#6C776F] hover:text-[#C45A50]"
                        aria-label="Delete rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
