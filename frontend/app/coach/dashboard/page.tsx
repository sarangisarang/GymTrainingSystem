"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { useTranslations } from "@/components/I18nProvider";
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
  const t = useTranslations();
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
      toast(t("coachDashboard.loadAthletesFailed"), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleBecomeCoach() {
    try {
      await becomeCoach();
      await refreshMe();
      toast(t("coachDashboard.becameCoach"), "success");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("coachDashboard.error"), "error");
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
      toast(`${athlete.email} ${t("coachDashboard.addedSuffix")}`, "success");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("coachDashboard.error"), "error");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(athleteId: string) {
    if (!confirm(t("coachDashboard.removeConfirm"))) return;
    try {
      await removeAthlete(athleteId);
      setAthletes((prev) => prev.filter((a) => a.athlete_id !== athleteId));
      if (selected?.athlete_id === athleteId) setSelected(null);
      toast(t("coachDashboard.removed"), "success");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("coachDashboard.error"), "error");
    }
  }

  async function handleSelect(athlete: AthleteProgress) {
    setSelected(athlete);
    setLoadingWorkouts(true);
    try {
      setAthleteWorkouts(await getAthleteWorkouts(athlete.athlete_id));
    } catch {
      toast(t("coachDashboard.workoutsLoadFailed"), "error");
    } finally {
      setLoadingWorkouts(false);
    }
  }

  if (!isCoach) {
    return (
      <div className="space-y-6">
        <div className="card p-8 text-center">
          <div className="text-5xl">👨‍💼</div>
          <h1 className="h1 mt-4">{t("coachDashboard.title")}</h1>
          <p className="muted mt-2">
            {t("coachDashboard.gateDesc")}
          </p>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={handleBecomeCoach}
          >
            {t("coachDashboard.becomeCoach")}
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
            <h1 className="h1">{t("coachDashboard.title")}</h1>
            <p className="muted mt-1">{athletes.length} {t("coachDashboard.athletesManaged")}</p>
          </div>
          <Link href="/programs" className="btn-ghost">{t("nav.programs")}</Link>
        </div>
      </div>

      {/* Invite */}
      <div className="card p-5">
        <h2 className="mb-3 font-semibold">{t("coachDashboard.inviteHeading")}</h2>
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
            {inviting ? "…" : t("coachDashboard.invite")}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-neutral-800" />)}
        </div>
      ) : athletes.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="muted">{t("coachDashboard.noAthletes")}</p>
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
                      <span>{a.completed_workouts} {t("coachDashboard.completed")}</span>
                      <span>{parseFloat(a.total_volume_kg).toLocaleString()} {t("common.kg")}</span>
                      {a.last_workout_date && <span>{t("coachDashboard.last")} {a.last_workout_date}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-red-400 hover:text-red-300"
                    onClick={(e) => { e.stopPropagation(); handleRemove(a.athlete_id); }}
                  >
                    {t("coachDashboard.remove")}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Athlete workouts */}
          <div className="card p-5">
            {!selected ? (
              <p className="muted text-center">{t("coachDashboard.selectAthlete")}</p>
            ) : loadingWorkouts ? (
              <div className="animate-pulse space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-neutral-800" />)}
              </div>
            ) : (
              <>
                <h2 className="mb-3 font-semibold">{selected.name || selected.email} — {t("coachDashboard.athleteWorkouts")}</h2>
                {athleteWorkouts.length === 0 ? (
                  <p className="muted text-sm">{t("coachDashboard.noWorkoutsYet")}</p>
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
                            <span className="ml-2 text-neutral-500">{w.workout_exercises.length} {t("common.exercises")}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-neutral-400">
                            {vol > 0 && <span>{vol.toLocaleString()} {t("common.kg")}</span>}
                            <span className={`rounded-full px-2 py-0.5 font-medium ${
                              w.status === "COMPLETED" ? "bg-green-500/20 text-green-300" :
                              w.status === "IN_PROGRESS" ? "bg-blue-500/20 text-blue-300" :
                              "bg-neutral-800 text-neutral-400"
                            }`}>{t(`status.${w.status}`)}</span>
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
