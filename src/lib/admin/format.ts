const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const ABS_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

export function relativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = d.getTime() - Date.now();
  const seconds = Math.round(diffMs / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return RTF.format(seconds, "second");
  if (abs < 3600) return RTF.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return RTF.format(Math.round(seconds / 86400), "day");
  if (abs < 86400 * 365) return RTF.format(Math.round(seconds / (86400 * 30)), "month");
  return RTF.format(Math.round(seconds / (86400 * 365)), "year");
}

export function absoluteTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return ABS_FMT.format(d);
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}
