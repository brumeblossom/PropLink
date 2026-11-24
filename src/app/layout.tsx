import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans, Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://proplink.ng"),
  title: "PropLink",
  description: "Multi-tenant property management platform",
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
      </body>
    </html>
  );
}
