import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api-client";
import { messages } from "./messages";

/**
 * Backend hata yanıtını (docs/03_API_CONTRACTS.md §2–3) forma dağıtır
 * (docs/05_FRONTEND_SPEC.md §5):
 * - `VALIDATION_FAILED` + `details` → ilgili alanlara `setError`.
 * - `EMAIL_ALREADY_EXISTS` → e-posta alanına.
 * - alan eşlemesi mümkün değilse → genel banner (`setBanner`).
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setFieldError: UseFormSetError<T>,
  setBanner: (message: string) => void,
  mappableFields: Path<T>[],
): void {
  if (!(error instanceof ApiError)) {
    setBanner(messages.common.genericError);
    return;
  }

  const allow = mappableFields as string[];

  if (error.code === "VALIDATION_FAILED" && error.details?.length) {
    let mapped = false;
    for (const detail of error.details) {
      if (allow.includes(detail.field)) {
        setFieldError(detail.field as Path<T>, { message: detail.reason });
        mapped = true;
      }
    }
    if (mapped) return;
  }

  if (error.code === "EMAIL_ALREADY_EXISTS" && allow.includes("email")) {
    setFieldError("email" as Path<T>, {
      message: messages.errorByCode.EMAIL_ALREADY_EXISTS,
    });
    return;
  }

  setBanner(messages.errorByCode[error.code] ?? error.message);
}
