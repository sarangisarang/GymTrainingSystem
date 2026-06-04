"use client";

// Locale-aware banner shown above the German-only privacy policy. When the
// user has picked a non-German locale we make the language limitation visible
// up front; without this they would land here from a footer link that the
// EN-first i18n fallback rendered in English/their locale, and only then
// discover the page itself is German.
import { useI18n } from "@/components/I18nProvider";

const NOTICES: Record<string, string> = {
  en: "This privacy policy is currently only available in German. A translated version is planned.",
  fr: "Cette politique de confidentialité n'est actuellement disponible qu'en allemand.",
  es: "Esta política de privacidad solo está disponible en alemán por ahora.",
  it: "Questa informativa sulla privacy è attualmente disponibile solo in tedesco.",
  pt: "Esta política de privacidade está atualmente disponível apenas em alemão.",
  ru: "Эта политика конфиденциальности в настоящее время доступна только на немецком языке.",
  uk: "Ця політика конфіденційності наразі доступна лише німецькою мовою.",
  tr: "Bu gizlilik politikası şu anda yalnızca Almanca olarak mevcuttur.",
  pl: "Niniejsza polityka prywatności jest obecnie dostępna tylko w języku niemieckim.",
  nl: "Dit privacybeleid is momenteel alleen in het Duits beschikbaar.",
  ar: "سياسة الخصوصية هذه متاحة حاليًا باللغة الألمانية فقط.",
  zh: "本隐私政策目前仅以德文提供。",
  ja: "このプライバシーポリシーは現在ドイツ語のみで提供されています。",
  ko: "이 개인정보 보호정책은 현재 독일어로만 제공됩니다.",
  hi: "यह गोपनीयता नीति वर्तमान में केवल जर्मन में उपलब्ध है।",
  ka: "ეს კონფიდენციალურობის პოლიტიკა ამჟამად ხელმისაწვდომია მხოლოდ გერმანულ ენაზე.",
};

export default function LocaleNotice() {
  const { locale } = useI18n();
  if (locale === "de") return null;
  const text = NOTICES[locale] ?? NOTICES.en;
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-700/40 bg-amber-900/10 p-4 text-sm text-amber-200"
    >
      {text}
    </div>
  );
}
