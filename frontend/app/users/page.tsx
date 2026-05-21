"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Protected from "@/components/Protected";
import { getUsers, type UserRead } from "@/lib/api";

export default function UsersPage() {
  return (
    <Protected>
      <UsersInner />
    </Protected>
  );
}

function UsersInner() {
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await getUsers();
        setUsers(data);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load users");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="h1">Users</h1>
            <p className="muted mt-2">Admin-style list of all users.</p>
          </div>
          <Link className="btn-ghost" href="/dashboard">Back</Link>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : users.length === 0 ? (
        <div className="card p-6">
          <p className="muted">No users found.</p>
        </div>
      ) : (
        <div className="card overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-400">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-neutral-800">
                  <td className="px-5 py-3 font-medium">{u.name ?? "-"}</td>
                  <td className="px-5 py-3 text-neutral-300">{u.email}</td>
                  <td className="px-5 py-3 text-neutral-400">
                    {u.created_at ? new Date(u.created_at).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
