"use client";

// Lightweight i18n (issue #23). No external dependency: a React context holds
// the active locale, persists it to localStorage, exposes a `t()` lookup and
// keeps <html lang>/<html dir> in sync. Messages live in i18n/messages/*.json.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_CODES, getLocale } from "@/i18n/locales";

import en from "@/i18n/messages/en.json";
import de from "@/i18n/messages/de.json";
import ka from "@/i18n/messages/ka.json";
import es from "@/i18n/messages/es.json";
import fr from "@/i18n/messages/fr.json";
import it from "@/i18n/messages/it.json";
import pt from "@/i18n/messages/pt.json";
import ru from "@/i18n/messages/ru.json";
import uk from "@/i18n/messages/uk.json";
import tr from "@/i18n/messages/tr.json";
import pl from "@/i18n/messages/pl.json";
import nl from "@/i18n/messages/nl.json";
import ar from "@/i18n/messages/ar.json";
import zh from "@/i18n/messages/zh.json";
import ja from "@/i18n/messages/ja.json";
import ko from "@/i18n/messages/ko.json";
import hi from "@/i18n/messages/hi.json";

type Messages = Record<string, unknown>;

const MESSAGES: Record<string, Messages> = {
  en, de, ka, es, fr, it, pt, ru, uk, tr, pl, nl, ar, zh, ja, ko, hi,
};

const STORAGE_KEY = "locale";

type I18nContextValue = {
  locale: string;
  setLocale: (code: string) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/** Resolve a dot-path ("home.ctaTitle") against a nested messages object. */
function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start with the default locale so server and first client render match;
  // the stored preference is applied after mount to avoid hydration mismatch.
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALE_CODES.includes(stored)) {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    const { dir } = getLocale(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale]);

  const setLocale = (code: string) => {
    if (!LOCALE_CODES.includes(code)) return;
    window.localStorage.setItem(STORAGE_KEY, code);
    setLocaleState(code);
  };

  const t = useMemo(() => {
    const active = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
    const fallback = MESSAGES[DEFAULT_LOCALE];
    return (key: string): string =>
      lookup(active, key) ?? lookup(fallback, key) ?? key;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

/** Convenience hook returning just the translate function. */
export function useTranslations(): (key: string) => string {
  return useI18n().t;
}
