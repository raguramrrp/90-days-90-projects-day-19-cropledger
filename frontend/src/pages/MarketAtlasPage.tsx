import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import {
  Card,
  ErrorBanner,
  FreshnessBadge,
  LoadingState,
  SectionHeader,
} from "../components/UiPrimitives";
import type {
  AtlasMarketPoint,
  AtlasMarketsResponse,
  AtlasSummaryResponse,
  FilterMetaResponse,
} from "../types/api";
import { formatDateShort, formatDualPrice, formatKgFromQuintal, formatQuintalPrice } from "../utils/format";

interface MarketAtlasPageProps {
  filters: FilterMetaResponse | null;
  activeCommodity: string;
  onSelectCommodity: (commodity: string) => void;
}

export const MarketAtlasPage: React.FC<MarketAtlasPageProps> = ({
  filters,
  activeCommodity,
  onSelectCommodity,
}) => {
  const [commodity, setCommodity] = useState(activeCommodity || "Onion");
  const [stateFilter, setStateFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [search, setSearch] = useState("");

  const [atlasData, setAtlasData] = useState<AtlasMarketsResponse | null>(null);
  const [summaryData, setSummaryData] = useState<AtlasSummaryResponse | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<AtlasMarketPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterLayerRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    if (activeCommodity) setCommodity(activeCommodity);
  }, [activeCommodity]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getAtlasMarkets({
        commodity,
        state: stateFilter,
        district: districtFilter,
        min_price: minPrice ? Number(minPrice) : undefined,
        max_price: maxPrice ? Number(maxPrice) : undefined,
        search: search || undefined,
      }),
      api.getAtlasSummary({ commodity, state: stateFilter }),
    ])
      .then(([mRes, sRes]) => {
        if (!active) return;
        setAtlasData(mRes);
        setSummaryData(sRes);
        if (mRes.mapped_markets.length > 0) {
          setSelectedMarker(mRes.mapped_markets[0]);
        } else {
          setSelectedMarker(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load Market Atlas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [commodity, stateFilter, districtFilter, minPrice, maxPrice, search]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [21.5, 78.9],
      zoom: 5,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 42,
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterLayerRef.current = cluster;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterLayerRef.current = null;
    };
  }, []);

  // Update markers whenever atlasData changes
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterLayerRef.current;
    if (!map || !cluster || !atlasData) return;

    cluster.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    atlasData.mapped_markets.forEach((pt) => {
      if (pt.latitude === null || pt.longitude === null) return;
      const coords: L.LatLngExpression = [pt.latitude, pt.longitude];
      bounds.push(coords);

      const icon = L.divIcon({
        className: "cropledger-pin",
        html: `<div style="background:#176B45;color:#fff;border:2px solid #fff;border-radius:9999px;padding:2px 7px;font-size:11px;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,0.28);white-space:nowrap;">₹${Math.round(
          pt.latest_modal_price
        ).toLocaleString("en-IN")}</div>`,
        iconSize: [64, 24],
        iconAnchor: [32, 12],
      });

      const marker = L.marker(coords, { icon });
      marker.on("click", () => {
        setSelectedMarker(pt);
      });
      marker.bindTooltip(
        `${pt.market_name} (${pt.state}) · ${formatDualPrice(pt.latest_modal_price)}`
      );
      cluster.addLayer(marker);
    });

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 7 });
    }
  }, [atlasData]);

  const districts =
    stateFilter !== "All" ? filters?.districts_by_state?.[stateFilter] || [] : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">Market Atlas</h1>
      </div>

      {/* Filter Bar */}
      <Card className="p-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <select
            aria-label="Commodity filter"
            value={commodity}
            onChange={(e) => {
              setCommodity(e.target.value);
              onSelectCommodity(e.target.value);
            }}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded bg-white"
          >
            {(filters?.commodities || []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="State filter"
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setDistrictFilter("All");
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
            onChange={(e) => setDistrictFilter(e.target.value)}
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

          <input
            type="number"
            placeholder="Min Modal ₹/qtl"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded"
          />

          <input
            type="number"
            placeholder="Max Modal ₹/qtl"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded"
          />

          <input
            type="text"
            placeholder="Search market or district..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-2.5 py-1.5 text-[12.5px] border border-[#E3E9E4] rounded"
          />
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {/* Map + Selected Marker Details */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="p-3 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
            <span className="text-[12.5px] font-medium text-[#202B25]">
              Showing {atlasData?.mapped_count ?? 0} verified market pins for {commodity}
              {atlasData && atlasData.unmapped_count > 0
                ? ` (${atlasData.unmapped_count} unmapped markets omitted)`
                : ""}
            </span>
            {loading && <span className="text-[12px] text-[#6C776F]">Updating pins...</span>}
          </div>
          <div
            ref={mapContainerRef}
            className="w-full h-[430px] rounded-md border border-[#E3E9E4] z-0"
          />
          <p className="text-[11px] text-[#6C776F] mt-2 px-1">
            {atlasData?.attribution ||
              "Map tiles © OpenStreetMap contributors. Coordinates are never fabricated for unverified yards."}
          </p>
        </Card>

        <div className="xl:col-span-4 space-y-4">
          <Card className="p-4">
            <SectionHeader title="Selected Market Details" />
            {selectedMarker ? (
              <div className="space-y-3 text-[12.5px]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[15px] font-semibold text-[#202B25]">
                      {selectedMarker.market_name}
                    </div>
                    <div className="text-[#6C776F]">
                      {selectedMarker.district}, {selectedMarker.state}
                    </div>
                  </div>
                  <FreshnessBadge status={selectedMarker.freshness} />
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#E3E9E4]">
                  <div>
                    <div className="text-[11.5px] text-[#6C776F]">Commodity</div>
                    <div className="font-medium">{selectedMarker.commodity}</div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-[#6C776F]">Latest Modal Price</div>
                    <div className="font-semibold text-[#176B45] tabular-nums">
                      {formatQuintalPrice(selectedMarker.latest_modal_price)}
                    </div>
                    <div className="text-[11px] text-[#6C776F] tabular-nums">
                      {formatKgFromQuintal(selectedMarker.latest_modal_price)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-[#6C776F]">Min / Max Range</div>
                    <div className="tabular-nums">
                      {formatQuintalPrice(selectedMarker.min_price)} –{" "}
                      {formatQuintalPrice(selectedMarker.max_price)}
                    </div>
                    <div className="text-[11px] text-[#6C776F] tabular-nums">
                      {formatKgFromQuintal(selectedMarker.min_price)} –{" "}
                      {formatKgFromQuintal(selectedMarker.max_price)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-[#6C776F]">Reporting Date</div>
                    <div>{formatDateShort(selectedMarker.reporting_date)}</div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-[#6C776F]">Available Records</div>
                    <div className="tabular-nums">{selectedMarker.record_count}</div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-[#6C776F]">Location Basis</div>
                    <div className="text-[11.5px] text-[#46544B] truncate" title={selectedMarker.location_source || ""}>
                      {selectedMarker.location_source || "Unavailable"}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] text-[#6C776F]">
                No mapped markets match the current filter.
              </p>
            )}
          </Card>

          {summaryData && !summaryData.empty && (
            <Card className="p-4 space-y-3">
              <SectionHeader title={`${summaryData.commodity} Price Spread`} />
              <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                <div className="p-2.5 rounded bg-[#F7F9F6] border border-[#E3E9E4]">
                  <div className="text-[11px] text-[#6C776F]">National Avg Modal</div>
                  <div className="font-semibold text-[#202B25] tabular-nums mt-0.5">
                    {formatQuintalPrice(summaryData.national_avg_modal)}
                  </div>
                  <div className="text-[11px] text-[#6C776F] tabular-nums">
                    {formatKgFromQuintal(summaryData.national_avg_modal)}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#F7F9F6] border border-[#E3E9E4]">
                  <div className="text-[11px] text-[#6C776F]">Price Spread</div>
                  <div className="font-semibold text-[#C48A2C] tabular-nums mt-0.5">
                    {formatQuintalPrice(summaryData.price_spread)}
                  </div>
                  <div className="text-[11px] text-[#6C776F] tabular-nums">
                    {formatKgFromQuintal(summaryData.price_spread)}
                  </div>
                </div>
                {summaryData.highest_market && (
                  <div className="p-2.5 rounded bg-[#EAF3EC]/60 border border-[#CBE2D1]">
                    <div className="text-[11px] text-[#176B45]">Highest Market</div>
                    <div className="font-semibold text-[#202B25] truncate">
                      {summaryData.highest_market.market_name}
                    </div>
                    <div className="text-[12px] font-medium text-[#176B45] tabular-nums">
                      {formatQuintalPrice(summaryData.highest_market.modal_price)} ·{" "}
                      {formatKgFromQuintal(summaryData.highest_market.modal_price)}
                    </div>
                  </div>
                )}
                {summaryData.lowest_market && (
                  <div className="p-2.5 rounded bg-[#F7F9F6] border border-[#E3E9E4]">
                    <div className="text-[11px] text-[#6C776F]">Lowest Market</div>
                    <div className="font-semibold text-[#202B25] truncate">
                      {summaryData.lowest_market.market_name}
                    </div>
                    <div className="text-[12px] font-medium text-[#202B25] tabular-nums">
                      {formatQuintalPrice(summaryData.lowest_market.modal_price)} ·{" "}
                      {formatKgFromQuintal(summaryData.lowest_market.modal_price)}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* State-Wise Comparison & Top 10 Markets */}
      {loading && !summaryData ? (
        <LoadingState label="Loading market distribution..." />
      ) : (
        summaryData &&
        !summaryData.empty && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <Card className="p-4 xl:col-span-6">
              <SectionHeader
                title={`State-wise Average Modal Price — ${summaryData.commodity}`}
              />
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summaryData.state_comparison}
                    layout="vertical"
                    margin={{ top: 4, right: 20, left: 20, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3E9E4" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#6C776F" }}
                      tickFormatter={(v) => `₹${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="state"
                      width={110}
                      tick={{ fontSize: 11.5, fill: "#202B25" }}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatDualPrice(v), "Avg Modal Price"]}
                    />
                    <Bar dataKey="avg_modal_price" fill="#176B45" radius={[0, 3, 3, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 xl:col-span-6">
              <SectionHeader
                title={`Top 10 Markets by Modal Price — ${summaryData.commodity}`}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#E3E9E4] text-left text-[#6C776F]">
                      <th className="py-2 pr-2 font-medium">#</th>
                      <th className="py-2 px-2 font-medium">Market</th>
                      <th className="py-2 px-2 font-medium">State</th>
                      <th className="py-2 px-2 font-medium text-right">Modal</th>
                      <th className="py-2 pl-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E9E4]">
                    {summaryData.top_10_markets.map((m, idx) => (
                      <tr key={m.market_id} className="hover:bg-[#F7F9F6]">
                        <td className="py-2 pr-2 tabular-nums text-[#6C776F]">{idx + 1}</td>
                        <td className="py-2 px-2 font-medium">{m.market_name}</td>
                        <td className="py-2 px-2 text-[#6C776F]">{m.state}</td>
                        <td className="py-2 px-2 text-right font-semibold text-[#176B45] tabular-nums">
                          <div>{formatQuintalPrice(m.modal_price)}</div>
                          <div className="text-[10.5px] font-normal text-[#6C776F]">
                            {formatKgFromQuintal(m.modal_price)}
                          </div>
                        </td>
                        <td className="py-2 pl-2 text-[#6C776F] tabular-nums">
                          {formatDateShort(m.reporting_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {atlasData && atlasData.unmapped_markets.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#E3E9E4] text-[12px] text-[#6C776F]">
                  <strong className="text-[#202B25]">Unmapped markets:</strong>{" "}
                  {atlasData.unmapped_markets
                    .map((u) => `${u.market_name} (${u.state})`)
                    .join(", ")}
                </div>
              )}
            </Card>
          </div>
        )
      )}
    </div>
  );
};
