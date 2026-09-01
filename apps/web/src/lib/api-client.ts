import { messages } from "./messages";

/**
 * Merkezi fetch wrapper (docs/05_FRONTEND_SPEC.md §4, `.claude/rules/20`). Bileşenler
 * doğrudan `fetch` çağırmaz; her istek buradan geçer.
 *
 * Sorumlulukları:
 * - `Authorization: Bearer <accessToken>` başlığı (bellekteki token, `AuthContext`).
 * - `credentials: "include"` — refresh cookie'si için (aynı origin proxy, next.config.mjs).
 * - `X-Requested-With: XMLHttpRequest` — CSRF karşı önlemi (`docs/03` §4, SEC-010).
 * - Response envelope çözümü (`{ data }` → değer, `{ error }` → `ApiError`).
 * - `401 AUTH_TOKEN_EXPIRED` → tek seferlik otomatik `POST /auth/refresh` → orijinal
 *   isteği yeni token'la tekrar dener (`mimari-kararlar.md` SEC-007). Refresh de
 *   başarısızsa oturum sonlandırılır (S-SESSION-EXPIRED).
 */

const BASE = "/api/v1";

export interface ApiErrorDetail {
  field: string;
  reason: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: ApiErrorDetail[] | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** `AuthContext` bu köprüyü kaydeder; api-client token'a imperatif erişir. */
export interface AuthBridge {
  getAccessToken: () => string | null;
  onTokenRefreshed: (accessToken: string) => void;
  onSessionExpired: () => void;
}

let bridge: AuthBridge | null = null;

export function registerAuthBridge(next: AuthBridge): void {
  bridge = next;
}

interface RawErrorBody {
  code?: string;
  message?: string;
  details?: ApiErrorDetail[] | null;
}

function toApiError(status: number, body: unknown): ApiError {
  const error = (body as { error?: RawErrorBody } | null)?.error ?? {};
  return new ApiError(
    error.code ?? "INTERNAL_ERROR",
    error.message ?? messages.common.genericError,
    status,
    error.details ?? null,
  );
}

// Eşzamanlı 401'lerde tek bir refresh çağrısı yapılır, hepsi onu bekler.
let refreshInFlight: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  const body = (await res.json().catch(() => null)) as
    | { data?: { accessToken?: string } }
    | null;

  if (!res.ok || !body?.data?.accessToken) {
    throw toApiError(res.status, body);
  }
  return body.data.accessToken;
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Offset sayfalama meta bloğu (`docs/03_API_CONTRACTS.md` §1). */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Sayfalı liste yanıtı — `pagination` bloğu envelope'ta `data`'nın yanında üst
 * düzeyde döner (`docs/03_API_CONTRACTS.md` §1–2). `apiClient.get` yalnızca `data`
 * alanını döndürdüğü için sayfalı uçlar `apiClient.getPaginated` üzerinden geçer.
 */
export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** İstek-özel ek başlıklar (ör. `POST /transfers` için `Idempotency-Key`). */
  headers?: Record<string, string>;
  /** `Authorization` başlığı eklensin mi? (public auth uçları için `false`) */
  withAuth?: boolean;
  /** Dahili: 401 sonrası tek tekrar denemeyi sınırlamak için. */
  _isRetry?: boolean;
  /** Dahili: `data` yerine tüm envelope'u (`{ data, pagination }`) döndür. */
  _fullEnvelope?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    body,
    headers: extraHeaders,
    withAuth = true,
    _isRetry = false,
    _fullEnvelope = false,
  } = options;

  const headers: Record<string, string> = {
    ...extraHeaders,
    "X-Requested-With": "XMLHttpRequest",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = withAuth ? bridge?.getAccessToken() ?? null : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const parsed = (await res.json().catch(() => null)) as
    | { data?: T; error?: RawErrorBody }
    | null;

  if (res.ok) {
    return (_fullEnvelope ? parsed : parsed?.data) as T;
  }

  const code = parsed?.error?.code ?? "INTERNAL_ERROR";

  if (code === "AUTH_TOKEN_EXPIRED" && withAuth && !_isRetry) {
    try {
      const fresh = await refreshAccessToken();
      bridge?.onTokenRefreshed(fresh);
    } catch {
      bridge?.onSessionExpired();
      throw new ApiError(
        "AUTH_TOKEN_EXPIRED",
        messages.session.expiredBody,
        401,
        null,
      );
    }
    return request<T>(path, { ...options, _isRetry: true });
  }

  if (
    withAuth &&
    (code === "AUTH_TOKEN_INVALID" || code === "AUTH_REFRESH_REUSE_DETECTED")
  ) {
    bridge?.onSessionExpired();
  }

  throw toApiError(res.status, parsed);
}

export const apiClient = {
  request,
  get: <T>(path: string) => request<T>(path),
  /** Sayfalı liste uçları için — `{ data, pagination }` döner (`§5.5` movements). */
  getPaginated: <T>(path: string) =>
    request<Paginated<T>>(path, { _fullEnvelope: true }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: "POST", body, headers }),
};

/* ------------------------------------------------------------------ */
/* Auth-özel tipli çağrılar (docs/03_API_CONTRACTS.md §5.1)            */
/* ------------------------------------------------------------------ */

export interface AuthUser {
  id: string;
  email: string;
  role: "user" | "admin";
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export const authApi = {
  register: (input: { email: string; password: string }) =>
    request<{ id: string; email: string; role: string; createdAt: string }>(
      "/auth/register",
      { method: "POST", body: input, withAuth: false },
    ),

  login: (input: { email: string; password: string }) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: input,
      withAuth: false,
    }),

  /** Sayfa yenileme sonrası bellekteki token'ı yeniden almak için. */
  refresh: () => refreshAccessToken(),

  logout: () => request<void>("/auth/logout", { method: "POST" }),
};
