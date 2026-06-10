import * as React from "react";

export type BadgeVariant = "default" | "blocked" | "risky" | "ready" | "muted" | "outline";

const variants: Record<BadgeVariant, string> = {
  default: "vos-badge-default",
  blocked: "vos-badge-blocked",
  risky: "vos-badge-risky",
  ready: "vos-badge-ready",
  muted: "vos-badge-muted",
  outline: "vos-badge-outline",
};

export function Badge({
  className = "",
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={[
        "vos-badge",
        variants[variant],
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
