'use client';

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I manage several properties and unit types?",
    answer:
      "Yes. Flats, shops, offices and mixed buildings in different locations, with bulk unit creation for large blocks.",
  },
  {
    question: "How do tenants join?",
    answer:
      "You invite a tenant to a unit with their name and email. They get a code, sign up with it and see their lease straight away.",
  },
  {
    question: "Does PropLink collect rent for me?",
    answer:
      "No. Tenants pay you the way they always have. PropLink records each payment, with proof, so balances are always right.",
  },
  {
    question: "What rent frequencies are supported?",
    answer:
      "Weekly, monthly, quarterly and yearly. Rent for each period is due by the end of that period.",
  },
  {
    question: "Is my data safe?",
    answer: (
      <>
        Your data is stored with Supabase in the EU and only you and your tenants can see what belongs to you. See our{" "}
        <Link href="/privacy" className="text-foreground underline hover:text-primary font-medium">
          Privacy policy
        </Link>
        .
      </>
    ),
  },
];

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <div className="max-w-[760px] mx-auto mt-12 lg:mt-16 divide-y divide-border border-y border-border">
      {FAQ_ITEMS.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={item.question} className="py-2">
            <button
              type="button"
              onClick={() => toggle(idx)}
              aria-expanded={isOpen}
              className="w-full py-4 flex items-center justify-between text-left gap-4 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-2 -mx-2"
            >
              <span className="text-[18px] font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors">
                {item.question}
              </span>
              <span
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform duration-200 text-muted-foreground group-hover:text-foreground",
                  isOpen && "rotate-45 text-foreground"
                )}
              >
                <Plus className="w-5 h-5" />
              </span>
            </button>
            {isOpen && (
              <div className="pb-5 px-2 text-[16px] text-muted-foreground leading-relaxed">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
