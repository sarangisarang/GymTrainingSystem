"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/components/I18nProvider";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
  onDismiss?: () => void;
};

type ToastOptions = {
  type?: ToastType;
  durationMs?: number;
  /** Fired when the user clicks the toast or it auto-dismisses. */
  onDismiss?: () => void;
};

type ToastContextValue = {
  toast: (message: string, typeOrOpts?: ToastType | ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const translate = useTranslations();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
    setToasts((prev) => {
      const t = prev.find((x) => x.id === id);
      if (t?.onDismiss) t.onDismiss();
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const toast = useCallback((message: string, typeOrOpts: ToastType | ToastOptions = "info") => {
    const opts: ToastOptions = typeof typeOrOpts === "string" ? { type: typeOrOpts } : typeOrOpts;
    const id = ++counter.current;
    const duration = opts.durationMs ?? 3500;
    setToasts((prev) => [...prev, { id, message, type: opts.type ?? "info", onDismiss: opts.onDismiss }]);
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
  }, [dismiss]);

  // Clear any pending timers on unmount to avoid setState-after-unmount in dev.
  useEffect(() => {
    const handles = timers.current;
    return () => { handles.forEach((h) => clearTimeout(h)); handles.clear(); };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* z-[1100] keeps toasts above the canvas-confetti overlay (zIndex 1000),
          so taps to dismiss are never absorbed. Safe-area padding + responsive
          inset keeps long German PR messages readable on iPhone/Android. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="fixed inset-x-4 bottom-4 z-[1100] flex flex-col gap-2 pointer-events-none sm:left-auto sm:right-4 sm:inset-x-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            title={translate("toast.close")}
            className={[
              "rounded-xl px-4 py-4 min-h-[48px] text-sm font-medium shadow-lg pointer-events-auto text-left cursor-pointer",
              "max-w-full break-words sm:max-w-sm",
              "animate-in fade-in slide-in-from-bottom-2 duration-200",
              "hover:brightness-110 active:scale-[0.98] transition",
              t.type === "success" && "bg-emerald-600 text-white",
              t.type === "error" && "bg-red-600 text-white",
              t.type === "info" && "bg-neutral-800 border border-neutral-700 text-neutral-100",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {t.message}
            <span className="sr-only"> (klicken zum Schließen)</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
