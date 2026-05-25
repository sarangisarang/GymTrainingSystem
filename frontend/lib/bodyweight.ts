// Body-weight entries are stored locally in the browser.
// The backend has no body-measurement table yet, so the body-weight
// trend chart is sourced from localStorage (same pattern as cart.ts).

export type BodyWeightEntry = {
  date: string; // ISO date "YYYY-MM-DD"
  weight: number; // kg
};

const KEY = "gym.bodyweight";

export function readBodyWeights(): BodyWeightEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as BodyWeightEntry[])
      .filter((e) => e && typeof e.date === "string" && Number.isFinite(e.weight))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

function writeBodyWeights(entries: BodyWeightEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(entries));
}

/** Add or replace the entry for a given date, returning the updated list. */
export function upsertBodyWeight(date: string, weight: number): BodyWeightEntry[] {
  const entries = readBodyWeights().filter((e) => e.date !== date);
  entries.push({ date, weight });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  writeBodyWeights(entries);
  return entries;
}

export function removeBodyWeight(date: string): BodyWeightEntry[] {
  const entries = readBodyWeights().filter((e) => e.date !== date);
  writeBodyWeights(entries);
  return entries;
}
