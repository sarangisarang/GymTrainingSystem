"use client";

// Lightweight footer (Issue #29). Houses the legal links that don't fit in the
// top navbar but should be reachable from anywhere — currently just the
// privacy policy. Renders client-side so we can localise the label without
// duplicating the German fallback in server metadata.
import Link from "next/link";
import { useTranslations } from "@/components/I18nProvider";

export default function Footer() {
  const t = useTranslations();
  const year = 2026; // hardcoded for now to avoid hydration-time Date.now() drift

  return (
    <footer className="mt-16 border-t border-neutral-800 bg-neutral-950/50 py-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-neutral-500 sm:flex-row">
        <p>© {year} Gym Tracker</p>
        <nav className="flex items-center gap-4">
          <Link href="/datenschutz" className="hover:text-neutral-200 transition">
            {t("profile.privacyPolicy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
