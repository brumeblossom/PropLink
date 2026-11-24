import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy · PropLink",
  description: "Read the PropLink privacy policy and learn how we protect your personal data.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "section-1",
    title: "1. Who is responsible for your data",
    content: (
      <>
        <p>
          PropLink is the data controller for account data (your name, email and password). For the property, lease and payment records a landlord adds about their tenants, the landlord decides what is recorded and PropLink processes it on the landlord&apos;s behalf.
        </p>
        <p>
          Contact:{" "}
          <a
            href="mailto:workwithbrume@gmail.com"
            className="text-primary font-medium underline underline-offset-4 hover:opacity-80 transition-opacity"
          >
            workwithbrume@gmail.com
          </a>
        </p>
      </>
    ),
  },
  {
    id: "section-2",
    title: "2. What we collect",
    content: (
      <>
        <ul className="list-disc pl-5 space-y-2 my-4">
          <li>
            <strong>Account details:</strong> full name, email address, role (landlord or tenant) and an encrypted password.
          </li>
          <li>
            <strong>Property and lease records:</strong> property names and addresses, units, lease dates, rent amount and frequency, deposit, and tenant name and email.
          </li>
          <li>
            <strong>Payment records:</strong> amounts, dates, method, status, notes, and receipts or proof files you upload.
          </li>
          <li>
            <strong>Documents:</strong> lease agreements and other files a landlord uploads to a lease.
          </li>
          <li>
            <strong>Messages and notices:</strong> announcements and in-app notifications.
          </li>
          <li>
            <strong>Technical data:</strong> sign-in times, device and browser type, and error logs used to keep the service secure and working.
          </li>
        </ul>
        <p>
          We do not collect card or bank details. PropLink does not process rent payments.
        </p>
      </>
    ),
  },
  {
    id: "section-3",
    title: "3. Why we use it (and our legal basis)",
    content: (
      <>
        <ul className="list-disc pl-5 space-y-2 my-4">
          <li>
            To create and run your account and show you your properties, leases and payments (performance of a contract).
          </li>
          <li>
            To send in-app notifications such as invitations, payment confirmations and rent reminders (performance of a contract).
          </li>
          <li>
            To keep the service secure, prevent misuse and fix problems (legitimate interests).
          </li>
          <li>
            To meet legal obligations, such as responding to lawful requests (legal obligation).
          </li>
        </ul>
        <p>
          We do not sell your personal data and we do not use it for advertising.
        </p>
      </>
    ),
  },
  {
    id: "section-4",
    title: "4. Who can see your data",
    content: (
      <ul className="list-disc pl-5 space-y-2 my-4">
        <li>
          <strong>Landlords</strong> see the records for their own properties and tenants.
        </li>
        <li>
          <strong>Tenants</strong> see only their own leases, payments and the documents shared on their leases.
        </li>
        <li>
          <strong>Service providers</strong> that host and run PropLink for us: Supabase (database, authentication and file storage) and Vercel (hosting). They process data only on our instructions.
        </li>
        <li>
          <strong>Authorities</strong>, only when the law requires it.
        </li>
      </ul>
    ),
  },
  {
    id: "section-5",
    title: "5. Where your data is stored",
    content: (
      <p>
        Our database and files are hosted by Supabase in the European Union (Ireland), and the app is served by Vercel. When data leaves Nigeria we rely on the safeguards allowed under the NDPA, such as the provider&apos;s contractual commitments.
      </p>
    ),
  },
  {
    id: "section-6",
    title: "6. How long we keep it",
    content: (
      <p>
        We keep your data while your account is active. Lease and payment records are kept so landlords and tenants have a full history. If an account is deleted, we delete or anonymise its personal data within 90 days, unless the law requires us to keep it longer.
      </p>
    ),
  },
  {
    id: "section-7",
    title: "7. Your rights",
    content: (
      <p>
        You can ask to access, correct, delete or receive a copy of your personal data, object to or restrict how we use it, and withdraw consent where we rely on it. Email{" "}
        <a
          href="mailto:workwithbrume@gmail.com"
          className="text-primary font-medium underline underline-offset-4 hover:opacity-80 transition-opacity"
        >
          workwithbrume@gmail.com
        </a>{" "}
        and we will reply within 30 days. You can also complain to the Nigeria Data Protection Commission (NDPC).
      </p>
    ),
  },
  {
    id: "section-8",
    title: "8. Security",
    content: (
      <p>
        Data is encrypted in transit, passwords are hashed, access is limited per landlord and tenant, and documents open only through short-lived private links. No system is perfectly secure, so please keep your password private.
      </p>
    ),
  },
  {
    id: "section-9",
    title: "9. Children",
    content: (
      <p>
        PropLink is not for anyone under 18.
      </p>
    ),
  },
  {
    id: "section-10",
    title: "10. Changes to this policy",
    content: (
      <p>
        If we make important changes we will tell you in the app before they take effect.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      lastUpdated="25/11/2026"
      intro={
        <p className="text-[17px] leading-relaxed text-foreground/90 font-medium">
          PropLink (&quot;PropLink&quot;, &quot;we&quot;, &quot;us&quot;) helps landlords manage properties, leases and rent records, and helps tenants see their rentals and payments. This policy explains what personal data we collect, why, and the choices you have. It is written to meet the Nigeria Data Protection Act 2023 (NDPA) and the GDPR where it applies.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
