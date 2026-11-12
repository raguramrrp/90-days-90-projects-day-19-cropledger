export type PriceUnitMode = "Quintal" | "Kg";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrKgFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
});

export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return inrFormatter.format(value);
}

export function formatQuintalPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${inrFormatter.format(value)}/qtl`;
}

/** Convert INR/Quintal (100 kg) into INR/kg and format cleanly. */
export function formatKgFromQuintal(quintalValue: number | null | undefined): string {
  if (quintalValue === null || quintalValue === undefined || Number.isNaN(quintalValue)) {
    return "—";
  }
  return `${inrKgFormatter.format(quintalValue / 100)}/kg`;
}

/** Format an already per-kg INR value directly. */
export function formatDirectKgPrice(kgValue: number | null | undefined): string {
  if (kgValue === null || kgValue === undefined || Number.isNaN(kgValue)) {
    return "—";
  }
  return `${inrKgFormatter.format(kgValue)}/kg`;
}

/** Format a stored INR/Quintal price in the user's chosen global display unit. */
export function formatDisplayPrice(
  quintalValue: number | null | undefined,
  unit: PriceUnitMode = "Quintal"
): string {
  return unit === "Kg" ? formatKgFromQuintal(quintalValue) : formatQuintalPrice(quintalValue);
}

/** Format the secondary paired unit (Kg when primary is Quintal, or Quintal when primary is Kg). */
export function formatSecondaryPrice(
  quintalValue: number | null | undefined,
  primaryUnit: PriceUnitMode = "Quintal"
): string {
  return primaryUnit === "Kg" ? formatQuintalPrice(quintalValue) : formatKgFromQuintal(quintalValue);
}

/** Inline string with both quintal and per-kg rates side by side. */
export function formatDualPrice(
  quintalValue: number | null | undefined,
  primaryUnit: PriceUnitMode = "Quintal"
): string {
  if (quintalValue === null || quintalValue === undefined || Number.isNaN(quintalValue)) {
    return "—";
  }
  const qtl = formatQuintalPrice(quintalValue);
  const kg = formatKgFromQuintal(quintalValue);
  return primaryUnit === "Kg" ? `${kg} (${qtl})` : `${qtl} (${kg})`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return numberFormatter.format(value);
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatDateShort(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTimestamp(isoTs: string | null | undefined): string {
  if (!isoTs) return "Not yet refreshed";
  const parsed = new Date(isoTs);
  if (Number.isNaN(parsed.getTime())) return isoTs;
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
