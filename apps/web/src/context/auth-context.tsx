"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  authApi,
  registerAuthBridge,
  type AuthUser,
} from "@/lib/api-client";
import { decodeAccessToken } from "@/lib/jwt";
import { clearSessionHint, setSessionHint } from "@/lib/session-hint";

/**
 * `AuthContext` — access token YALNIZCA bellekte (`accessTokenRef`), `localStorage`
 * KULLANILMAZ (`docs/05_FRONTEND_SPEC.md` §3, `.claude/rules/03` madde 2). Sayfa
 * yenilendiğinde token kaybolur ve `bootstrap` sessiz refresh ile yeniden alınır.
 */

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** S-SESSION-EXPIRED tetikleyicisi (refresh başarısız oldu). */
  sessionExpired: boolean;
  /** login/register akışı başarılı yanıtı buraya yazar. */
  applySession: (accessToken: string, user: AuthUser) => void;
  /** Kullanıcı isteğiyle çıkış (S-LOGOUT-CONFIRM) — sessiz. */
  clearSession: () => void;
  /** S-SESSION-EXPIRED modalı kapatıldığında. */
  acknowledgeExpiry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accessTokenRef = useRef<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [sessionExpired, setSessionExpired] = useState(false);

  // Bridge callback'leri en güncel fonksiyonlara ref üzerinden erişir.
  const expireRef = useRef<() => void>(() => {});

  const applySession = useCallback(
    (accessToken: string, nextUser: AuthUser) => {
      accessTokenRef.current = accessToken;
      setUser(nextUser);
      setStatus("authenticated");
      setSessionExpired(false);
      setSessionHint();
    },
    [],
  );

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    setUser(null);
    setStatus("unauthenticated");
    clearSessionHint();
    queryClient.clear();
  }, [queryClient]);

  const expireSession = useCallback(() => {
    const wasActive = accessTokenRef.current !== null || status === "authenticated";
    accessTokenRef.current = null;
    setUser(null);
    setStatus("unauthenticated");
    clearSessionHint();
    queryClient.clear();
    if (wasActive) {
      setSessionExpired(true);
    }
  }, [queryClient, status]);

  expireRef.current = expireSession;

  const acknowledgeExpiry = useCallback(() => setSessionExpired(false), []);

  // api-client köprüsü — ilk render'da, herhangi bir efekt çalışmadan kaydedilir.
  useState(() => {
    registerAuthBridge({
      getAccessToken: () => accessTokenRef.current,
      onTokenRefreshed: (token) => {
        accessTokenRef.current = token;
        setSessionHint();
      },
      onSessionExpired: () => expireRef.current(),
    });
    return null;
  });

  // Bootstrap: sayfa açılışında bir kez sessiz refresh dener.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const accessToken = await authApi.refresh();
        if (cancelled) return;
        const claims = decodeAccessToken(accessToken);
        accessTokenRef.current = accessToken;
        setUser({
          id: claims.sub ?? "",
          email: "",
          role: claims.role ?? "user",
        });
        setStatus("authenticated");
        setSessionHint();
      } catch {
        if (cancelled) return;
        accessTokenRef.current = null;
        setStatus("unauthenticated");
        clearSessionHint();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        sessionExpired,
        applySession,
        clearSession,
        acknowledgeExpiry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext, <AuthProvider> içinde kullanılmalı");
  }
  return ctx;
}
