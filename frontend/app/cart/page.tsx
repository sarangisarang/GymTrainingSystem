"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Protected from "@/components/Protected";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { clearCart, readCart, removeFromCart, writeCart, type CartItem } from "@/lib/cart";
import { createWorkout, getApiBase } from "@/lib/api";

export default function CartPage() {
  return (
    <Protected>
      <CartInner />
    </Protected>
  );
}

function toNum(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function CartInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const base = useMemo(() => getApiBase(), []);

  const [items, setItems] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [workoutDate, setWorkoutDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setItems(readCart());
  }, []);

  function img(url?: string | null) {
    if (!url) return "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=60";
    if (url.startsWith("http")) return url;
    return `${base}${url}`;
  }

  function updateItem(exerciseId: string, patch: Partial<CartItem>) {
    const next = items.map((it) => (it.exerciseId === exerciseId ? { ...it, ...patch } : it));
    setItems(next);
    writeCart(next);
  }

  async function onCreateWorkout() {
    if (!user?.id) return;
    if (items.length === 0) {
      toast("Your cart is empty", "error");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        workout_date: workoutDate,
        notes: notes || null,
        exercises: items.map((it, index) => ({
          exercise_id: it.exerciseId,
          sets: Number(it.sets) || 0,
          reps: Number(it.reps) || 0,
          weight: toNum(it.weight),
          rest_seconds: Number(it.restSeconds) || 0,
          rest_limit_seconds: Number(it.restLimitSeconds) || 0,
          order_index: index,
        })),
      };

      const created = await createWorkout(payload);
      clearCart();
      setItems([]);
      toast("Workout created!", "success");
      router.push(`/workouts/${created.id}`);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Failed to create workout", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="h1">Cart</h1>
        <p className="muted mt-2">Adjust sets, reps, weight and rest timing, then create your workout.</p>
      </div>

      {items.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="muted">Your cart is empty.</p>
          <a href="/exercises" className="btn-primary mt-4 inline-block">Browse exercises</a>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((it) => {
            const eid = it.exerciseId;
            return (
              <div key={eid} className="card p-5">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img(it.imageUrl)} alt={it.name} className="h-16 w-20 rounded-xl object-cover" />
                      <div>
                        <p className="font-semibold">{it.name}</p>
                        <p className="muted">{it.muscleGroup}</p>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-wrap gap-3 md:justify-end">
                      <div>
                        <label className="label" htmlFor={`sets-${eid}`}>Sets</label>
                        <input
                          id={`sets-${eid}`}
                          className="input mt-2 w-24"
                          type="number"
                          min={1}
                          value={it.sets}
                          onChange={(e) => updateItem(eid, { sets: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`reps-${eid}`}>Reps</label>
                        <input
                          id={`reps-${eid}`}
                          className="input mt-2 w-24"
                          type="number"
                          min={1}
                          value={it.reps}
                          onChange={(e) => updateItem(eid, { reps: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`weight-${eid}`}>Weight</label>
                        <input
                          id={`weight-${eid}`}
                          className="input mt-2 w-28"
                          type="number"
                          step="0.25"
                          value={it.weight ?? ""}
                          onChange={(e) => updateItem(eid, { weight: e.target.value === "" ? null : Number(e.target.value) })}
                          placeholder="kg"
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-ghost mt-6 md:mt-7"
                        onClick={() => {
                          removeFromCart(eid);
                          setItems(readCart());
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label className="label" htmlFor={`rest-${eid}`}>Recommended rest (sec)</label>
                      <input
                        id={`rest-${eid}`}
                        className="input mt-2"
                        type="number"
                        min={0}
                        max={3600}
                        value={it.restSeconds ?? 30}
                        onChange={(e) => updateItem(eid, { restSeconds: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`rest-limit-${eid}`}>Rest limit (sec)</label>
                      <input
                        id={`rest-limit-${eid}`}
                        className="input mt-2"
                        type="number"
                        min={0}
                        max={7200}
                        value={it.restLimitSeconds ?? 45}
                        onChange={(e) => updateItem(eid, { restLimitSeconds: Number(e.target.value) })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-300">
                        Timer: green → recommended rest, yellow → near limit, red → over limit.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card p-6">
        <h2 className="h2">Workout details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="workout-date">Date</label>
            <input
              id="workout-date"
              className="input mt-2"
              type="date"
              value={workoutDate}
              onChange={(e) => setWorkoutDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="workout-notes">Notes (optional)</label>
            <input
              id="workout-notes"
              className="input mt-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Leg day, felt strong…"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="btn-primary"
            type="button"
            disabled={loading || items.length === 0}
            onClick={onCreateWorkout}
          >
            {loading ? "Creating…" : "Create workout"}
          </button>
          <button
            className="btn-ghost"
            type="button"
            disabled={items.length === 0}
            onClick={() => { clearCart(); setItems([]); }}
          >
            Clear cart
          </button>
        </div>
      </div>
    </div>
  );
}
