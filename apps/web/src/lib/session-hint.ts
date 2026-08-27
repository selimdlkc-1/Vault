/**
 * `vault_session` — yalnızca varlığı anlam taşıyan, içeriği `"1"` olan bir
 * yönlendirme ipucu cookie'si. Token DEĞİLDİR: ne access token (bellekte tutulur)
 * ne de refresh token'dır (o `httpOnly`, `Path=/api/v1/auth` ile sınırlı ve
 * middleware'den okunamaz — `docs/03_API_CONTRACTS.md` §4).
 *
 * `middleware.ts` korumalı route yönlendirmesini (yalnızca UX — `docs/05` §2,
 * `mimari-kararlar.md` SEC-007 "asıl yetki kontrolü her zaman backend'de") bu
 * ipucuna göre yapar. Asıl oturum doğrulaması `(authenticated)/layout.tsx`'in
 * sessiz refresh denemesidir.
 */
const NAME = "vault_session";
// Refresh token TTL'i (7 gün) ile hizalı — kullanıcı sekmeyi kapatıp açtığında
// sessiz refresh ile oturumda kalabildiği sürece ipucu da yaşamalı.
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function setSessionHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${NAME}=1; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearSessionHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${NAME}=; path=/; max-age=0; samesite=lax`;
}

export const SESSION_HINT_COOKIE = NAME;
