import React from "react";

interface CropLedgerLogoProps {
  variant?: "dark-header" | "light";
  size?: number;
  className?: string;
}

/**
 * Bespoke geometric CropLedger mark:
 * Combines three stepped APMC comparison ledger columns above a ledger baseline
 * crowned by a faceted grain-crest diamond & harvest gold summit accent.
 */
export const CropLedgerLogo: React.FC<CropLedgerLogoProps> = ({
  variant = "dark-header",
  size = 34,
  className = "",
}) => {
  const isDark = variant === "dark-header";
  const tileBg = isDark ? "#FFFFFF" : "#124D35";
  const tileBorder = isDark ? "#CBE2D1" : "#176B45";
  const sideBar = isDark ? "#6B9875" : "#CBE2D1";
  const primaryBar = isDark ? "#176B45" : "#FFFFFF";
  const crestFacet = isDark ? "#124D35" : "#EAF3EC";
  const accentGold = "#C48A2C";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Chamfered architectural ledger frame */}
      <rect
        x="1"
        y="1"
        width="34"
        height="34"
        rx="8"
        fill={tileBg}
        stroke={tileBorder}
        strokeWidth="1.5"
      />
      {/* Left comparison ledger column */}
      <rect x="7.5" y="18.5" width="4.5" height="9" rx="1.2" fill={sideBar} />
      {/* Right comparison ledger column */}
      <rect x="24" y="15.5" width="4.5" height="12" rx="1.2" fill={sideBar} />
      {/* Center winning ledger spine */}
      <rect x="15.75" y="13" width="4.5" height="14.5" rx="1.2" fill={primaryBar} />
      {/* Faceted split grain-crest diamond */}
      <path d="M18 5.2L13.1 10.6L18 12.6V5.2Z" fill={primaryBar} />
      <path d="M18 5.2L22.9 10.6L18 12.6V5.2Z" fill={crestFacet} />
      {/* Harvest amber benchmark dot above winning column */}
      <circle cx="18" cy="5.2" r="1.45" fill={accentGold} />
      {/* Open ledger datum baseline */}
      <path
        d="M6.5 29.2H29.5"
        stroke={primaryBar}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
};
