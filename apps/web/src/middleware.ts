import { NextResponse, type NextRequest } from "next/server";

/**
 * Korumalı route yönlendirmesi (docs/05_FRONTEND_SPEC.md §2). YALNIZCA UX'tir —
 * asıl yetki kontrolü her istekte backend'de tekrar yapılır (`mimari-kararlar.md`
 * SEC-007). httpOnly refresh cookie'si `Path=/api/v1/auth` ile sınırlı ve
 * middleware'den okunamadığından (`docs/03` §4), burada token içermeyen bir
 * oturum-ipucu cookie'sine (`vault_session`) bakılır (bkz. `lib/session-hint.ts`).
 */
const SESSION_HINT_COOKIE = "vault_session";
const AUTH_PAGES = new Set(["/login", "/register"]);

export function middleware(request: NextRequest) {
  const hasHint = request.cookies.has(SESSION_HINT_COOKIE);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard") && !hasHint) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (AUTH_PAGES.has(pathname) && hasHint) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
