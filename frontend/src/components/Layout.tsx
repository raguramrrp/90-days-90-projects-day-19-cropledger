import React, { useState } from "react";
import {
  BarChart3,
  Bell,
  Calculator,
  Database,
  FileSpreadsheet,
  GitCompare,
  LayoutDashboard,
  MapPin,
  Menu,
  Search,
  Settings,
  TrendingUp,
  X,
} from "lucide-react";
import type { FilterMetaResponse, ModuleRoute, SourceStatus } from "../types/api";
import type { PriceUnitMode } from "../utils/format";
import { formatDateShort } from "../utils/format";
import { CropLedgerLogo } from "./CropLedgerLogo";

export interface NavItem {
  route: ModuleRoute;
  label: string;
  group: "desk" | "analysis" | "ops";
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { route: "/overview", label: "Overview", group: "desk", icon: LayoutDashboard },
  { route: "/price-advisor", label: "Price Advisor", group: "desk", icon: Calculator },
  { route: "/market-atlas", label: "Market Atlas", group: "desk", icon: MapPin },
  { route: "/crops", label: "Crop Intelligence", group: "analysis", icon: BarChart3 },
  { route: "/market-comparison", label: "Market Comparison", group: "analysis", icon: GitCompare },
  { route: "/forecast", label: "Forecast & Trends", group: "analysis", icon: TrendingUp },
  { route: "/reports", label: "Price Reports", group: "ops", icon: FileSpreadsheet },
  { route: "/watchlist", label: "Watchlist & Alerts", group: "ops", icon: Bell },
  { route: "/data-quality", label: "Data Quality", group: "ops", icon: Database },
  { route: "/settings", label: "Settings", group: "ops", icon: Settings },
];

const NAV_GROUPS: Array<{ id: "desk" | "analysis" | "ops"; title: string }> = [
  { id: "desk", title: "Market Desk" },
  { id: "analysis", title: "Analytics" },
  { id: "ops", title: "Ledger & Data" },
];

interface LayoutProps {
  activeRoute: ModuleRoute;
  onNavigate: (route: ModuleRoute) => void;
  filters: FilterMetaResponse | null;
  selectedState: string;
  onStateChange: (state: string) => void;
  selectedDate: string;
  onDateChange: (dt: string) => void;
  quickCommodity: string;
  onQuickCommoditySelect: (commodity: string) => void;
  sourceStatus?: SourceStatus | null;
  priceUnit?: PriceUnitMode;
  onPriceUnitChange?: (unit: PriceUnitMode) => void;
  compactMode?: boolean;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeRoute,
  onNavigate,
  filters,
  selectedState,
  onStateChange,
  selectedDate,
  onDateChange,
  quickCommodity,
  onQuickCommoditySelect,
  sourceStatus,
  priceUnit = "Quintal",
  onPriceUnitChange,
  compactMode = false,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const matchingCommodities = (filters?.commodities || []).filter((c) =>
    c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matchingCommodities.length > 0) {
      onQuickCommoditySelect(matchingCommodities[0].name);
      setSearchQuery("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9F6] text-[#202B25] overflow-x-hidden">
      {/* Tier 1: Forest-Green Brand Masthead & Global Market Scope */}
      <header className="bg-[#124D35] text-white border-b border-[#0E3C29] no-print">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-1.5 rounded-md border border-white/20 bg-white/10 text-white hover:bg-white/20"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => onNavigate("/overview")}
              className="flex items-center gap-2.5 text-left min-w-0 group"
            >
              <CropLedgerLogo variant="dark-header" size={34} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[15.5px] tracking-tight text-white">
                    CropLedger
                  </span>
                  <span className="hidden sm:inline-block text-white/30">|</span>
                  <span className="hidden sm:inline-block text-[12px] text-[#CBE2D1] truncate">
                    Agricultural Market Intelligence
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
            {/* Commodity Quick Search */}
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-auto sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-[#CBE2D1] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                list="global-commodity-list"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  const exact = (filters?.commodities || []).find(
                    (c) => c.name.toLowerCase() === val.trim().toLowerCase()
                  );
                  if (exact) {
                    onQuickCommoditySelect(exact.name);
                    setSearchQuery("");
                  }
                }}
                placeholder={`Jump to crop (${quickCommodity})...`}
                className="w-full sm:w-52 pl-8 pr-2.5 py-1.5 text-[12.5px] bg-[#176B45] text-white placeholder:text-[#CBE2D1] border border-white/20 rounded-md focus:outline-none focus:bg-white focus:text-[#202B25] focus:placeholder:text-[#6C776F]"
              />
              <datalist id="global-commodity-list">
                {(filters?.commodities || []).map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </form>

            {/* State Selector */}
            <select
              aria-label="Selected state"
              value={selectedState}
              onChange={(e) => onStateChange(e.target.value)}
              className="max-w-full px-2.5 py-1.5 text-[12.5px] bg-[#176B45] border border-white/20 rounded-md text-white focus:outline-none focus:border-white"
            >
              <option value="All">All States (India)</option>
              {(filters?.states || []).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {/* Reporting Date Selector */}
            <select
              aria-label="Reporting date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="max-w-full px-2.5 py-1.5 text-[12.5px] bg-[#176B45] border border-white/20 rounded-md text-white focus:outline-none focus:border-white"
            >
              {(filters?.available_dates || []).map((dt) => (
                <option key={dt} value={dt}>
                  Report: {formatDateShort(dt)}
                </option>
              ))}
            </select>

            {/* Global Price Unit Toggle (Quintal vs Per-Kg) */}
            {onPriceUnitChange && (
              <div
                className="inline-flex rounded-md border border-white/25 overflow-hidden bg-[#176B45]"
                role="group"
                aria-label="Price display unit"
              >
                {(["Quintal", "Kg"] as PriceUnitMode[]).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => onPriceUnitChange(unit)}
                    className={`px-2 py-1.5 text-[11.5px] font-medium transition-colors ${
                      priceUnit === unit
                        ? "bg-white text-[#124D35] font-semibold"
                        : "text-[#EAF3EC] hover:bg-white/15"
                    }`}
                  >
                    {unit === "Kg" ? "₹/kg" : "₹/qtl"}
                  </button>
                ))}
              </div>
            )}

            {/* Honest Data Freshness Indicator */}
            {sourceStatus && (
              <button
                type="button"
                onClick={() => onNavigate("/data-quality")}
                className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded-md border border-white/20 bg-white/10 text-[#EAF3EC] hover:bg-white/20"
                title="View data source & validation audit"
              >
                <span>
                  {sourceStatus.data_mode === "official" ? "Official Feed" : "Demo Dataset"} ·{" "}
                  {sourceStatus.latest_reporting_date
                    ? formatDateShort(sourceStatus.latest_reporting_date)
                    : "No Data"}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate("/settings")}
              className="p-1.5 rounded-md border border-white/20 bg-white/10 text-white hover:bg-white/20"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Tier 2: Horizontal Domain-Clustered Workspace Ribbon (Desktop & Tablet) */}
      <nav
        aria-label="Workspace Modules"
        className="hidden md:block bg-white border-b border-[#E3E9E4] sticky top-0 z-30 no-print"
      >
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 flex items-center gap-1 overflow-x-auto">
          {NAV_GROUPS.map((group, gIdx) => {
            const groupItems = NAV_ITEMS.filter((item) => item.group === group.id);
            return (
              <React.Fragment key={group.id}>
                {gIdx > 0 && <div className="h-5 w-px bg-[#E3E9E4] mx-1.5 shrink-0" aria-hidden="true" />}
                <div className="flex items-center shrink-0">
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeRoute === item.route;
                    return (
                      <button
                        key={item.route}
                        type="button"
                        onClick={() => onNavigate(item.route)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-2.5 text-[12.5px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                          isActive
                            ? "border-[#176B45] text-[#176B45] bg-[#EAF3EC]/45 font-semibold"
                            : "border-transparent text-[#46544B] hover:text-[#202B25] hover:bg-[#F7F9F6]"
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? "text-[#176B45]" : "text-[#6C776F]"
                          }`}
                        />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </nav>

      {/* Mobile Slide-Down Navigation Sheet */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-b border-[#E3E9E4] px-4 py-3 space-y-3 no-print">
          {NAV_GROUPS.map((group) => {
            const groupItems = NAV_ITEMS.filter((item) => item.group === group.id);
            return (
              <div key={group.id}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6C776F] mb-1.5 px-1">
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeRoute === item.route;
                    return (
                      <button
                        key={item.route}
                        type="button"
                        onClick={() => {
                          onNavigate(item.route);
                          setMobileOpen(false);
                        }}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-[12.5px] font-medium border text-left ${
                          isActive
                            ? "bg-[#EAF3EC] text-[#176B45] border-[#CBE2D1]"
                            : "bg-[#F7F9F6] text-[#46544B] border-[#E3E9E4]"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Width Workspace Canvas */}
      <main
        className={`flex-1 w-full max-w-[1440px] mx-auto ${
          compactMode ? "p-3 lg:p-5" : "p-4 lg:p-6"
        }`}
      >
        {children}
      </main>

      {/* Clean Market Ledger Footer */}
      <footer className="bg-white border-t border-[#E3E9E4] mt-6 no-print">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#6C776F]">
          <div className="flex items-center gap-2">
            <CropLedgerLogo variant="light" size={20} />
            <span>
              <strong className="text-[#202B25]">CropLedger</strong> · Know the market. Understand the
              price. Choose with evidence.
            </span>
          </div>
          <div>
            Display unit: <strong className="text-[#202B25]">{priceUnit === "Kg" ? "₹/kg" : "₹/Quintal (100 kg)"}</strong>{" "}
            · Net return estimates reflect user-entered assumptions
          </div>
        </div>
      </footer>
    </div>
  );
};
