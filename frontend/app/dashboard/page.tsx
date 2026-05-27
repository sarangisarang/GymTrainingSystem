"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import { useAuth } from "@/components/AuthProvider";
import {
  getExercises,
  getWorkouts,
  getUserStats,
  getDashboardAnalytics,
  type UserStats,
  type WorkoutRead,
  type DashboardAnalytics,
} from "@/lib/api";
import { readCart } from "@/lib/cart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export default function DashboardPage() {
  return (
    <Protected>
      <DashboardInner />
    </Protected>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-xl bg-neutral-800" />
      ))}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PLANNED: "bg-neutral-800 text-neutral-400",
  IN_PROGRESS: "bg-blue-500/20 text-blue-300",
  COMPLETED: "bg-green-500/20 text-green-300",
  CANCELLED: "bg-red-500/20 text-red-300",
};

function StatusBadge({ status }: { status?: string | null }) {
  const s = status ?? "PLANNED";
  const cls = STATUS_STYLES[s] ?? STATUS_STYLES.PLANNED;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {s}
    </span>
  );
}

function DashboardInner() {
  const { user } = useAuth();
  const [exCount, setExCount] = useState(0);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutRead[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    setCartCount(readCart().length);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [ex, wo, st, an] = await Promise.all([
          getExercises(),
          getWorkouts({ limit: 5 }),
          getUserStats(),
          getDashboardAnalytics(),
        ]);
        setExCount(ex.length);
        setRecentWorkouts(wo);
        setStats(st);
        setAnalytics(an);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Skeleton />;

  const trend = analytics?.weekly_trend ?? [];
  const maxVol = Math.max(...trend.map((t) => t.volume_kg), 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="card p-6">
        <h1 className="h1">Dashboard</h1>
        <p className="muted mt-2">Welcome back, {user?.name || user?.email}.</p>
        {err && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        )}
      </div>

      {/* Activity stats (all workouts — streak, count) */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard icon="🔥" label="Current streak" value={`${stats?.current_streak ?? 0}`} sub={`best: ${stats?.best_streak ?? 0} days`} />
        <StatCard icon="📅" label="This week" value={`${stats?.workouts_this_week ?? 0}`} sub={`total: ${stats?.total_workouts ?? 0} workouts`} />
        <StatCard icon="💪" label="Top muscle" value={stats?.favorite_muscle_group ?? "—"} sub={`${exCount} exercises`} />
        <StatCard
          icon="⏱"
          label="Avg duration"
          value={analytics?.avg_duration_min != null ? `${analytics.avg_duration_min} min` : "—"}
          sub="completed only"
          highlight
        />
      </div>

      {/* Completed-only performance strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <PerfCard
          label="Completed workouts"
          value={analytics?.completed_count ?? 0}
          unit="sessions"
        />
        <PerfCard
          label="This week's volume"
          value={analytics?.weekly_volume_kg.toLocaleString() ?? "0"}
          unit="kg"
        />
        <PerfCard
          label="All-time volume"
          value={stats ? parseFloat(stats.total_volume_kg).toLocaleString() : "0"}
          unit="kg"
          sub="all workouts"
        />
      </div>

      {/* Weekly volume trend (COMPLETED only) */}
      {trend.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-neutral-200">
            Weekly volume — completed workouts
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <XAxis
                dataKey="week"
                tick={{ fill: "#737373", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#737373", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}t`}
                width={36}
              />
              <Tooltip
                contentStyle={{ background: "#171717", border: "1px solid #404040", borderRadius: 10 }}
                labelStyle={{ color: "#a3a3a3", fontSize: 12 }}
                formatter={(v: number) => [`${v.toLocaleString()} kg`, "Volume"]}
              />
              <Bar dataKey="volume_kg" radius={[4, 4, 0, 0]}>
                {trend.map((entry, i) => (
                  <Cell
                    key={entry.week}
                    fill={entry.volume_kg === maxVol ? "#6366f1" : "#3730a3"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-neutral-600">Last {trend.length} week{trend.length !== 1 ? "s" : ""} with completed workouts · peak highlighted</p>
        </div>
      )}

      {/* Top exercises */}
      {analytics && analytics.top_exercises.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-neutral-200">
            Top exercises by volume — completed
          </h2>
          <div className="space-y-3">
            {analytics.top_exercises.map((ex, i) => {
              const pct = Math.round((ex.volume_kg / analytics.top_exercises[0].volume_kg) * 100);
              return (
                <div key={ex.exercise_id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-neutral-200">
                      <span className="text-xs text-neutral-600">#{i + 1}</span>
                      {ex.name}
                    </span>
                    <span className="font-mono text-neutral-400">{ex.volume_kg.toLocaleString()} kg</span>
                  </div>
                  <meter
                    value={pct}
                    max={100}
                    className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-meter-bar]:rounded-full [&::-webkit-meter-bar]:bg-neutral-800 [&::-webkit-meter-optimum-value]:rounded-full [&::-webkit-meter-optimum-value]:bg-indigo-500 [&::-moz-meter-bar]:rounded-full [&::-moz-meter-bar]:bg-indigo-500"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/exercises" className="card p-5 hover:border-indigo-500/50 transition-colors">
          <div className="text-2xl">🏋️</div>
          <h2 className="mt-3 font-semibold">Exercises</h2>
          <p className="muted mt-1 text-sm">Browse and manage exercises</p>
        </Link>
        <Link href="/cart" className="card p-5 hover:border-indigo-500/50 transition-colors">
          <div className="text-2xl">🧺</div>
          <h2 className="mt-3 font-semibold">New Workout</h2>
          <p className="muted mt-1 text-sm">{cartCount > 0 ? `${cartCount} exercises in cart` : "Build a workout"}</p>
        </Link>
        <Link href="/programs" className="card p-5 hover:border-indigo-500/50 transition-colors">
          <div className="text-2xl">📊</div>
          <h2 className="mt-3 font-semibold">Programs</h2>
          <p className="muted mt-1 text-sm">Training programs from 1RM</p>
        </Link>
        <Link href="/progress" className="card p-5 hover:border-indigo-500/50 transition-colors">
          <div className="text-2xl">📈</div>
          <h2 className="mt-3 font-semibold">Progress</h2>
          <p className="muted mt-1 text-sm">Strength & volume charts</p>
        </Link>
      </div>

      {/* Recent workouts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Recent Workouts</h2>
          <Link href="/workouts" className="text-sm text-indigo-400 hover:text-indigo-300">
            View all
          </Link>
        </div>
        {recentWorkouts.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="muted">No workouts yet.</p>
            <Link href="/cart" className="btn-primary mt-4 inline-block">
              Start your first workout
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentWorkouts.map((w) => {
              const vol = w.workout_exercises.reduce(
                (s, we) => s + we.sets * we.reps * (Number(we.weight) || 0),
                0,
              );
              return (
                <Link
                  key={w.id}
                  href={`/workouts/${w.id}`}
                  className="card flex items-center justify-between p-4 hover:border-indigo-500/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{w.date}</p>
                        <StatusBadge status={w.status} />
                      </div>
                      <p className="muted text-sm">
                        {w.workout_exercises.length} exercise{w.workout_exercises.length !== 1 ? "s" : ""}
                        {w.duration_seconds ? ` · ${Math.round(w.duration_seconds / 60)} min` : ""}
                        {vol > 0 ? ` · ${vol.toLocaleString()} kg` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-neutral-500">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  highlight = false,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="text-2xl">{icon}</div>
      <p className="muted mt-2 text-xs">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? "text-indigo-400" : ""}`}>
        {value}
      </p>
      {sub && <p className="muted text-xs">{sub}</p>}
    </div>
  );
}

function PerfCard({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string | number;
  unit: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
      <p className="text-xs text-indigo-300/70">{label}</p>
      <p className="mt-1 text-3xl font-bold text-indigo-300">{value}</p>
      <p className="text-xs text-indigo-400/60">{unit}{sub ? ` · ${sub}` : ""}</p>
    </div>
  );
}
