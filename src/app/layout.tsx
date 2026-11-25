import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans, Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://prop-link-delta.vercel.app"),
  title: {
    template: "%s · PropLink",
    default: "PropLink · Property management for landlords and tenants",
  },
  description:
    "Track leases, rent and tenants without spreadsheets or WhatsApp threads. Know who has paid, what is due and when every lease ends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(plusJakartaSans.variable, instrumentSerif.variable, "font-sans")}
    >
      <body className="antialiased font-sans">
        <Providers>
          {children}
          <ThemeSwitcher />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
