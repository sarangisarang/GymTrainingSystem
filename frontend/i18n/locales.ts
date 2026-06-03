// Supported locales for the app (issue #23 — multilingual support).
// `code` matches the message file name in i18n/messages/<code>.json and the
// HTML `lang` attribute. `dir` is "rtl" for right-to-left scripts (Arabic).

export type Locale = {
  code: string;
  name: string;   // language name in its own language (endonym)
  flag: string;
  dir: "ltr" | "rtl";
};

export const LOCALES: Locale[] = [
  { code: "en", name: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "de", name: "Deutsch", flag: "🇩🇪", dir: "ltr" },
  { code: "ka", name: "ქართული", flag: "🇬🇪", dir: "ltr" },
  { code: "es", name: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "fr", name: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "it", name: "Italiano", flag: "🇮🇹", dir: "ltr" },
  { code: "pt", name: "Português", flag: "🇵🇹", dir: "ltr" },
  { code: "ru", name: "Русский", flag: "🇷🇺", dir: "ltr" },
  { code: "uk", name: "Українська", flag: "🇺🇦", dir: "ltr" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷", dir: "ltr" },
  { code: "pl", name: "Polski", flag: "🇵🇱", dir: "ltr" },
  { code: "nl", name: "Nederlands", flag: "🇳🇱", dir: "ltr" },
  { code: "ar", name: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "zh", name: "中文", flag: "🇨🇳", dir: "ltr" },
  { code: "ja", name: "日本語", flag: "🇯🇵", dir: "ltr" },
  { code: "ko", name: "한국어", flag: "🇰🇷", dir: "ltr" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳", dir: "ltr" },
];

// German is the default — the project is presented/submitted (Abgabe) in
// Germany. The language switcher lets users pick any of the 17 locales.
export const DEFAULT_LOCALE = "de";

export const LOCALE_CODES = LOCALES.map((l) => l.code);

export function getLocale(code: string): Locale {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}
