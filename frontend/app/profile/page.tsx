"use client";

import { useState } from "react";
import Protected from "@/components/Protected";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { updateProfile, changePassword } from "@/lib/api";

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

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [nameSaving, setNameSaving] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  async function saveName() {
    setNameSaving(true);
    try {
      await updateProfile({ name: name.trim() || null });
      await refreshMe();
      toast("Name updated", "success");
      setEditing(false);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast("Passwords do not match", "error");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword({ old_password: oldPassword, new_password: newPassword });
      toast("Password changed successfully", "success");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Failed to change password", "error");
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
        <h1 className="h1">Profile</h1>
        <p className="muted mt-2">Manage your account details.</p>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Account</h2>
          {!editing && (
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => { setName(user?.name || ""); setEditing(true); }}
            >
              Edit name
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="edit-name">Name</label>
              <input
                id="edit-name"
                className="input mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={saveName} disabled={nameSaving}>
                {nameSaving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="muted text-xs">Name</p>
              <p className="mt-1 font-medium">{user?.name || "—"}</p>
            </div>
            <div>
              <p className="muted text-xs">Email</p>
              <p className="mt-1 font-medium">{user?.email}</p>
            </div>
            <div>
              <p className="muted text-xs">Member since</p>
              <p className="mt-1 text-sm text-neutral-300">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Change password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="label" htmlFor="old-password">Current password</label>
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
            <label className="label" htmlFor="new-password">New password</label>
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
                  {strength === "weak" ? "Too short" : strength === "ok" ? "OK" : "Strong"}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              className={["input mt-2", pwMismatch ? "border-red-500/60 focus:ring-red-500/40" : ""].join(" ")}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {pwMismatch && <p className="mt-1 text-xs text-red-400">Passwords do not match</p>}
          </div>
          <button
            className="btn-primary"
            type="submit"
            disabled={pwSaving || pwMismatch}
          >
            {pwSaving ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
