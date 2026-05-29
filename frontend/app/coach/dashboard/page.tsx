"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import {
  becomeCoach,
  inviteAthlete,
  removeAthlete,
  getCoachAthletes,
  getAthleteWorkouts,
  type AthleteProgress,
  type WorkoutRead,
} from "@/lib/api";

export default function CoachDashboardPage() {
  return (
    <Protected>
      <CoachDashboardInner />
    </Protected>
  );
}

function CoachDashboardInner() {
  const { user, refreshMe } = useAuth();
  const { toast } = useToast();
  const [athletes, setAthletes] = useState<AthleteProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<AthleteProgress | null>(null);
  const [athleteWorkouts, setAthleteWorkouts] = useState<WorkoutRead[]>([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);

  const isCoach = user?.role === "coach";

  useEffect(() => {
    if (isCoach) loadAthletes();
    else setLoading(false);
  }, [isCoach]);

  async function loadAthletes() {
    setLoading(true);
    try {
      setAthletes(await getCoachAthletes());
    } catch {
      toast("Failed to load athletes", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleBecomeCoach() {
    try {
      await becomeCoach();
      await refreshMe();
      toast("Du bist jetzt Coach!", "success");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const athlete = await inviteAthlete(inviteEmail.trim());
      setAthletes((prev) => [...prev.filter((a) => a.athlete_id !== athlete.athlete_id), athlete]);
      setInviteEmail("");
      toast(`${athlete.email} hinzugefügt`, "success");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(athleteId: string) {
    if (!confirm("Athlete entfernen?")) return;
    try {
      await removeAthlete(athleteId);
      setAthletes((prev) => prev.filter((a) => a.athlete_id !== athleteId));
      if (selected?.athlete_id === athleteId) setSelected(null);
      toast("Entfernt", "success");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }

  async function handleSelect(athlete: AthleteProgress) {
    setSelected(athlete);
    setLoadingWorkouts(true);
    try {
      setAthleteWorkouts(await getAthleteWorkouts(athlete.athlete_id));
    } catch {
      toast("Workouts konnten nicht geladen werden", "error");
    } finally {
      setLoadingWorkouts(false);
    }
  }

  if (!isCoach) {
    return (
      <div className="space-y-6">
        <div className="card p-8 text-center">
          <div className="text-5xl">👨‍💼</div>
          <h1 className="h1 mt-4">Coach-Dashboard</h1>
          <p className="muted mt-2">
            Als Coach kannst du Athleten betreuen, ihre Workouts einsehen und Programme zuweisen.
          </p>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={handleBecomeCoach}
          >
            Coach werden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="h1">Coach-Dashboard</h1>
            <p className="muted mt-1">{athletes.length} Athlet{athletes.length !== 1 ? "en" : ""} betreut</p>
          </div>
          <Link href="/programs" className="btn-ghost">Programme</Link>
        </div>
      </div>

      {/* Invite */}
      <div className="card p-5">
        <h2 className="mb-3 font-semibold">Athleten einladen</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            placeholder="athlete@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="input flex-1"
            required
          />
          <button type="submit" className="btn-primary" disabled={inviting}>
            {inviting ? "…" : "Einladen"}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-neutral-800" />)}
        </div>
      ) : athletes.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="muted">Noch keine Athleten. Lade jemanden ein.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          {/* Athlete list */}
          <div className="space-y-3">
            {athletes.map((a) => (
              <div
                key={a.athlete_id}
                className={`card cursor-pointer p-4 transition-colors hover:border-indigo-500/50 ${
                  selected?.athlete_id === a.athlete_id ? "border-indigo-500/60 bg-indigo-500/5" : ""
                }`}
                onClick={() => handleSelect(a)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{a.name || a.email}</p>
                    <p className="muted text-xs">{a.email}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-400">
                      <span>{a.completed_workouts} abgeschlossen</span>
                      <span>{parseFloat(a.total_volume_kg).toLocaleString()} kg</span>
                      {a.last_workout_date && <span>Letztes: {a.last_workout_date}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-red-400 hover:text-red-300"
                    onClick={(e) => { e.stopPropagation(); handleRemove(a.athlete_id); }}
                  >
                    Entfernen
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Athlete workouts */}
          <div className="card p-5">
            {!selected ? (
              <p className="muted text-center">Athleten auswählen um Workouts zu sehen.</p>
            ) : loadingWorkouts ? (
              <div className="animate-pulse space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-neutral-800" />)}
              </div>
            ) : (
              <>
                <h2 className="mb-3 font-semibold">{selected.name || selected.email} — Workouts</h2>
                {athleteWorkouts.length === 0 ? (
                  <p className="muted text-sm">Noch keine Workouts.</p>
                ) : (
                  <div className="space-y-2">
                    {athleteWorkouts.map((w) => {
                      const vol = w.workout_exercises.reduce(
                        (s, we) => s + we.sets * we.reps * (Number(we.weight) || 0), 0
                      );
                      return (
                        <div key={w.id} className="flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2 text-sm">
                          <div>
                            <span className="text-neutral-200">{w.date}</span>
                            <span className="ml-2 text-neutral-500">{w.workout_exercises.length} Übungen</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-neutral-400">
                            {vol > 0 && <span>{vol.toLocaleString()} kg</span>}
                            <span className={`rounded-full px-2 py-0.5 font-medium ${
                              w.status === "COMPLETED" ? "bg-green-500/20 text-green-300" :
                              w.status === "IN_PROGRESS" ? "bg-blue-500/20 text-blue-300" :
                              "bg-neutral-800 text-neutral-400"
                            }`}>{w.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
