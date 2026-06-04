"use client";

// Lightweight footer (Issue #29). Houses the legal links that don't fit in the
// top navbar but should be reachable from anywhere — currently just the
// privacy policy. Renders client-side so we can localise the label without
// duplicating the German fallback in server metadata.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "@/components/I18nProvider";

// Build-year as the initial render value so SSR and the first client render
// match (no hydration warning). useEffect then bumps it to the real year
// after mount, which is a no-op within the same calendar year but rolls over
// correctly on Jan 1 without any developer action.
const BUILD_YEAR = 2026;

export default function Footer() {
  const t = useTranslations();
  const [year, setYear] = useState(BUILD_YEAR);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

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
