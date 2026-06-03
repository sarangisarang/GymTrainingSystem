"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import BadgeWatcher from "@/components/BadgeWatcher";
import { I18nProvider } from "@/components/I18nProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <BadgeWatcher />
          {children}
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
