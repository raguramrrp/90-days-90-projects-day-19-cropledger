import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import { Layout } from "./components/Layout";
import { CropIntelligencePage } from "./pages/CropIntelligencePage";
import { DataQualityPage } from "./pages/DataQualityPage";
import { ForecastPage } from "./pages/ForecastPage";
import { MarketAtlasPage } from "./pages/MarketAtlasPage";
import { MarketComparisonPage } from "./pages/MarketComparisonPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PriceAdvisorPage } from "./pages/PriceAdvisorPage";
import { PriceReportsPage } from "./pages/PriceReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WatchlistAlertsPage } from "./pages/WatchlistAlertsPage";
import type { FilterMetaResponse, ModuleRoute, SourceStatus, UserSettings } from "./types/api";
import type { PriceUnitMode } from "./utils/format";

const VALID_ROUTES: ModuleRoute[] = [
  "/overview",
  "/price-advisor",
  "/market-atlas",
  "/crops",
  "/market-comparison",
  "/reports",
  "/forecast",
  "/watchlist",
  "/data-quality",
  "/settings",
];

function resolveRouteFromPath(pathname: string): ModuleRoute {
  const clean = pathname.replace(/\/+$/, "") || "/overview";
  if (clean === "/") return "/overview";
  if (VALID_ROUTES.includes(clean as ModuleRoute)) return clean as ModuleRoute;
  return "/overview";
}

export const App: React.FC = () => {
  const [route, setRoute] = useState<ModuleRoute>(() =>
    resolveRouteFromPath(window.location.pathname)
  );
  const [filters, setFilters] = useState<FilterMetaResponse | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  const [selectedState, setSelectedState] = useState<string>("All");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [activeCommodity, setActiveCommodity] = useState<string>("Onion");
  const [priceUnit, setPriceUnit] = useState<PriceUnitMode>("Quintal");

  const loadMetadata = useCallback(() => {
    Promise.all([api.getFilters(), api.getSettings()])
      .then(([fRes, sRes]) => {
        setFilters(fRes);
        setSettings(sRes);
        if (sRes.price_unit === "Kg" || sRes.price_unit === "Quintal") {
          setPriceUnit(sRes.price_unit);
        }
        if (sRes.source_status) setSourceStatus(sRes.source_status);
        if (fRes.available_dates.length > 0 && !selectedDate) {
          setSelectedDate(fRes.available_dates[0]);
        }
      })
      .catch(() => {
        // Handled per-page if backend is unreachable
      });
  }, [selectedDate]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(resolveRouteFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (nextRoute: ModuleRoute) => {
    if (window.location.pathname !== nextRoute) {
      window.history.pushState({}, "", nextRoute);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleQuickCommodity = (crop: string) => {
    setActiveCommodity(crop);
    if (route === "/settings" || route === "/data-quality" || route === "/watchlist") {
      navigate("/crops");
    }
  };

  return (
    <Layout
      activeRoute={route}
      onNavigate={navigate}
      filters={filters}
      selectedState={selectedState}
      onStateChange={setSelectedState}
      selectedDate={selectedDate}
      onDateChange={setSelectedDate}
      quickCommodity={activeCommodity}
      onQuickCommoditySelect={handleQuickCommodity}
      sourceStatus={sourceStatus}
      priceUnit={priceUnit}
      onPriceUnitChange={setPriceUnit}
      compactMode={settings?.theme_preference === "compact"}
    >
      {route === "/overview" && (
        <OverviewPage
          filters={filters}
          selectedState={selectedState}
          selectedDate={selectedDate}
          activeCommodity={activeCommodity}
          priceUnit={priceUnit}
          onSelectCommodity={setActiveCommodity}
          onNavigate={navigate}
        />
      )}

      {route === "/price-advisor" && (
        <PriceAdvisorPage
          filters={filters}
          settings={settings}
          activeCommodity={activeCommodity}
          onSelectCommodity={setActiveCommodity}
        />
      )}

      {route === "/market-atlas" && (
        <MarketAtlasPage
          filters={filters}
          activeCommodity={activeCommodity}
          onSelectCommodity={setActiveCommodity}
        />
      )}

      {route === "/crops" && (
        <CropIntelligencePage
          filters={filters}
          activeCommodity={activeCommodity}
          onSelectCommodity={setActiveCommodity}
        />
      )}

      {route === "/market-comparison" && (
        <MarketComparisonPage
          filters={filters}
          settings={settings}
          activeCommodity={activeCommodity}
          onSelectCommodity={setActiveCommodity}
        />
      )}

      {route === "/reports" && <PriceReportsPage filters={filters} priceUnit={priceUnit} />}

      {route === "/forecast" && (
        <ForecastPage
          filters={filters}
          activeCommodity={activeCommodity}
          onSelectCommodity={setActiveCommodity}
        />
      )}

      {route === "/watchlist" && <WatchlistAlertsPage filters={filters} />}

      {route === "/data-quality" && <DataQualityPage onDataChanged={loadMetadata} />}

      {route === "/settings" && (
        <SettingsPage
          filters={filters}
          settings={settings}
          onSettingsSaved={(updated) => {
            setSettings(updated);
            if (updated.price_unit === "Kg" || updated.price_unit === "Quintal") {
              setPriceUnit(updated.price_unit);
            }
          }}
        />
      )}
    </Layout>
  );
};

export default App;
