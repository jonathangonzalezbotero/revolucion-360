import type { Metadata, Viewport } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa/Pwa";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Revolución 360", template: "%s · Revolución 360" },
  description: "Planea y registra tus finanzas del año. Una herramienta de Revolución del Dinero.",
  applicationName: "Revolución 360",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#141612", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${newsreader.variable}`}>
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
