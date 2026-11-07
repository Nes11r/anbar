/**
 * Normalisation helpers shared by catalogue entry and Excel import. Pure functions — unit tested.
 */

const LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];

/** "xl" → "XL", "XXL" → "2XL", "41 " → "41", "N/A" / "-" → "" */
export function normalizeSize(raw: unknown): string {
  if (raw == null) return "";
  let s = String(raw).trim().toUpperCase().replace(/\s+/g, "");
  if (!s || isNA(s)) return "";
  if (/^\d+(\.0+)?$/.test(s)) return String(parseInt(s, 10));
  s = s.replace(/^XXXXXL$/, "5XL").replace(/^XXXXL$/, "4XL").replace(/^XXXL$/, "3XL").replace(/^XXL$/, "2XL");
  s = s.replace(/^2XL$/i, "2XL");
  return s;
}

export function isNA(v: unknown): boolean {
  if (v == null) return true;
  const s = String(v).trim().toUpperCase();
  return s === "" || s === "N/A" || s === "NA" || s === "-" || s === "—" || s === "NONE" || s === "NULL" || s === "#N/A";
}

export function isLetterSize(s: string) {
  return LETTER_SIZES.includes(s);
}

export function guessSizeType(sizes: string[]): "NONE" | "CLOTHING_NUMERIC" | "CLOTHING_LETTER" | "SHOE_EU" | "OTHER" {
  const ss = sizes.filter(Boolean);
  if (!ss.length) return "NONE";
  if (ss.every(isLetterSize)) return "CLOTHING_LETTER";
  if (ss.every((s) => /^\d+$/.test(s))) {
    const n = ss.map(Number);
    if (n.every((x) => x >= 34 && x <= 48) && n.some((x) => x <= 44)) return "SHOE_EU";
    if (n.every((x) => x >= 36 && x <= 70)) return "CLOTHING_NUMERIC";
  }
  return "OTHER";
}

/**
 * Parse cells like "Size: \n48-2pcs\n50-2pcs\n52-10pc" or "41-3Pcs" into size/qty pairs.
 * Returns null when the cell is a plain number. Flags anything not fully understood.
 */
export function parseMultiSizeCell(raw: unknown): { pairs: { size: string; qty: number }[]; leftover: string } | null {
  if (raw == null) return null;
  if (typeof raw === "number") return null;
  const s = String(raw);
  if (/^\s*-?\d+([.,]\d+)?\s*$/.test(s)) return null;
  const re = /(\d{2}|X{0,3}S|M|X{0,5}L|\dXL)\s*[-–:]\s*(\d+)\s*(pcs?|ədəd|eded)?/gi;
  const pairs: { size: string; qty: number }[] = [];
  let leftover = s.replace(/size\s*:/i, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    pairs.push({ size: normalizeSize(m[1]), qty: parseInt(m[2], 10) });
    leftover = leftover.replace(m[0], "");
  }
  return { pairs, leftover: leftover.replace(/[\s,;]+/g, " ").trim() };
}

/** Parse a quantity cell: 12, "12", "1600 paçka" → {qty:1600, unitHint:"paçka"} */
export function parseQty(raw: unknown): { qty: number | null; unitHint?: string; problem?: string } {
  if (raw == null || raw === "") return { qty: null };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { qty: null, problem: "Rəqəm deyil" };
    if (raw < 0) return { qty: raw, problem: "Mənfi miqdar" };
    return { qty: raw };
  }
  const s = String(raw).trim();
  const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { qty: null, problem: `Miqdar anlaşılmadı: "${s.slice(0, 40)}"` };
  const qty = Number(m[1].replace(",", "."));
  const hint = m[2].trim();
  if (qty < 0) return { qty, problem: "Mənfi miqdar" };
  return hint ? { qty, unitHint: hint, problem: `Miqdarda mətn var ("${hint}") — vahidi yoxlayın` } : { qty };
}

/** Excel date cell → Date | null with problem description. Accepts Date, serial numbers and dd.mm.yyyy strings. */
export function parseDate(raw: unknown): { date: Date | null; problem?: string } {
  if (raw == null || raw === "") return { date: null };
  if (raw instanceof Date) return sanity(raw);
  if (typeof raw === "number") {
    // Excel serial (1900 system)
    const d = new Date(Math.round((raw - 25569) * 86400_000));
    return sanity(d);
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return sanity(new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])), true);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return sanity(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), true);
  return { date: null, problem: `Tarix anlaşılmadı: "${s.slice(0, 30)}"` };
}

function sanity(d: Date, fromText = false): { date: Date | null; problem?: string } {
  if (isNaN(d.getTime())) return { date: null, problem: "Yanlış tarix" };
  const y = d.getUTCFullYear();
  if (y < 2000) return { date: d, problem: `Çox köhnə tarix (${y})` };
  if (d.getTime() > Date.now() + 30 * 86400_000) return { date: d, problem: `Gələcək tarix (${d.toISOString().slice(0, 10)})` };
  return fromText ? { date: d, problem: "Tarix mətn kimi yazılıb (çevrildi)" } : { date: d };
}

/** Cell text sanitiser: trims, collapses whitespace, strips control chars. */
export function cleanText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(o.richText)) return cleanText(o.richText.map((r) => r.text).join(""));
    if (o.text != null) return cleanText(o.text);
    if (o.result != null) return cleanText(o.result);
    return "";
  }
  return String(v).replace(/[\u0000-\u0008\u000B-\u001F]/g, "").replace(/\s+/g, " ").trim();
}
