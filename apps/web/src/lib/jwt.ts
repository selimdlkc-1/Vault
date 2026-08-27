/**
 * Access token JWT'sinin payload'ını **doğrulamadan** okur — imza kontrolü
 * backend'in işidir (`docs/07_SECURITY_IMPLEMENTATION.md` §3). Buradaki tek amaç,
 * sayfa yenilemesinden sonra sessiz refresh ile alınan token'dan kullanıcının
 * kimliğini (`sub`) ve rolünü göstermek/yönlendirmek — asıl yetki her istekte
 * backend'de tekrar kontrol edilir.
 */
export interface AccessTokenClaims {
  sub?: string;
  role?: "user" | "admin";
}

export function decodeAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    return JSON.parse(json) as AccessTokenClaims;
  } catch {
    return {};
  }
}
