export function Separator({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={["vos-separator", className].filter(Boolean).join(" ")} />;
}
