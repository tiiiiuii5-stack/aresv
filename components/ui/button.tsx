import * as React from "react";

type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  "vos-button focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  default: "vos-button-default",
  destructive: "vos-button-destructive",
  outline: "vos-button-outline",
  secondary: "vos-button-secondary",
  ghost: "vos-button-ghost",
};

const sizes: Record<ButtonSize, string> = {
  default: "vos-button-default-size",
  sm: "vos-button-sm",
  lg: "vos-button-lg",
  icon: "vos-button-icon",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => (
    <button ref={ref} className={buttonClassName({ variant, size, className })} {...props} />
  ),
);
Button.displayName = "Button";

export function buttonClassName({
  variant = "default",
  size = "default",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return [base, variants[variant], sizes[size], className].filter(Boolean).join(" ");
}
