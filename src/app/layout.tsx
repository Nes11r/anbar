import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/client/toast";
import { PwaRegister } from "@/components/client/pwa";

export const metadata: Metadata = {
  title: { default: "HECOTEC Anbar Sistemi", template: "%s · HECOTEC" },
  description: "HECOTEC anbar, satınalma və layihə materiallarının idarə edilməsi",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icons/favicon-32.png", sizes: "32x32" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "HECOTEC Anbar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#006381" },
    { media: "(prefers-color-scheme: dark)", color: "#0b171b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = jar.get("theme")?.value;
  const density = jar.get("density")?.value;
  return (
    <html lang="az" data-theme={theme === "dark" || theme === "light" ? theme : undefined} data-density={density === "compact" ? "compact" : undefined}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <Toaster>{children}</Toaster>
        <PwaRegister />
      </body>
    </html>
  );
}
