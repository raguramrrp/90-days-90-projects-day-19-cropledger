import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api } from "../api/client";
import { Card, ErrorBanner, LoadingState, SectionHeader } from "../components/UiPrimitives";
import type { FilterMetaResponse, UserSettings } from "../types/api";

interface SettingsPageProps {
  filters: FilterMetaResponse | null;
  settings: UserSettings | null;
  onSettingsSaved: (updated: UserSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  filters,
  settings,
  onSettingsSaved,
}) => {
  const [form, setForm] = useState<UserSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    } else {
      api.getSettings().then(setForm).catch(() => {});
    }
  }, [settings]);

  if (!form) return <LoadingState label="Loading workspace preferences..." />;

  const districts = filters?.districts_by_state?.[form.preferred_state] || [];

  const togglePreferredCrop = (cropName: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const exists = prev.preferred_crops.includes(cropName);
      return {
        ...prev,
        preferred_crops: exists
          ? prev.preferred_crops.filter((c) => c !== cropName)
          : [...prev.preferred_crops, cropName],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api.updateSettings(form);
      setSavedMsg("Settings persisted to database.");
      onSettingsSaved(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[#202B25] tracking-tight">Settings</h1>
      </div>

      {error && <ErrorBanner message={error} />}
      {savedMsg && (
        <div className="px-3.5 py-2.5 rounded-lg border border-[#CBE2D1] bg-[#EAF3EC] text-[12.5px] text-[#124D35]">
          {savedMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Card className="p-4 xl:col-span-7 space-y-4">
          <SectionHeader title="Regional & Cost Defaults" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Preferred State
              </label>
              <select
                value={form.preferred_state}
                onChange={(e) =>
                  setForm({ ...form, preferred_state: e.target.value, preferred_district: "" })
                }
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white"
              >
                {(filters?.states || [form.preferred_state]).map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Preferred District
              </label>
              <select
                value={form.preferred_district}
                onChange={(e) => setForm({ ...form, preferred_district: e.target.value })}
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white"
              >
                <option value="">Select district</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Default Comparison Quantity (Quintals)
              </label>
              <input
                type="number"
                min={1}
                value={form.default_quantity_quintals}
                onChange={(e) =>
                  setForm({ ...form, default_quantity_quintals: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Default Transport Cost (₹ / km)
              </label>
              <input
                type="number"
                min={0}
                value={form.transport_cost_per_km}
                onChange={(e) =>
                  setForm({ ...form, transport_cost_per_km: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Default Commission (%)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                step={0.25}
                value={form.default_commission_pct}
                onChange={(e) =>
                  setForm({ ...form, default_commission_pct: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Default Handling Expenses (₹)
              </label>
              <input
                type="number"
                min={0}
                step={50}
                value={form.default_handling_cost}
                onChange={(e) =>
                  setForm({ ...form, default_handling_cost: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Default Price Display Unit
              </label>
              <select
                value={form.price_unit}
                onChange={(e) => setForm({ ...form, price_unit: e.target.value as "Quintal" | "Kg" })}
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white"
              >
                <option value="Quintal">Per Quintal (₹/qtl · 100 kg)</option>
                <option value="Kg">Per Kilogram (₹/kg)</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#46544B] mb-1">
                Layout Density
              </label>
              <select
                value={form.theme_preference}
                onChange={(e) =>
                  setForm({ ...form, theme_preference: e.target.value as "light" | "compact" })
                }
                className="w-full px-2.5 py-2 text-[13px] border border-[#E3E9E4] rounded-md bg-white"
              >
                <option value="light">Standard Agricultural Workspace</option>
                <option value="compact">Compact Analyst Density</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E3E9E4]">
            <label className="block text-[12px] font-medium text-[#46544B] mb-1.5">
              Preferred Crops
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(filters?.commodities || []).map((c) => {
                const active = form.preferred_crops.includes(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => togglePreferredCrop(c.name)}
                    className={`px-2.5 py-1 text-[12px] rounded border ${
                      active
                        ? "bg-[#176B45] text-white border-[#176B45]"
                        : "bg-white text-[#46544B] border-[#E3E9E4]"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-[#E3E9E4] flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-[13px] text-[#202B25] cursor-pointer">
              <input
                type="checkbox"
                checked={form.alert_in_app}
                onChange={(e) => setForm({ ...form, alert_in_app: e.target.checked })}
                className="accent-[#176B45]"
              />
              <span>Enable in-app alert evaluation on data refresh</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-md bg-[#176B45] text-white hover:bg-[#124D35] disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving..." : "Save Preferences"}</span>
            </button>
          </div>
        </Card>

        <Card className="p-4 xl:col-span-5 space-y-3">
          <SectionHeader title="Data Source & Normalization Info" />
          <div className="space-y-2.5 text-[12.5px] text-[#46544B]">
            <div className="p-3 rounded bg-[#F7F9F6] border border-[#E3E9E4]">
              <div className="font-semibold text-[#202B25]">Primary Official Source</div>
              <p className="mt-1">
                AGMARKNET / Open Government Data Platform India (<code>data.gov.in</code> resource{" "}
                <code>9ef84268-d588-465a-a308-a864a43d0070</code>). API keys are read strictly
                from backend environment variables.
              </p>
            </div>
            <div className="p-3 rounded bg-[#F7F9F6] border border-[#E3E9E4]">
              <div className="font-semibold text-[#202B25]">Price Normalization Standard</div>
              <p className="mt-1">
                All prices are stored in <strong>₹ per Quintal (100 kg)</strong> while preserving
                original source units in the database for auditability.
              </p>
            </div>
            <div className="p-3 rounded bg-[#F7F9F6] border border-[#E3E9E4]">
              <div className="font-semibold text-[#202B25]">Active Dataset Mode</div>
              <p className="mt-1">
                Current mode:{" "}
                <strong className="text-[#202B25]">
                  {form.source_status?.data_mode || "demo"}
                </strong>{" "}
                ({form.source_status?.total_records?.toLocaleString("en-IN") || 0} records).
              </p>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
};
