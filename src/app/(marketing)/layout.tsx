import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-gold/20 selection:text-gold-foreground">
      <LandingNavbar />
      <div className="flex-1">{children}</div>
      <LandingFooter />
    </div>
  );
}
