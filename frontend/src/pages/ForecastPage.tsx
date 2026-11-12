import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import {
  Card,
  ErrorBanner,
  LoadingState,
  SectionHeader,
} from "../components/UiPrimitives";
import type { FilterMetaResponse, ForecastResponse } from "../types/api";
import { formatDateShort, formatDualPrice, formatKgFromQuintal, formatQuintalPrice } from "../utils/format";

interface ForecastPageProps {
  filters: FilterMetaResponse | null;
  activeCommodity: string;
  onSelectCommodity: (commodity: string) => void;
}

export const ForecastPage: React.FC<ForecastPageProps> = ({
  filters,
  activeCommodity,
  onSelectCommodity,
}) => {
  const [commodity, setCommodity] = useState(activeCommodity || "Onion");
  const [marketId, setMarketId] = useState<string>("");
  const [variety, setVariety] = useState("All");
  const [lookbackDays, setLookbackDays] = useState(180);
  const [modelType, setModelType] = useState("moving_average");

  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCommodity) setCommodity(activeCommodity);
  }, [activeCommodity]);

  useEffect(() => {
    if (!marketId && filters?.markets?.length) {
      const lasalgaon = filters.markets.find((m) => m.name === "Lasalgaon");
      setMarketId(String((lasalgaon || filters.markets[0]).id));
    }
  }, [filters, marketId]);

  useEffect(() => {
    if (!commodity || !marketId) return;
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getForecast({
        commodity,
        market_id: Number(marketId),
        variety,
        lookback_days: lookbackDays,
        model_type: modelType,
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Forecast generation failed.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [commodity, marketId, variety, lookbackDays, modelType]);

  const varieties = filters?.varieties_by_commodity?.[commodity] || [];

  const combinedChartData = [
    ...(data?.historical || []).map((h) => ({
      date: h.date,
      observed_price: h.actual_price,
      predicted_price: null as number | null,
      band: null as [number, number] | null,
    })),
    ...(data?.forecast || []).map((f) => ({
      date: f.date,
      observed_price: null as number | null,
      predicted_price: f.predicted_price,
      band: [f.lower_bound, f.upper_bound] as [number, number],
    })),
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">
          Forecast & Selling Window Analysis
        </h1>
      </div>

      {/* Controls */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[12px] font-medium text-[#46544B] mb-1">Commodity</label>
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
            <label className="block text-[12px] font-medium text-[#46544B] mb-1">Market</label>
            <select
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
            >
              {(filters?.markets || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.state})
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
              Historical Window
            </label>
            <select
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
            >
              <option value={90}>Last 90 reports</option>
              <option value={180}>Last 180 reports</option>
              <option value={365}>Last 365 reports</option>
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#46544B] mb-1">Model</label>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[13px] border border-[#E3E9E4] rounded bg-white"
            >
              <option value="moving_average">Historical Moving Average (Baseline)</option>
              <option value="seasonal_baseline">Recent-Cycle Lagged Baseline</option>
              <option value="random_forest">Random Forest (Lagged Features)</option>
              <option value="gradient_boosting">Gradient Boosting (Lagged Features)</option>
            </select>
          </div>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingState label="Running chronological train/test evaluation..." />}

      {!loading && data && (
        <>
          {!data.sufficient_data ? (
            <Card className="p-6 border-l-4 border-l-[#C48A2C]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#C48A2C] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-[15px] font-semibold text-[#202B25]">
                    {data.message || "Insufficient historical data to generate a reliable forecast."}
                  </h2>
                  <p className="text-[13px] text-[#6C776F] mt-1">
                    Available reporting days: {data.available_days ?? 0}. Minimum required:{" "}
                    {data.minimum_required_days ?? 21} days for a leakage-free chronological split.
                    Try selecting a higher-coverage market or commodity.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {/* Evaluation Metrics */}
              {data.evaluation && data.training_period && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <Card className="p-3.5">
                    <div className="text-[12px] text-[#6C776F]">Selected Model</div>
                    <div className="text-[14px] font-semibold text-[#202B25] mt-1">
                      {data.model_name}
                    </div>
                    <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                      Horizon: {data.horizon_days} reporting days
                    </div>
                  </Card>

                  <Card className="p-3.5">
                    <div className="text-[12px] text-[#6C776F]">Holdout Error (MAE / RMSE)</div>
                    <div className="text-[16px] font-semibold text-[#176B45] tabular-nums mt-1">
                      ₹{data.evaluation.mae} / ₹{data.evaluation.rmse}/qtl
                    </div>
                    <div className="text-[11.5px] text-[#6C776F] mt-0.5 tabular-nums">
                      {formatKgFromQuintal(data.evaluation.mae)} /{" "}
                      {formatKgFromQuintal(data.evaluation.rmse)} · Tested on{" "}
                      {data.training_period.test_observations} days
                    </div>
                  </Card>

                  <Card className="p-3.5">
                    <div className="text-[12px] text-[#6C776F]">Baseline Comparison</div>
                    <div className="text-[15px] font-semibold text-[#202B25] tabular-nums mt-1">
                      MA MAE: ₹{data.evaluation.baseline_mae} (RMSE ₹{data.evaluation.baseline_rmse})
                    </div>
                    <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                      {data.evaluation.beats_baseline_mae
                        ? "Outperforms 7-day moving average on holdout"
                        : "Does not beat simple 7-day moving average on holdout"}
                    </div>
                  </Card>

                  <Card className="p-3.5">
                    <div className="text-[12px] text-[#6C776F]">Training Data Period</div>
                    <div className="text-[13.5px] font-semibold text-[#202B25] mt-1">
                      {formatDateShort(data.training_period.start)} –{" "}
                      {formatDateShort(data.training_period.end)}
                    </div>
                    <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                      {data.training_period.total_observations} total observations
                    </div>
                  </Card>
                </div>
              )}

              {/* Observed vs Predicted Chart */}
              <Card className="p-4">
                <SectionHeader
                  title={`Observed vs 7-Day Projected Modal Price — ${data.commodity} (${data.market})`}
                />
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={combinedChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6C776F" }} />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#6C776F" }}
                        tickFormatter={(v) => `₹${v}`}
                      />
                      <Tooltip
                        formatter={(v: number | number[]) =>
                          Array.isArray(v)
                            ? `${formatDualPrice(v[0])} – ${formatDualPrice(v[1])}`
                            : formatDualPrice(v)
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      <Area
                        type="monotone"
                        dataKey="band"
                        name="Uncertainty Interval"
                        stroke="none"
                        fill="#F2DCAD"
                        fillOpacity={0.45}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="observed_price"
                        name="Observed Modal Price"
                        stroke="#176B45"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted_price"
                        name="Projected Price (Uncertain)"
                        stroke="#C48A2C"
                        strokeDasharray="5 4"
                        strokeWidth={2.2}
                        dot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              {/* Forecast Table + Selling Window Observations */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <Card className="p-4 xl:col-span-6">
                  <SectionHeader title="7-Day Forecast Schedule" />
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                        <th className="py-2 pr-2 font-medium">Forecast Date</th>
                        <th className="py-2 px-2 font-medium text-right">Predicted</th>
                        <th className="py-2 px-2 font-medium text-right">Lower Bound</th>
                        <th className="py-2 pl-2 font-medium text-right">Upper Bound</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E9E4]">
                      {data.forecast.map((f) => (
                        <tr key={f.date}>
                          <td className="py-2 pr-2 tabular-nums">{formatDateShort(f.date)}</td>
                          <td className="py-2 px-2 text-right font-semibold text-[#C48A2C] tabular-nums">
                            <div>{formatQuintalPrice(f.predicted_price)}</div>
                            <div className="text-[10.5px] font-normal text-[#6C776F]">
                              {formatKgFromQuintal(f.predicted_price)}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right text-[#6C776F] tabular-nums">
                            <div>{formatQuintalPrice(f.lower_bound)}</div>
                            <div className="text-[10.5px]">{formatKgFromQuintal(f.lower_bound)}</div>
                          </td>
                          <td className="py-2 pl-2 text-right text-[#6C776F] tabular-nums">
                            <div>{formatQuintalPrice(f.upper_bound)}</div>
                            <div className="text-[10.5px]">{formatKgFromQuintal(f.upper_bound)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>

                <Card className="p-4 xl:col-span-6">
                  <SectionHeader title="Selling Window Observations" />
                  <ul className="space-y-2.5 text-[13px] text-[#202B25]">
                    {data.selling_window_observations.map((obs, idx) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-md bg-[#F7F9F6] border border-[#E3E9E4] leading-relaxed"
                      >
                        {obs}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
