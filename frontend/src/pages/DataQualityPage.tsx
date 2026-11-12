import React, { useEffect, useState } from "react";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import { api } from "../api/client";
import {
  Card,
  ErrorBanner,
  FreshnessBadge,
  LoadingState,
  SectionHeader,
  SourceBanner,
} from "../components/UiPrimitives";
import type { DataQualityResponse } from "../types/api";
import { formatDateShort, formatTimestamp } from "../utils/format";

interface DataQualityPageProps {
  onDataChanged: () => void;
}

export const DataQualityPage: React.FC<DataQualityPageProps> = ({ onDataChanged }) => {
  const [data, setData] = useState<DataQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    api
      .getDataQuality()
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load data quality audit."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.importCsv(file, "Official/User CSV Upload");
      setMessage(
        `CSV processed: ${res.imported_records} imported, ${res.duplicate_records} duplicates skipped, ${res.rejected_records} rejected.`
      );
      loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleApiRefresh = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.refreshAgmarknet();
      setMessage(res.message);
      loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AGMARKNET refresh failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearDemo = async () => {
    if (!window.confirm("Remove all clearly labelled demo records from the database?")) return;
    setBusy(true);
    try {
      const res = await api.clearDemoData();
      setMessage(`Removed ${res.deleted_demo_records} demo records.`);
      loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear demo records.");
    } finally {
      setBusy(false);
    }
  };

  const handleSeedDemo = async () => {
    setBusy(true);
    try {
      const res = await api.seedDemoData();
      setMessage(res.seeded ? "Demo dataset seeded." : res.message || "Database already populated.");
      loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed demo dataset.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <LoadingState label="Auditing data quality and import logs..." />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">
            Data Quality Centre
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium rounded-md border border-[#E3E9E4] bg-white text-[#202B25] hover:border-[#176B45] cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV Dataset</span>
            <input
              type="file"
              accept=".csv"
              disabled={busy}
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <button
            type="button"
            disabled={busy}
            onClick={handleApiRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium rounded-md bg-[#176B45] text-white hover:bg-[#124D35] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
            <span>Sync data.gov.in AGMARKNET</span>
          </button>

          {data && data.source_status.demo_records > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleClearDemo}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium rounded-md border border-[#F0CBC7] bg-white text-[#B3463D] hover:bg-[#FDF1F0]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Demo Records</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={handleSeedDemo}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium rounded-md border border-[#E3E9E4] bg-white text-[#202B25] hover:border-[#176B45]"
            >
              <span>Load Demo Dataset</span>
            </button>
          )}
        </div>
      </div>

      {data && <SourceBanner status={data.source_status} />}
      {error && <ErrorBanner message={error} />}
      {message && (
        <div className="px-3.5 py-2.5 rounded-lg border border-[#CBE2D1] bg-[#EAF3EC] text-[12.5px] text-[#124D35]">
          {message}
        </div>
      )}

      {data && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Total Stored Records</div>
              <div className="text-[18px] font-semibold text-[#202B25] tabular-nums mt-1">
                {data.source_status.total_records.toLocaleString("en-IN")}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                Official: {data.source_status.official_records.toLocaleString("en-IN")} · Demo:{" "}
                {data.source_status.demo_records.toLocaleString("en-IN")}
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Latest Reporting Date</div>
              <div className="text-[17px] font-semibold text-[#176B45] mt-1">
                {formatDateShort(data.source_status.latest_reporting_date)}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                Last refresh: {formatTimestamp(data.source_status.last_refreshed_at)}
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">Recently Updated Markets</div>
              <div className="text-[18px] font-semibold text-[#176B45] tabular-nums mt-1">
                {data.freshness_summary["Recently updated"] ?? 0} / {data.total_markets}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                Delayed: {data.freshness_summary.Delayed ?? 0} · Stale:{" "}
                {data.freshness_summary.Stale ?? 0}
              </div>
            </Card>

            <Card className="p-3.5">
              <div className="text-[12px] text-[#6C776F]">data.gov.in API Connector</div>
              <div className="text-[15px] font-semibold text-[#202B25] mt-1.5">
                {data.source_status.api_key_configured ? "Key Configured" : "Fallback Mode (No Key)"}
              </div>
              <div className="text-[11.5px] text-[#6C776F] mt-0.5">
                Resource 9ef84268-d588-465a-a308-a864a43d0070
              </div>
            </Card>
          </div>

          {/* Freshness Rules & Stale Markets */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <Card className="p-4 xl:col-span-5">
              <SectionHeader title="Data Freshness Status Rules" />
              <div className="space-y-2.5 text-[12.5px]">
                {data.freshness_rules.map((r) => (
                  <div key={r.label} className="p-2.5 rounded border border-[#E3E9E4] bg-[#F7F9F6]">
                    <div className="flex items-center justify-between mb-1">
                      <FreshnessBadge status={r.label} />
                      <span className="text-[12px] font-semibold tabular-nums text-[#202B25]">
                        {data.freshness_summary[r.label] ?? 0} markets
                      </span>
                    </div>
                    <p className="text-[#46544B]">{r.rule}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 xl:col-span-7">
              <SectionHeader title="Markets with Delayed or Stale Data" />
              {data.stale_or_delayed_markets.length === 0 ? (
                <p className="text-[13px] text-[#6C776F] py-6 text-center">
                  All reporting markets are within 2 days of the latest reference date.
                </p>
              ) : (
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                        <th className="py-2 pr-2 font-medium">Market</th>
                        <th className="py-2 px-2 font-medium">State</th>
                        <th className="py-2 px-2 font-medium">Latest Report</th>
                        <th className="py-2 px-2 font-medium text-right">Lag (Days)</th>
                        <th className="py-2 pl-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E9E4]">
                      {data.stale_or_delayed_markets.map((m) => (
                        <tr key={m.market_id}>
                          <td className="py-2 pr-2 font-medium">{m.market_name}</td>
                          <td className="py-2 px-2 text-[#6C776F]">{m.state}</td>
                          <td className="py-2 px-2 tabular-nums">
                            {formatDateShort(m.latest_reporting_date)}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {m.lag_days ?? "—"}
                          </td>
                          <td className="py-2 pl-2">
                            <FreshnessBadge status={m.freshness} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Import Logs */}
          <Card className="p-4">
            <SectionHeader title="Data Import & Refresh Audit Log" />
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                    <th className="py-2 pr-2 font-medium">Timestamp</th>
                    <th className="py-2 px-2 font-medium">Source</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 px-2 font-medium text-right">Imported</th>
                    <th className="py-2 px-2 font-medium text-right">Duplicates</th>
                    <th className="py-2 px-2 font-medium text-right">Rejected</th>
                    <th className="py-2 px-2 font-medium text-right">Missing Fields</th>
                    <th className="py-2 px-2 font-medium text-right">Invalid Prices</th>
                    <th className="py-2 pl-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E9E4]">
                  {data.refresh_logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F7F9F6]">
                      <td className="py-2 pr-2 tabular-nums">{formatTimestamp(log.started_at)}</td>
                      <td className="py-2 px-2 font-medium">{log.source}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-2 py-0.5 text-[11px] rounded border ${
                            log.status === "success"
                              ? "bg-[#EAF3EC] text-[#176B45] border-[#CBE2D1]"
                              : log.status === "failed"
                              ? "bg-[#FDF1F0] text-[#B3463D] border-[#F0CBC7]"
                              : "bg-[#FEF7EA] text-[#9A6816] border-[#F2DCAD]"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{log.imported_records}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{log.duplicate_records}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{log.rejected_records}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{log.missing_field_count}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{log.invalid_price_count}</td>
                      <td className="py-2 pl-2 text-[#6C776F] max-w-xs truncate" title={log.error_message || ""}>
                        {log.error_message || "Completed"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Validation Findings Log */}
          <Card className="p-4">
            <SectionHeader title="Flagged Validation Findings" />
            {data.validation_issues.length === 0 ? (
              <p className="text-[13px] text-[#6C776F]">
                Zero validation anomalies logged in recent imports. Upload a CSV with anomalies to inspect row-level diagnostics.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                      <th className="py-2 pr-2 font-medium">Row</th>
                      <th className="py-2 px-2 font-medium">Issue Type</th>
                      <th className="py-2 px-2 font-medium">Severity</th>
                      <th className="py-2 px-2 font-medium">Field</th>
                      <th className="py-2 pl-2 font-medium">Explanation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E9E4]">
                    {data.validation_issues.map((iss) => (
                      <tr key={iss.id}>
                        <td className="py-2 pr-2 tabular-nums">#{iss.row_number}</td>
                        <td className="py-2 px-2 font-medium">{iss.issue_type}</td>
                        <td className="py-2 px-2">{iss.severity}</td>
                        <td className="py-2 px-2 text-[#6C776F]">{iss.field_name || "—"}</td>
                        <td className="py-2 pl-2 text-[#202B25]">{iss.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
