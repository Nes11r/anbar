import { describe, expect, it } from "vitest";
import { applyToBalance, D, entryEffect, groupCompatible, groupFilterValues, poReceiptStatus, reverseType, validateQty, validateWorkerGroup } from "@/server/stock/rules";
import { cleanText, guessSizeType, isNA, normalizeSize, parseDate, parseMultiSizeCell, parseQty } from "@/server/import/normalize";

describe("stock rules", () => {
  it("every entry type has a reverse that cancels its effect", () => {
    for (const t of ["OPENING", "RECEIPT", "ISSUE", "RETURN_IN", "RETURN_OUT", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT_PLUS", "ADJUSTMENT_MINUS", "RESERVATION", "RESERVATION_RELEASE"] as const) {
      const a = entryEffect(t), b = entryEffect(reverseType(t));
      expect(a.onHand + b.onHand).toBe(0);
      expect(a.reserved + b.reserved).toBe(0);
    }
  });

  it("10 opening + 5 receipt − 3 issue = 12", () => {
    const r = applyToBalance({ onHand: D(0), reserved: D(0) }, [
      { entryType: "OPENING", qty: D(10) },
      { entryType: "RECEIPT", qty: D(5) },
      { entryType: "ISSUE", qty: D(3) },
    ]);
    expect(r.ok && r.end.onHand.toNumber()).toBe(12);
  });

  it("issue respects available = on_hand − reserved", () => {
    const r = applyToBalance({ onHand: D(5), reserved: D(4) }, [{ entryType: "ISSUE", qty: D(2) }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.available.toNumber()).toBe(1);
  });

  it("issue before receipt in the same document is checked in order", () => {
    const r = applyToBalance({ onHand: D(0), reserved: D(0) }, [{ entryType: "ISSUE", qty: D(1) }, { entryType: "RECEIPT", qty: D(1) }]);
    expect(r.ok).toBe(false);
  });

  it("validateQty: zero, negative, fractions for integer units", () => {
    expect(validateQty(0, false)).toMatch(/0-dan/);
    expect(validateQty(-1, true)).toBeTruthy();
    expect(validateQty(1.5, false)).toMatch(/tam ədəd/);
    expect(validateQty(1.5, true)).toBeNull();
    expect(validateQty(0, false, { allowZero: true })).toBeNull();
    expect(validateQty("abc", true)).toBeTruthy();
    expect(validateQty(1.2345, true)).toMatch(/3 onluq/);
  });

  it("worker group compatibility and filters", () => {
    expect(groupCompatible("BOTH", "WORKER")).toBe(true);
    expect(groupCompatible("ENGINEER", "WORKER")).toBe(false);
    expect(groupCompatible("NOT_APPLICABLE", "ENGINEER")).toBe(true);
    expect(groupFilterValues("ENGINEER")).toContain("BOTH");
    expect(validateWorkerGroup(true, "NOT_APPLICABLE")).toBeTruthy();
    expect(validateWorkerGroup(false, "NOT_APPLICABLE")).toBeNull();
  });

  it("PO receipt status", () => {
    expect(poReceiptStatus([{ ordered: D(100), received: D(60) }])).toBe("PARTIAL");
    expect(poReceiptStatus([{ ordered: D(100), received: D(100) }])).toBe("FULL");
    expect(poReceiptStatus([{ ordered: D(100), received: D(0) }])).toBe("NONE");
  });
});

describe("import normalisation", () => {
  it("sizes", () => {
    expect(normalizeSize(" xl ")).toBe("XL");
    expect(normalizeSize("XXL")).toBe("2XL");
    expect(normalizeSize(41)).toBe("41");
    expect(normalizeSize("41.0")).toBe("41");
    expect(normalizeSize("N/A")).toBe("");
  });
  it("N/A detection", () => {
    expect(isNA("N/A")).toBe(true);
    expect(isNA("  ")).toBe(true);
    expect(isNA("A0208")).toBe(false);
  });
  it("size type guess", () => {
    expect(guessSizeType(["40", "41", "42"])).toBe("SHOE_EU");
    expect(guessSizeType(["48", "50", "52"])).toBe("CLOTHING_NUMERIC");
    expect(guessSizeType(["M", "XL"])).toBe("CLOTHING_LETTER");
    expect(guessSizeType([])).toBe("NONE");
  });
  it("multi-size cell from 'Order List ArcProtection'", () => {
    const r = parseMultiSizeCell("Size: \n48-2pcs\n50-2pcs\n52-10pc");
    expect(r?.pairs).toEqual([{ size: "48", qty: 2 }, { size: "50", qty: 2 }, { size: "52", qty: 10 }]);
    expect(parseMultiSizeCell(5)).toBeNull();
  });
  it("quantities with text", () => {
    expect(parseQty("1600 paçka")).toMatchObject({ qty: 1600, unitHint: "paçka" });
    expect(parseQty(12)).toEqual({ qty: 12 });
    expect(parseQty(-3).problem).toMatch(/Mənfi/);
    expect(parseQty("abc").qty).toBeNull();
  });
  it("dates", () => {
    expect(parseDate(" 24.10.2024").date?.toISOString().slice(0, 10)).toBe("2024-10-24");
    expect(parseDate(" 24.10.2024").problem).toMatch(/mətn/);
    expect(parseDate(new Date("2028-01-26")).problem).toMatch(/Gələcək/);
    expect(parseDate("salam").date).toBeNull();
  });
  it("cleanText", () => {
    expect(cleanText("  a \n b ")).toBe("a b");
    expect(cleanText({ richText: [{ text: "x" }, { text: "y" }] })).toBe("xy");
  });
});
