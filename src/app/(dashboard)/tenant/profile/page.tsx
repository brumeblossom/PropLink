import { redirect } from "next/navigation";

export default function TenantProfileRedirect() {
  redirect("/tenant/settings");
}
