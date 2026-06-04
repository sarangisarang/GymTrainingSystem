"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createUser } from "@/lib/api";
import { setSelectedUser } from "@/lib/storage";
import { useTranslations } from "@/components/I18nProvider";

export default function NewUserPage() {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const u = await createUser({ name, email, password });
      setSelectedUser({
  id: u.id,
  name: u.name ?? "",
  email: u.email,
});

      router.push("/workouts");
    } catch (e: any) {
      setErr(e?.message ?? t("userNew.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">{t("userNew.title")}</h1>
        <Link className="btn-ghost" href="/users">{t("userNew.back")}</Link>
      </div>

      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        {err && <p className="text-sm text-red-600">{err}</p>}

        <div>
          <label className="label">{t("leaderboard.colName")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <label className="label">{t("login.email")}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div>
          <label className="label">{t("login.password")}</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <p className="mt-1 text-xs text-zinc-500">
            {t("userNew.passwordHint")}
          </p>
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? t("userNew.creating") : t("userNew.create")}
          </button>
          <button className="btn-ghost" type="button" onClick={() => router.push("/users")}>
            {t("userNew.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
