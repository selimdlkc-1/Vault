---
paths:
  - "apps/api/src/auth/**/*.ts"
---

# Auth ve Session

Auth/session, güvenlik hedef seviyesinin L2'ye çıktığı üç alandan biridir (private key, transfer akışı ile birlikte). Access token bellekte tutulur mantığıyla uyumlu şekilde backend tarafı tasarlanır.

## Token ve rotation

Access token JWT, 15dk TTL. Refresh token `httpOnly`/`secure`/`SameSite=Strict` cookie, 7 gün, her kullanımda rotate edilir. Kullanılmış bir refresh token tekrar kullanılırsa (replay), kullanıcının **tüm** oturumları geçersiz kılınır — tek bir token değil.

✓ Doğru: `POST /auth/refresh` her çağrıda eski token'ı invalidate edip yenisini basar.
✗ Yanlış: refresh token'ı rotate etmeden yeniden kullanılabilir bırakmak.

## Guard zinciri

`JwtAuthGuard` her korumalı endpoint'te zorunlu; rol kontrolü `RolesGuard` + `@Roles()` dekoratörüyle yapılır. Cüzdan/transfer gibi kaynak-bazlı endpoint'lerde guard'a ek olarak service katmanında **resource ownership** kontrolü yapılır (kullanıcı yalnızca kendi verisine erişir).

## Rate limiting

Login endpoint'i `IP + email` bileşik anahtarıyla brute-force korumalıdır (15 dakikada 5 deneme). Diğer state değiştiren auth endpoint'leri de bir rate limit eşiğine sahiptir (bkz. `03-security-baseline.md`).

## Anti-pattern'ler

- Access token'ı response body dışında bir yere (log, cookie) yazmak
- Replay tespitinde yalnızca ilgili token'ı geçersiz kılıp diğer oturumları etkilememek

---
Detay: `docs/07_SECURITY_IMPLEMENTATION.md` §2–3, §8
