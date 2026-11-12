import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import type { SourceStatus } from "../types/api";

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`min-w-0 bg-white border border-[#E3E9E4] rounded-lg shadow-[0_1px_2px_rgba(18,77,53,0.04)] ${className}`}>
    {children}
  </div>
);

export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div>
      <h2 className="text-[15px] font-semibold text-[#202B25] tracking-tight">{title}</h2>
      {subtitle && <p className="text-[12.5px] text-[#6C776F] mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="flex items-center gap-2">{action}</div>}
  </div>
);

export const TooltipLabel: React.FC<{
  label: string;
  hint: string;
}> = ({ label, hint }) => (
  <span className="inline-flex items-center gap-1 group relative">
    <span>{label}</span>
    <span
      title={hint}
      aria-label={hint}
      className="text-[#6C776F] hover:text-[#176B45] cursor-help inline-flex items-center"
    >
      <Info className="w-3.5 h-3.5" />
    </span>
  </span>
);

export const FreshnessBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    "Recently updated": "bg-[#EAF3EC] text-[#176B45] border-[#CBE2D1]",
    Delayed: "bg-[#FEF7EA] text-[#9A6816] border-[#F2DCAD]",
    Stale: "bg-[#FDF1F0] text-[#B3463D] border-[#F0CBC7]",
    Unavailable: "bg-[#F3F5F3] text-[#6C776F] border-[#E3E9E4]",
  };
  const cls = styles[status] || styles.Unavailable;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11.5px] font-medium rounded border ${cls}`}>
      {status}
    </span>
  );
};

export const SourceBanner: React.FC<{ status?: SourceStatus | null }> = ({ status }) => {
  if (!status) return null;
  if (status.data_mode === "official") {
    return (
      <div className="mb-4 px-3.5 py-2.5 rounded-lg border border-[#CBE2D1] bg-[#EAF3EC] text-[12.5px] text-[#124D35] flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>Official Market Data Active</strong> — {status.official_records.toLocaleString("en-IN")} records loaded
          {status.latest_reporting_date ? ` (latest report: ${status.latest_reporting_date})` : ""}.
        </span>
      </div>
    );
  }
  if (status.data_mode === "demo" || status.data_mode === "mixed") {
    return (
      <div className="mb-4 px-3.5 py-2.5 rounded-lg border border-[#F2DCAD] bg-[#FEF7EA] text-[12.5px] text-[#785110] flex items-start sm:items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-[#C48A2C]" />
        <span className="min-w-0 flex-1 break-words">
          {status.data_mode === "demo" ? (
            <>
              <strong>Demo Mode Active:</strong> Displaying the clearly labelled CropLedger AGMARKNET-schema demo
              dataset ({status.demo_records.toLocaleString("en-IN")} records). Configure{" "}
              <code className="px-1 py-0.5 bg-white/70 rounded text-[11.5px] break-all">DATA_GOV_IN_API_KEY</code> or upload an
              official AGMARKNET CSV in <strong>Data Quality</strong> to switch to official records.
            </>
          ) : (
            <>
              <strong>Mixed Dataset Notice:</strong> Database contains{" "}
              {status.official_records.toLocaleString("en-IN")} official records and{" "}
              {status.demo_records.toLocaleString("en-IN")} demo records. You can clear demo records in{" "}
              <strong>Data Quality</strong>.
            </>
          )}
        </span>
      </div>
    );
  }
  return null;
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <Card className="p-8 text-center">
    <h3 className="text-[15px] font-semibold text-[#202B25]">{title}</h3>
    <p className="text-[13px] text-[#6C776F] mt-1 max-w-md mx-auto">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </Card>
);

export const LoadingState: React.FC<{ label?: string }> = ({ label = "Loading market records..." }) => (
  <Card className="p-8 text-center text-[13px] text-[#6C776F]">{label}</Card>
);

export const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-3.5 rounded-lg border border-[#F0CBC7] bg-[#FDF1F0] text-[#B3463D] text-[13px] flex items-center gap-2">
    <AlertTriangle className="w-4 h-4 shrink-0" />
    <span>{message}</span>
  </div>
);
