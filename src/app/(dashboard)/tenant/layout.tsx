import type { Metadata } from "next";
import { TenantClientShell } from "./TenantClientShell";

export const metadata: Metadata = {
  title: "Home",
};

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantClientShell>{children}</TenantClientShell>;
}
