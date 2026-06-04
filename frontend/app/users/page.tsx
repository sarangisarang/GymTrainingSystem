"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Protected from "@/components/Protected";
import { useTranslations } from "@/components/I18nProvider";
import { getUsers, type UserRead } from "@/lib/api";

export default function UsersPage() {
  return (
    <Protected>
      <UsersInner />
    </Protected>
  );
}

function UsersInner() {
  const t = useTranslations();
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
        setErr(e?.message ?? t("users.loadError"));
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
            <h1 className="h1">{t("users.title")}</h1>
            <p className="muted mt-2">{t("users.subtitle")}</p>
          </div>
          <Link className="btn-ghost" href="/dashboard">{t("users.back")}</Link>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <p className="muted">{t("users.loading")}</p>
      ) : users.length === 0 ? (
        <div className="card p-6">
          <p className="muted">{t("users.noUsers")}</p>
        </div>
      ) : (
        <div className="card overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-400">
              <tr>
                <th className="px-5 py-3">{t("users.colName")}</th>
                <th className="px-5 py-3">{t("users.colEmail")}</th>
                <th className="px-5 py-3">{t("users.colCreated")}</th>
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
