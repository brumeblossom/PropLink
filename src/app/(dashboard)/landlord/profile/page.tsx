import { redirect } from "next/navigation";

export default function LandlordProfileRedirect() {
  redirect("/landlord/settings");
}
