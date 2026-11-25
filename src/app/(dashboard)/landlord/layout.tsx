import type { Metadata } from "next";
import { LandlordClientShell } from "./LandlordClientShell";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function LandlordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LandlordClientShell>{children}</LandlordClientShell>;
}
