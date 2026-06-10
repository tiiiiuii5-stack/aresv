"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="vos-page flex min-h-screen items-center justify-center p-6">
      <section className="vos-panel w-full max-w-lg p-6">
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg border border-[rgb(var(--vos-danger))] bg-[rgb(var(--vos-danger-bg))] text-sm font-black text-[rgb(var(--vos-danger))]">
          !
        </div>
        <h1 className="vos-h1">Something needs attention</h1>
        <p className="mt-3 vos-body">
          The test builder hit an unexpected error. The app kept the failure contained so you can retry without losing context.
        </p>
        <p className="vos-cell mt-4 p-3 text-xs font-semibold text-[rgb(var(--vos-text-muted))]">{error.message}</p>
        <button
          className="vos-button vos-button-default vos-button-default-size mt-6"
          onClick={reset}
        >
          Retry
        </button>
      </section>
    </main>
  );
}
