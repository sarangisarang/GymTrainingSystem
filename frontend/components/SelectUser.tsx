"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getUsers } from "@/lib/api";
import type { User } from "@/lib/types";
import { getSelectedUser, setSelectedUser, clearSelectedUser } from "@/lib/storage";

export default function SelectUser() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
  const current = getSelectedUser();
  setSelectedId(current?.id ?? null);

  (async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await getUsers();

      // ✅ Normalize backend UserRead[] → UI User[]
      setUsers(
        data.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name ?? "",
          created_at: u.created_at ?? "",
        }))
      );
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  })();
}, []);


  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedId) ?? null,
    [users, selectedId]
  );

  function onChange(id: string) {
    setSelectedId(id);
    const u = users.find((x) => x.id === id);
    if (u) setSelectedUser({ id: u.id, name: u.name, email: u.email });
  }

  if (loading) {
    return <p className="text-sm text-zinc-600">Loading users…</p>;
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-sm text-red-600">{err}</p>}

      {users.length === 0 ? (
        <div className="text-sm text-zinc-600">
          No users yet. <Link className="underline" href="/users/new">Create one</Link>.
        </div>
      ) : (
        <div className="space-y-2">
          <label className="label">Choose user</label>
          <select
            className="input"
            value={selectedId ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="" disabled>
              Select…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>

          {selectedUser ? (
            <div className="flex items-center justify-between rounded-xl bg-zinc-50 p-3">
              <div>
                <p className="text-sm font-medium">Active: {selectedUser.name}</p>
                <p className="text-xs text-zinc-600">{selectedUser.email}</p>
              </div>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  clearSelectedUser();
                  setSelectedId(null);
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Tip: select a user to create workouts.</p>
          )}
        </div>
      )}
    </div>
  );
}
