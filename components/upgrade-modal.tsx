"use client";

import Link from "next/link";

export function UpgradeModal({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
      <div className="w-full max-w-md vos-panel p-6">
        <p className="vos-label text-[rgb(var(--vos-risk))]">Build limit reached</p>
        <h2 className="mt-3 vos-h2">Upgrade to keep building.</h2>
        <p className="mt-3 vos-body">{message}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/pricing" className="action primary">
            View plans
          </Link>
          <button type="button" onClick={onClose} className="action">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
