"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useTranslations } from "@/components/I18nProvider";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { readCart } from "@/lib/cart";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname?.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={
        "rounded-xl px-3 py-2 text-sm transition " +
        (active ? "bg-neutral-800 text-neutral-50" : "text-neutral-300 hover:bg-neutral-900")
      }
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const t = useTranslations();
  const [cartCount, setCartCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const update = () => setCartCount(readCart().length);
    update();
    const t = window.setInterval(update, 800);
    return () => window.clearInterval(t);
  }, []);

  const right = useMemo(() => {
    if (!user) {
      return (
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link className="btn-ghost" href="/login">{t("auth.login")}</Link>
          <Link className="btn-primary" href="/register">{t("auth.register")}</Link>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Link className="btn-ghost" href="/profile">
          👤 {user.name || user.email}
        </Link>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            logout();
            router.push("/");
          }}
        >
          {t("auth.logout")}
        </button>
      </div>
    );
  }, [logout, router, user, t]);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900">🏋️</span>
          <span>Gym Tracker</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink href="/dashboard" label={t("nav.dashboard")} />
          <NavLink href="/exercises" label={t("nav.exercises")} />
          <NavLink href="/workouts" label={t("nav.workouts")} />
          <NavLink href="/programs" label={t("nav.programs")} />
          <NavLink href="/progress" label={t("nav.progress")} />
          <NavLink href="/rep-counter" label={`📷 ${t("nav.repCounter")}`} />
          <NavLink href="/coach" label={`🤖 ${t("nav.coach")}`} />
          <NavLink href="/coach/dashboard" label={`👨‍💼 ${t("nav.coachDashboard")}`} />
          <NavLink href="/report" label={`📄 ${t("nav.report")}`} />
          <NavLink href="/leaderboard" label={`🏆 ${t("nav.leaderboard")}`} />
          {mounted && cartCount > 0 && (
            <Link
              href="/cart"
              className="rounded-xl px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              🧺 <span className="ml-1 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{cartCount}</span>
            </Link>
          )}
        </nav>

        {right}
      </div>
    </header>
  );
}
