"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useTranslations } from "@/components/I18nProvider";

/**
 * Client-side route guard.
 * Redirects to /login if user is not authenticated.
 */
export default function Protected({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const t = useTranslations();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <p className="text-sm text-neutral-300">{t("workouts.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}
