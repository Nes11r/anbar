/** Formatting helpers usable on server and client. */
export function fmtQty(v: unknown, max = 3): string {
  if (v == null || v === "") return "0";
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("az-AZ", { maximumFractionDigits: max });
}

export function fmtMoney(v: unknown, cur = "AZN"): string {
  if (v == null || v === "") return "—";
  const n = Number(String(v));
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return "—";
  const dd = String(x.getUTCDate()).padStart(2, "0");
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${x.getUTCFullYear()}`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return "—";
  return x.toLocaleString("az-AZ", { timeZone: "Asia/Baku", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** yyyy-mm-dd for <input type=date> */
export function isoDate(d: Date | string | null | undefined = new Date()): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return "";
  return x.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sp(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
