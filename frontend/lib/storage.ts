"use client";

const KEY = "gym.selectedUser";

export type SelectedUser = {
  id: string;
  name: string;
  email: string;
};

export function getSelectedUser(): SelectedUser | null {
  // This helper is client-only. It safely reads from localStorage.
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SelectedUser;
  } catch {
    return null;
  }
}

export function setSelectedUser(user: SelectedUser) {
  // Persist a simple “session” without passwords/tokens.
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearSelectedUser() {
  localStorage.removeItem(KEY);
}
