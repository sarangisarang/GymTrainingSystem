"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getExercises, getApiBase, uploadExerciseImage, type ExerciseRead } from "@/lib/api";
import { addToCart } from "@/lib/cart";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import Protected from "@/components/Protected";

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Core", "Legs", "Glutes", "Cardio"];

export default function ExercisesPage() {
  return (
    <Protected>
      <ExercisesInner />
    </Protected>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="rounded-2xl bg-neutral-800 h-64" />
      ))}
    </div>
  );
}

function ExercisesInner() {
  const [items, setItems] = useState<ExerciseRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("ALL");

  const base = useMemo(() => getApiBase(), []);
  const { user } = useAuth();
  const { toast } = useToast();
  const isLoggedIn = !!user;

  async function load(opts?: { search?: string; muscle_group?: string }) {
    setLoading(true);
    setErr(null);
    try {
      const data = await getExercises({
        search: opts?.search || undefined,
        muscle_group: opts?.muscle_group && opts.muscle_group !== "ALL" ? opts.muscle_group : undefined,
      });
      setItems(data || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load exercises");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      load({ search, muscle_group: group });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, group]);

  async function uploadImage(exerciseId: string, file: File) {
    try {
      await uploadExerciseImage(exerciseId, file);
      toast("Image uploaded", "success");
      load({ search, muscle_group: group });
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    }
  }

  function imageSrc(ex: ExerciseRead) {
    if (ex.image_url) return ex.image_url.startsWith("http") ? ex.image_url : `${base}${ex.image_url}`;
    return "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=60";
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="h1">Exercises</h1>
            <p className="muted mt-2">Add exercises to your cart and build workouts.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn-ghost" href="/exercises/new">+ New exercise</Link>
            <button type="button" onClick={() => load({ search, muscle_group: group })} className="btn-ghost">
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label" htmlFor="exercise-search">Search</label>
            <input
              id="exercise-search"
              data-testid="exercise-search"
              className="input mt-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Bench press, squat…"
            />
          </div>
          <div>
            <label className="label" htmlFor="muscle-group-filter">Muscle group</label>
            <select
              id="muscle-group-filter"
              className="input mt-2"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="ALL">All</option>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{err}</div>
      )}

      {loading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="muted">No exercises found.</p>
          <Link href="/exercises/new" className="btn-primary mt-4 inline-block">Create one</Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((ex) => (
            <div key={ex.id} className="card overflow-hidden">
              <Link href={`/exercises/${ex.id}`} className="block">
                <div className="relative h-44 w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageSrc(ex)} alt={ex.name} className="h-full w-full object-cover" />
                </div>
              </Link>

              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/exercises/${ex.id}`} className="hover:underline">
                    <h2 className="text-lg font-semibold">{ex.name}</h2>
                  </Link>
                  <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300 shrink-0">
                    {ex.muscle_group}
                  </span>
                </div>

                {ex.description ? <p className="muted mt-3 line-clamp-3 text-sm">{ex.description}</p> : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      addToCart({
                        exerciseId: ex.id,
                        name: ex.name,
                        muscleGroup: ex.muscle_group,
                        imageUrl: ex.image_url,
                        sets: 3,
                        reps: 10,
                        weight: null,
                        restSeconds: 30,
                        restLimitSeconds: 45,
                      });
                      toast(`${ex.name} added to cart`, "success");
                    }}
                  >
                    Add to cart
                  </button>

                  <Link href="/cart" className="btn-ghost">Cart</Link>

                  {isLoggedIn && (
                    <label className="btn-ghost cursor-pointer" title="Upload image">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const input = e.currentTarget;
                          const file = input.files?.[0];
                          if (!file) return;
                          await uploadImage(ex.id, file);
                          input.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
