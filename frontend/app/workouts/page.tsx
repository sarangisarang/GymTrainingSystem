"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Protected from "@/components/Protected";
import { useToast } from "@/components/Toast";
import { deleteWorkout, getWorkouts, type WorkoutRead } from "@/lib/api";

const PAGE_SIZE = 10;

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

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function WorkoutsPage() {
  return (
    <Protected>
      <WorkoutsInner />
    </Protected>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-neutral-800" />)}
    </div>
  );
}

function WorkoutsInner() {
  const { toast } = useToast();
  const [workouts, setWorkouts] = useState<WorkoutRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(skip = 0, replace = true) {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    setErr(null);
    try {
      const batch = await getWorkouts({ skip, limit: PAGE_SIZE });
      if (replace) {
        setWorkouts(batch);
      } else {
        setWorkouts((prev) => [...prev, ...batch]);
      }
      setHasMore(batch.length === PAGE_SIZE);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load workouts");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDelete(id: string) {
    if (!confirm("Delete this workout?")) return;
    try {
      await deleteWorkout(id);
      toast("Workout deleted", "success");
      load();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Failed to delete", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="h1">Workouts</h1>
            <p className="muted mt-2">Your saved workouts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-primary" href="/cart">+ New workout</Link>
            <button type="button" className="btn-ghost" onClick={() => load()}>Refresh</button>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{err}</div>
      )}

      {loading ? (
        <Skeleton />
      ) : workouts.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="muted">No workouts yet.</p>
          <Link href="/cart" className="btn-primary mt-4 inline-block">Start your first workout</Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {workouts.map((w) => (
              <div key={w.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/workouts/${w.id}`} className="font-medium hover:underline">
                        {new Date(w.date).toLocaleDateString()} — {w.workout_exercises?.length ?? 0} exercise{w.workout_exercises?.length !== 1 ? "s" : ""}
                      </Link>
                      <StatusBadge status={w.status} />
                    </div>
                    {w.notes ? <p className="muted mt-1 text-sm">{w.notes}</p> : <p className="muted mt-1 text-sm">No notes</p>}
                    {w.duration_seconds ? (
                      <p className="muted mt-0.5 text-xs">{formatDuration(w.duration_seconds)}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link className="btn-primary" href={`/workouts/${w.id}/start`}>Start</Link>
                    <Link className="btn-ghost" href={`/workouts/${w.id}`}>View</Link>
                    <button type="button" className="btn-ghost" onClick={() => onDelete(w.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                className="btn-ghost"
                disabled={loadingMore}
                onClick={() => load(workouts.length, false)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
