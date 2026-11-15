import type { Metadata, Viewport } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

/*
 * Playfair Display is the only webfont the brand loads — weights 400 and 500
 * plus 400 italic, exactly as specified in BRAND.md. Loaded through next/font
 * so it is self-hosted and cannot shift layout on first paint; the variable is
 * consumed by --kokka-font-serif via globals.css.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Kokka Health Tracker",
  description:
    "An open-source dashboard that combines WHOOP recovery with your calendar into a daily health outlook.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // brand-darker — the anchor colour, and the ground of the header band.
  themeColor: "#1E2F3A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={playfair.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
