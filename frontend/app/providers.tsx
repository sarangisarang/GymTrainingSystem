"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import BadgeWatcher from "@/components/BadgeWatcher";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <BadgeWatcher />
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}
