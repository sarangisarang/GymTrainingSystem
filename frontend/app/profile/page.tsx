"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { useTranslations } from "@/components/I18nProvider";
import {
  updateProfile,
  changePassword,
  getAchievements,
  getWeeklyChallenge,
  setLeaderboardOptIn,
  type AchievementsRead,
  type WeeklyChallengeRead,
} from "@/lib/api";

export default function ProfilePage() {
  return (
    <Protected>
      <ProfileInner />
    </Protected>
  );
}

function ProfileInner() {
  const { user, refreshMe } = useAuth();
  const { toast } = useToast();
  const t = useTranslations();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [nameSaving, setNameSaving] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [achievements, setAchievements] = useState<AchievementsRead | null>(null);
  const [challenge, setChallenge] = useState<WeeklyChallengeRead | null>(null);
  const [optInSaving, setOptInSaving] = useState(false);

  useEffect(() => {
    Promise.all([getAchievements(), getWeeklyChallenge()])
      .then(([a, c]) => { setAchievements(a); setChallenge(c); })
      .catch(() => {});
  }, []);

  async function toggleOptIn() {
    if (!user) return;
    setOptInSaving(true);
    try {
      await setLeaderboardOptIn(!user.leaderboard_opt_in);
      await refreshMe();
      toast(
        !user.leaderboard_opt_in
          ? t("profile.nowVisible")
          : t("profile.removedFromLeaderboard"),
        "success",
      );
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("profile.saveFailed"), "error");
    } finally {
      setOptInSaving(false);
    }
  }

  async function saveName() {
    setNameSaving(true);
    try {
      await updateProfile({ name: name.trim() || null });
      await refreshMe();
      toast(t("profile.nameUpdated"), "success");
      setEditing(false);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("profile.updateFailed"), "error");
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast(t("register.mismatch"), "error");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword({ old_password: oldPassword, new_password: newPassword });
      toast(t("profile.passwordChanged"), "success");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : t("profile.passwordChangeFailed"), "error");
    } finally {
      setPwSaving(false);
    }
  }

  const pwMismatch = !!confirmPassword && newPassword !== confirmPassword;

  const strength =
    newPassword.length === 0 ? null :
    newPassword.length < 8 ? "weak" :
    newPassword.length < 12 ? "ok" : "strong";

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="h1">{t("profile.title")}</h1>
        <p className="muted mt-2">{t("profile.subtitle")}</p>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("profile.account")}</h2>
          {!editing && (
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => { setName(user?.name || ""); setEditing(true); }}
            >
              {t("profile.editName")}
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="edit-name">{t("profile.name")}</label>
              <input
                id="edit-name"
                className="input mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("profile.namePlaceholder")}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={saveName} disabled={nameSaving}>
                {nameSaving ? t("profile.saving") : t("profile.save")}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>{t("profile.cancel")}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="muted text-xs">{t("profile.name")}</p>
              <p className="mt-1 font-medium">{user?.name || "—"}</p>
            </div>
            <div>
              <p className="muted text-xs">{t("profile.email")}</p>
              <p className="mt-1 font-medium">{user?.email}</p>
            </div>
            <div>
              <p className="muted text-xs">{t("profile.memberSince")}</p>
              <p className="mt-1 text-sm text-neutral-300">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        )}
      </div>

      {challenge && (
        <div className="card p-6">
          <h2 className="font-semibold mb-1">{t("profile.weeklyChallenge")} · {challenge.week}</h2>
          <p className="muted text-sm mb-4">{challenge.label}</p>
          <div className="mb-2 flex items-end justify-between">
            <p className="text-2xl font-bold text-indigo-400">
              {challenge.current_kg.toLocaleString("de-DE")} {t("common.kg")}
            </p>
            <p className="muted text-sm">
              {t("profile.goal")}: {challenge.target_kg.toLocaleString("de-DE")} {t("common.kg")}
            </p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${challenge.completed ? "bg-emerald-500" : "bg-indigo-500"}`}
              style={{ width: `${Math.min(challenge.progress * 100, 100)}%` }}
            />
          </div>
          {challenge.completed && (
            <p className="mt-3 text-sm font-medium text-emerald-400">{t("profile.challengeDone")} 🎉</p>
          )}
        </div>
      )}

      {achievements && (
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{t("profile.badges")}</h2>
            <p className="muted text-xs">
              {achievements.badges.filter((b) => b.earned).length}/{achievements.badges.length}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {achievements.badges.map((b) => (
              <div
                key={b.id}
                className={`rounded-xl border p-4 text-center transition ${
                  b.earned
                    ? "border-indigo-500/50 bg-indigo-500/10"
                    : "border-neutral-800 bg-neutral-900 opacity-60"
                }`}
              >
                <div className={`text-4xl ${b.earned ? "" : "grayscale"}`}>{b.icon}</div>
                <p className="mt-2 font-semibold text-neutral-100">{b.name}</p>
                <p className="mt-1 text-xs text-neutral-400">{b.description}</p>
                {b.earned && b.earned_at && (
                  <p className="mt-2 text-xs text-indigo-300">
                    {t("profile.earnedOn")} {new Date(b.earned_at).toLocaleDateString("de-DE")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">{t("profile.leaderboard")}</h2>
            <p className="muted mt-1 text-sm">
              {t("profile.optInPrefix")}{" "}
              <Link href="/leaderboard" className="text-indigo-400 hover:underline">
                {t("profile.leaderboard")}
              </Link>{" "}
              {t("profile.optInSuffix")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!user?.leaderboard_opt_in}
            aria-label={t("profile.toggleLeaderboard")}
            disabled={optInSaving}
            onClick={toggleOptIn}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
              user?.leaderboard_opt_in ? "bg-indigo-600" : "bg-neutral-700"
            } ${optInSaving ? "opacity-50" : ""}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                user?.leaderboard_opt_in ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">{t("profile.changePassword")}</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="label" htmlFor="old-password">{t("profile.currentPassword")}</label>
            <input
              id="old-password"
              className="input mt-2"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="new-password">{t("profile.newPassword")}</label>
            <input
              id="new-password"
              className="input mt-2"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
            {strength && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-700">
                  <div
                    className={[
                      "h-full rounded-full transition-all duration-300",
                      strength === "weak" && "w-1/4 bg-red-500",
                      strength === "ok" && "w-2/4 bg-yellow-500",
                      strength === "strong" && "w-full bg-emerald-500",
                    ].filter(Boolean).join(" ")}
                  />
                </div>
                <span className={[
                  "text-xs",
                  strength === "weak" && "text-red-400",
                  strength === "ok" && "text-yellow-400",
                  strength === "strong" && "text-emerald-400",
                ].filter(Boolean).join(" ")}>
                  {strength === "weak" ? t("register.strengthWeak") : strength === "ok" ? t("register.strengthOk") : t("register.strengthStrong")}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">{t("profile.confirmNewPassword")}</label>
            <input
              id="confirm-password"
              className={["input mt-2", pwMismatch ? "border-red-500/60 focus:ring-red-500/40" : ""].join(" ")}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {pwMismatch && <p className="mt-1 text-xs text-red-400">{t("register.mismatch")}</p>}
          </div>
          <button
            className="btn-primary"
            type="submit"
            disabled={pwSaving || pwMismatch}
          >
            {pwSaving ? t("profile.saving") : t("profile.changePassword")}
          </button>
        </form>
      </div>
    </div>
  );
}
