import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Alan altı TR hata mesajı (varsa). */
  error?: string;
  hint?: ReactNode;
}

/**
 * Etiketli form alanı (docs/05_FRONTEND_SPEC.md §5, §8). Her alan bir `<label>`
 * ile `htmlFor`/`id` üzerinden ilişkilendirilir; hata mesajı `aria-describedby`
 * ile bağlanır ve `aria-invalid` işaretlenir.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, hint, id, className = "", ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-zinc-900">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`h-10 rounded-md border border-border px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary aria-[invalid=true]:border-danger ${className}`}
          {...props}
        />
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

Field.displayName = "Field";
