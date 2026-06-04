"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { useTranslations } from "@/components/I18nProvider";
import { getAchievements } from "@/lib/api";

/**
 * Once per session per user, fetch /achievements/ and surface a toast for
 * each badge the user earned with this fetch. Stays mounted at the app root.
 *
 * The backend persists badge awards, so on subsequent calls newly_earned is
 * empty — the user only sees a toast once per badge.
 */
export default function BadgeWatcher() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const t = useTranslations();
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (checkedFor.current === user.id) return;
    checkedFor.current = user.id;

    (async () => {
      try {
        const res = await getAchievements();
        for (const badge of res.newly_earned) {
          toast(`${badge.icon} ${t("badge.newBadge")}: ${badge.name}`, "success");
        }
      } catch {
        // silent — no badge state is non-critical
      }
    })();
  }, [user, loading, toast, t]);

  return null;
}
