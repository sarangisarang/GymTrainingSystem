"use client";

// Language switcher (issue #23). Renders all supported locales with their flag
// and endonym; selection is applied at runtime and persisted via I18nProvider.

import { useEffect, useRef, useState } from "react";
import { LOCALES, getLocale } from "@/i18n/locales";
import { useI18n } from "@/components/I18nProvider";

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getLocale(locale);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Change language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost flex items-center gap-1.5"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline text-sm uppercase">{current.code}</span>
        <span className="text-xs text-neutral-500">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-2 max-h-80 w-56 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-1 shadow-xl"
        >
          {LOCALES.map((l) => {
            const active = l.code === locale;
            return (
              <li key={l.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setLocale(l.code);
                    setOpen(false);
                  }}
                  className={
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition " +
                    (active
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-300 hover:bg-neutral-900")
                  }
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span className="flex-1 text-left">{l.name}</span>
                  <span className="text-xs uppercase text-neutral-500">{l.code}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
