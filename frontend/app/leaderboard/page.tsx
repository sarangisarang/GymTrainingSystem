"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import { getLeaderboard, type LeaderboardRead } from "@/lib/api";

export default function LeaderboardPage() {
  return (
    <Protected>
      <LeaderboardInner />
    </Protected>
  );
}

function LeaderboardInner() {
  const [data, setData] = useState<LeaderboardRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getLeaderboard()
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="h1">Leaderboard</h1>
        <p className="muted mt-2">
          Top-Athleten nach bestem Streak (Streichkriterium: Gesamtvolumen).
        </p>
        {err && (
          <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </p>
        )}
      </div>

      {data && !data.self_opted_in && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          Du bist aktuell nicht im Leaderboard sichtbar.{" "}
          <Link href="/profile" className="font-medium underline">
            Im Profil aktivieren
          </Link>
          .
        </div>
      )}

      {data && data.entries.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="muted">Noch keine teilnehmenden Nutzer.</p>
        </div>
      ) : (
        <div className="card p-2">
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-left">Rang</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-right">Bester Streak</th>
                <th className="px-4 py-3 text-right">Gesamtvolumen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {data?.entries.map((e) => (
                <tr
                  key={e.rank}
                  className={e.is_self ? "bg-indigo-500/10" : ""}
                >
                  <td className="px-4 py-3 font-mono">
                    {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `#${e.rank}`}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-100">
                    {e.name}{" "}
                    {e.is_self && (
                      <span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300">
                        Du
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-indigo-400">
                    {e.best_streak} Tage
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-neutral-300">
                    {e.total_volume_kg.toLocaleString("de-DE")} kg
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
