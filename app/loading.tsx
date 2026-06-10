function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse vos-cell ${className}`} />;
}

export default function Loading() {
  return (
    <main className="vos-page min-h-screen p-6 pt-20">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[240px_1fr]">
        <Skeleton className="hidden h-[720px] lg:block" />
        <div className="space-y-5">
          <Skeleton className="h-24" />
          <div className="grid gap-5 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    </main>
  );
}
