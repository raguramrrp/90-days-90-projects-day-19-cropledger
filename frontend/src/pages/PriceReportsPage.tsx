import React, { useEffect, useState } from "react";
import { ArrowDownUp, Download, Printer } from "lucide-react";
import { api } from "../api/client";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  SectionHeader,
} from "../components/UiPrimitives";
import type { FilterMetaResponse, ReportsResponse } from "../types/api";
import type { PriceUnitMode } from "../utils/format";
import {
  formatDateShort,
  formatDisplayPrice,
  formatKgFromQuintal,
  formatNumber,
  formatQuintalPrice,
} from "../utils/format";

interface PriceReportsPageProps {
  filters: FilterMetaResponse | null;
  priceUnit?: PriceUnitMode;
}

export const PriceReportsPage: React.FC<PriceReportsPageProps> = ({
  filters,
  priceUnit = "Quintal",
}) => {
  const [reportingDate, setReportingDate] = useState("all");
  const [stateFilter, setStateFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [marketFilter, setMarketFilter] = useState("All");
  const [commodityFilter, setCommodityFilter] = useState("All");
  const [varietyFilter, setVarietyFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("arrival_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getReports({
        reporting_date: reportingDate,
        state: stateFilter,
        district: districtFilter,
        market: marketFilter,
        commodity: commodityFilter,
        variety: varietyFilter,
        category: categoryFilter,
        search: search || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        page_size: 25,
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load reports.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    reportingDate,
    stateFilter,
    districtFilter,
    marketFilter,
    commodityFilter,
    varietyFilter,
    categoryFilter,
    search,
    sortBy,
    sortDir,
    page,
  ]);

  const handleSort = (col: string) => {
    setPage(1);
    if (sortBy === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const categories = Array.from(
    new Set((filters?.commodities || []).map((c) => c.category))
  ).sort();
  const varieties =
    commodityFilter !== "All" ? filters?.varieties_by_commodity?.[commodityFilter] || [] : [];
  const districts =
    stateFilter !== "All" ? filters?.districts_by_state?.[stateFilter] || [] : [];
  const markets = (filters?.markets || []).filter(
    (m) =>
      (stateFilter === "All" || m.state === stateFilter) &&
      (districtFilter === "All" || m.district === districtFilter)
  );

  const exportParams = {
    reporting_date: reportingDate,
    state: stateFilter,
    district: districtFilter,
    market: marketFilter,
    commodity: commodityFilter,
    variety: varietyFilter,
    category: categoryFilter,
    search: search || undefined,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">Price Reports</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <a
            href={api.getReportExportUrl("csv", exportParams)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium rounded-md border border-[#E3E9E4] bg-white text-[#202B25] hover:border-[#176B45]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
          <a
            href={api.getReportExportUrl("pdf", exportParams)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium rounded-md border border-[#E3E9E4] bg-white text-[#202B25] hover:border-[#176B45]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium rounded-md bg-[#176B45] text-white hover:bg-[#124D35]"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-3.5 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <select
            aria-label="Reporting date filter"
            value={reportingDate}
            onChange={(e) => {
              setReportingDate(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded bg-white"
          >
            <option value="all">All Reporting Dates</option>
            {(filters?.available_dates || []).map((dt) => (
              <option key={dt} value={dt}>
                {formatDateShort(dt)}
              </option>
            ))}
          </select>

          <select
            aria-label="State filter"
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setDistrictFilter("All");
              setMarketFilter("All");
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded bg-white"
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
              setMarketFilter("All");
              setPage(1);
            }}
            disabled={stateFilter === "All"}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded bg-white disabled:bg-[#F7F9F6]"
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
            value={marketFilter}
            onChange={(e) => {
              setMarketFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded bg-white"
          >
            <option value="All">All Markets</option>
            {markets.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Category filter"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded bg-white"
          >
            <option value="All">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            aria-label="Commodity filter"
            value={commodityFilter}
            onChange={(e) => {
              setCommodityFilter(e.target.value);
              setVarietyFilter("All");
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded bg-white"
          >
            <option value="All">All Commodities</option>
            {(filters?.commodities || []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Variety filter"
            value={varietyFilter}
            onChange={(e) => {
              setVarietyFilter(e.target.value);
              setPage(1);
            }}
            disabled={commodityFilter === "All"}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded bg-white disabled:bg-[#F7F9F6]"
          >
            <option value="All">All Varieties</option>
            {varieties.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search crop, market, state..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded"
          />
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}
      {loading && !data && <LoadingState label="Fetching price report records..." />}

      {data && data.records.length === 0 ? (
        <EmptyState
          title="No matching price records"
          description="Try broadening the date, state, or commodity filters."
          action={
            <button
              type="button"
              onClick={() => {
                setReportingDate("all");
                setStateFilter("All");
                setDistrictFilter("All");
                setMarketFilter("All");
                setCommodityFilter("All");
                setVarietyFilter("All");
                setCategoryFilter("All");
                setSearch("");
                setPage(1);
              }}
              className="px-3.5 py-1.5 text-[12.5px] rounded-md border border-[#E3E9E4] bg-white hover:border-[#176B45]"
            >
              Reset All Filters
            </button>
          }
        />
      ) : (
        data && (
          <Card className="p-4">
            <SectionHeader
              title="Market Price Register"
              subtitle={`${data.records.length} of ${data.total.toLocaleString("en-IN")} records`}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                    {[
                      { key: "arrival_date", label: "Reporting Date" },
                      { key: "state", label: "State" },
                      { key: "district", label: "District" },
                      { key: "market", label: "Market" },
                      { key: "commodity", label: "Commodity" },
                      { key: "variety", label: "Variety" },
                      { key: "min_price", label: "Min Price", align: "right" },
                      { key: "max_price", label: "Max Price", align: "right" },
                      { key: "modal_price", label: "Modal Price", align: "right" },
                      { key: "arrival_quantity", label: "Arrivals", align: "right" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className={`py-2 px-2 font-medium cursor-pointer select-none hover:text-[#176B45] ${
                          col.align === "right" ? "text-right" : ""
                        }`}
                        onClick={() => handleSort(col.key)}
                      >
                        <span className="inline-flex items-center gap-1">
                          <span>{col.label}</span>
                          <ArrowDownUp className="w-3 h-3 opacity-60" />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E9E4]">
                  {data.records.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F7F9F6]">
                      <td className="py-2 px-2 tabular-nums">{formatDateShort(r.arrival_date)}</td>
                      <td className="py-2 px-2 text-[#6C776F]">{r.state}</td>
                      <td className="py-2 px-2 text-[#6C776F]">{r.district}</td>
                      <td className="py-2 px-2 font-medium text-[#202B25]">{r.market}</td>
                      <td className="py-2 px-2 font-medium">{r.commodity}</td>
                      <td className="py-2 px-2 text-[#6C776F]">{r.variety}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        <div>{formatDisplayPrice(r.min_price, priceUnit)}</div>
                        <div className="text-[10.5px] text-[#6C776F]">
                          {priceUnit === "Kg"
                            ? formatQuintalPrice(r.min_price)
                            : formatKgFromQuintal(r.min_price)}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        <div>{formatDisplayPrice(r.max_price, priceUnit)}</div>
                        <div className="text-[10.5px] text-[#6C776F]">
                          {priceUnit === "Kg"
                            ? formatQuintalPrice(r.max_price)
                            : formatKgFromQuintal(r.max_price)}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-semibold text-[#176B45] tabular-nums">
                        <div>{formatDisplayPrice(r.modal_price, priceUnit)}</div>
                        <div className="text-[10.5px] font-normal text-[#6C776F]">
                          {priceUnit === "Kg"
                            ? formatQuintalPrice(r.modal_price)
                            : formatKgFromQuintal(r.modal_price)}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right text-[#6C776F] tabular-nums">
                        {r.arrival_quantity !== null ? `${formatNumber(r.arrival_quantity)} t` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 pt-3 border-t border-[#E3E9E4] flex flex-wrap items-center justify-between gap-3 text-[12.5px] no-print">
              <span className="text-[#6C776F]">
                Page {data.page} of {data.total_pages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded border border-[#E3E9E4] bg-white disabled:opacity-45 hover:border-[#176B45]"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= data.total_pages}
                  onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                  className="px-3 py-1 rounded border border-[#E3E9E4] bg-white disabled:opacity-45 hover:border-[#176B45]"
                >
                  Next
                </button>
              </div>
            </div>
          </Card>
        )
      )}
    </div>
  );
};
