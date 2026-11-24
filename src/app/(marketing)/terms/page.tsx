import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Use · PropLink",
  description: "Read the terms and conditions for using PropLink.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "section-1",
    title: "1. What PropLink does",
    content: (
      <p>
        PropLink lets landlords record properties, units, leases, rent payments and documents, invite tenants, and send notices. Tenants can view their leases and log payments for their landlord to confirm. PropLink is a record-keeping tool. It does not collect, hold or transfer rent, and it is not a party to any tenancy.
      </p>
    ),
  },
  {
    id: "section-2",
    title: "2. Your account",
    content: (
      <ul className="list-disc pl-5 space-y-2 my-4">
        <li>You must be 18 or older and give accurate information.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
        <li>Landlords must use a tenant&apos;s real email and have a lawful reason to record their details.</li>
      </ul>
    ),
  },
  {
    id: "section-3",
    title: "3. Your content",
    content: (
      <p>
        You own the records and files you add. You give PropLink permission to store and display them so the service works for you and the people you share them with (your landlord or tenants). You are responsible for making sure you have the right to upload them.
      </p>
    ),
  },
  {
    id: "section-4",
    title: "4. Acceptable use",
    content: (
      <p>
        Do not use PropLink to break the law, upload harmful or misleading content, harass anyone, try to access accounts or data that are not yours, or disrupt the service.
      </p>
    ),
  },
  {
    id: "section-5",
    title: "5. Payments and records",
    content: (
      <p>
        Payment amounts, balances and due dates in PropLink are calculated from the records landlords and tenants enter. Landlords confirm or reject tenant-logged payments. PropLink is not responsible for disputes between landlords and tenants, and its records do not replace a signed tenancy agreement or official receipts.
      </p>
    ),
  },
  {
    id: "section-6",
    title: "6. Availability",
    content: (
      <p>
        We work to keep PropLink available and accurate, but the service is provided &quot;as is&quot; and may sometimes be unavailable for maintenance or reasons outside our control.
      </p>
    ),
  },
  {
    id: "section-7",
    title: "7. Limitation of liability",
    content: (
      <p>
        To the extent the law allows, PropLink is not liable for indirect or consequential losses, or for losses arising from records entered by users.
      </p>
    ),
  },
  {
    id: "section-8",
    title: "8. Ending your account",
    content: (
      <p>
        You can stop using PropLink at any time and ask us to delete your account. We may suspend accounts that break these terms.
      </p>
    ),
  },
  {
    id: "section-9",
    title: "9. Changes",
    content: (
      <p>
        We may update these terms. We will tell you in the app before important changes take effect.
      </p>
    ),
  },
  {
    id: "section-10",
    title: "10. Governing law",
    content: (
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria.
      </p>
    ),
  },
  {
    id: "section-11",
    title: "11. Contact",
    content: (
      <p>
        <a
          href="mailto:workwithbrume@gmail.com"
          className="text-primary font-medium underline underline-offset-4 hover:opacity-80 transition-opacity"
        >
          workwithbrume@gmail.com
        </a>
      </p>
    ),
  },
];

export default function TermsOfUsePage() {
  return (
    <LegalDocument
      title="Terms of Use"
      lastUpdated="25/11/2026"
      intro={
        <p className="text-[17px] leading-relaxed text-foreground/90 font-medium">
          These terms are an agreement between you and PropLink. By creating an account or using PropLink you agree to them.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
