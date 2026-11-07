"use client";

export function PrintButtonClient() {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      Çap / PDF
    </button>
  );
}
