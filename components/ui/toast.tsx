"use client";

import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info";

export type ToastInput = {
  type?: ToastType;
  title: string;
  description?: string;
  durationMs?: number;
};

type ToastRecord = Required<Omit<ToastInput, "durationMs">> & {
  id: string;
};

const TOAST_EVENT = "ventureos:toast";

export function showToast(toast: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: toast }));
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  useEffect(() => {
    function addToast(event: Event) {
      const detail = (event as CustomEvent<ToastInput>).detail;
      if (!detail?.title) return;

      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const record: ToastRecord = {
        id,
        type: detail.type ?? "info",
        title: detail.title,
        description: detail.description ?? "",
      };

      setToasts((current) => [...current, record].slice(-3));

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, detail.durationMs ?? 3200);
    }

    window.addEventListener(TOAST_EVENT, addToast);
    return () => window.removeEventListener(TOAST_EVENT, addToast);
  }, []);

  if (!toasts.length) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] grid w-[calc(100vw-2rem)] max-w-sm gap-2 sm:bottom-5 sm:right-5"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === "error" ? "alert" : "status"}
          className={`vos-toast px-4 py-3 text-sm ${toast.type === "success" ? "vos-toast-success" : toast.type === "error" ? "vos-toast-error" : "vos-toast-info"}`}
        >
          <p className="font-black">{toast.title}</p>
          {toast.description ? <p className="mt-1 leading-5 opacity-80">{toast.description}</p> : null}
        </div>
      ))}
    </div>
  );
}
