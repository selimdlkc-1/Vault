import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-primary/50",
  secondary:
    "bg-white text-zinc-900 border border-border hover:bg-muted disabled:opacity-50",
  danger:
    "bg-danger text-danger-foreground hover:bg-danger/90 disabled:bg-danger/50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/**
 * Primitive buton (docs/05_FRONTEND_SPEC.md §6). Native `<button>` — klavye ve
 * odak davranışı tarayıcıdan gelir; `div`+`onClick` kullanılmaz.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  ),
);

Button.displayName = "Button";
