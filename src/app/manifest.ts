import type { MetadataRoute } from "next";

/** Installable app (PWA): "Add to Home screen" on Android / iOS, standalone window on desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "HECOTEC Anbar Sistemi",
    short_name: "HECOTEC Anbar",
    description: "Anbar, satınalma və layihə materiallarının idarə edilməsi",
    lang: "az",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#eef4f5",
    theme_color: "#006381",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Anbar qalığı", url: "/stock", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Layihəyə məxaric", url: "/movements/new?kind=ISSUE_PROJECT", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "İşçiyə PPE", url: "/movements/new?kind=ISSUE_EMPLOYEE", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mal qəbulu", url: "/grn", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
