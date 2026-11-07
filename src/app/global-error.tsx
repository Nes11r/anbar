"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="az">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#eef4f5", color: "#15303a", padding: 40 }}>
        <h1 style={{ fontSize: 20 }}>HECOTEC Anbar Sistemi müvəqqəti əlçatan deyil</h1>
        <p>Məlumatlar təhlükəsizdir. Bir neçə saniyə sonra yenidən cəhd edin.</p>
        <button onClick={() => reset()} style={{ padding: "8px 14px", background: "#E28221", border: 0, borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
          Yenidən cəhd et
        </button>
      </body>
    </html>
  );
}
