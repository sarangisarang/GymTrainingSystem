"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
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
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const update = () => setCartCount(readCart().length);
    update();
    const t = window.setInterval(update, 800);
    return () => window.clearInterval(t);
  }, []);

  const right = useMemo(() => {
    if (!user) {
      return (
        <div className="flex items-center gap-2">
          <Link className="btn-ghost" href="/login">Login</Link>
          <Link className="btn-primary" href="/register">Register</Link>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
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
          Logout
        </button>
      </div>
    );
  }, [logout, router, user]);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900">🏋️</span>
          <span>Gym Tracker</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/exercises" label="Exercises" />
          <NavLink href="/workouts" label="Workouts" />
          <NavLink href="/programs" label="Programs" />
          <NavLink href="/progress" label="Progress" />
          <NavLink href="/coach" label="🤖 KI-Coach" />
          <NavLink href="/report" label="📄 Report" />
          <Link
            href="/cart"
            className="rounded-xl px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            🧺 Cart{cartCount ? (
              <span className="ml-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{cartCount}</span>
            ) : null}
          </Link>
        </nav>

        {right}
      </div>
    </header>
  );
}
