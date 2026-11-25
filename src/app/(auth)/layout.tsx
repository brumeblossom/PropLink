import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Home } from "lucide-react";
import { ToastProvider } from "@/components/ui/toast";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:grid lg:grid-cols-2">
      {/* Mobile & Tablet top banner (< lg) */}
      <div className="lg:hidden w-full h-[220px] relative shrink-0 overflow-hidden bg-[#08122B]">
        <Image
          src="/landing/auth.jpg"
          alt="PropLink"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgb(8_18_43_/_0.85)] via-[rgb(8_18_43_/_0.45)] to-transparent pointer-events-none" />
        <div className="absolute bottom-5 left-6 right-6 z-10">
          <p className="text-white font-serif text-[22px] leading-tight drop-shadow-sm">
            “I finally know which tenant owes what, without scrolling through WhatsApp.”
          </p>
          <p className="text-white/70 text-xs font-sans mt-1.5 drop-shadow-sm">
            A landlord with 12 units in Surulere
          </p>
        </div>
      </div>

      {/* Desktop left column (lg and up) */}
      <div className="hidden lg:relative lg:block h-full min-h-screen overflow-hidden bg-[#08122B]">
        <Image
          src="/landing/auth.jpg"
          alt="PropLink"
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgb(8_18_43_/_0.85)] via-[rgb(8_18_43_/_0.4)] to-transparent pointer-events-none" />
        <div className="absolute bottom-12 left-12 right-12 z-10 max-w-[500px]">
          <p className="text-white font-serif text-[30px] leading-snug drop-shadow-sm">
            “I finally know which tenant owes what, without scrolling through WhatsApp.”
          </p>
          <p className="text-white/70 text-[13px] font-sans mt-3 drop-shadow-sm">
            A landlord with 12 units in Surulere
          </p>
        </div>
      </div>

      {/* Form right column */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-220px)] lg:min-h-screen px-6 py-10 lg:px-12 pb-24 lg:pb-16 bg-background relative overflow-y-auto">
        <div className="w-full max-w-[420px] mx-auto flex flex-col">
          {/* Logo linking to / */}
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-[#0E1E45] flex items-center justify-center text-[#C9A84C] shadow-sm">
                <Home className="w-4 h-4" />
              </div>
              <span className="text-[20px] font-extrabold tracking-tight text-foreground font-sans">
                PropLink
              </span>
            </Link>
          </div>

          {/* Form Content */}
          <ToastProvider>
            {children}
          </ToastProvider>
        </div>
      </div>
    </div>
  );
}
