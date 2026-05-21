"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import { useAuth } from "@/components/AuthProvider";
import { getExercises, getWorkouts, getUserStats, type UserStats, type WorkoutRead } from "@/lib/api";
import { readCart } from "@/lib/cart";

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

function DashboardInner() {
  const { user } = useAuth();
  const [exCount, setExCount] = useState(0);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutRead[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
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
        const [ex, wo, st] = await Promise.all([
          getExercises(),
          getWorkouts({ limit: 3 }),
          getUserStats(),
        ]);
        setExCount(ex.length);
        setRecentWorkouts(wo);
        setStats(st);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-8">
      <div className="card p-6">
        <h1 className="h1">Dashboard</h1>
        <p className="muted mt-2">Welcome back, {user?.name || user?.email}.</p>
        {err && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <div className="card p-5">
          <div className="text-2xl">🔥</div>
          <p className="muted mt-2 text-xs">Current streak</p>
          <p className="mt-1 text-3xl font-semibold">{stats?.current_streak ?? 0}</p>
          <p className="muted text-xs">best: {stats?.best_streak ?? 0} days</p>
        </div>
        <div className="card p-5">
          <div className="text-2xl">📅</div>
          <p className="muted mt-2 text-xs">This week</p>
          <p className="mt-1 text-3xl font-semibold">{stats?.workouts_this_week ?? 0}</p>
          <p className="muted text-xs">total: {stats?.total_workouts ?? 0} workouts</p>
        </div>
        <div className="card p-5">
          <div className="text-2xl">⚖️</div>
          <p className="muted mt-2 text-xs">Total volume</p>
          <p className="mt-1 text-2xl font-semibold">
            {stats ? parseFloat(stats.total_volume_kg).toLocaleString() : 0} kg
          </p>
        </div>
        <div className="card p-5">
          <div className="text-2xl">💪</div>
          <p className="muted mt-2 text-xs">Top muscle</p>
          <p className="mt-1 text-xl font-semibold">{stats?.favorite_muscle_group ?? "—"}</p>
          <p className="muted text-xs">{exCount} exercises total</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-3">
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
            {recentWorkouts.map((w) => (
              <Link
                key={w.id}
                href={`/workouts/${w.id}`}
                className="card flex items-center justify-between p-4 hover:border-indigo-500/50 transition-colors"
              >
                <div>
                  <p className="font-medium">{w.date}</p>
                  <p className="muted text-sm">
                    {w.workout_exercises.length} exercise{w.workout_exercises.length !== 1 ? "s" : ""}
                    {w.notes ? ` · ${w.notes}` : ""}
                  </p>
                </div>
                <span className="text-neutral-500">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
