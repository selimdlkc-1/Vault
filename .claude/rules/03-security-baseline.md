# Güvenlik Taban Kontrolleri

Bu altı madde her kod değişikliğinde geçerliliği kontrol edilmesi gereken çekirdek kuraldır (OWASP ASVS L1 taban, private key/auth/transfer akışlarında L2):

- [ ] **Private key hiçbir zaman düz metin persist edilmez veya loglanmaz.** Decrypt yalnızca imzalama worker'ının bellek-içi akışında olur; `MASTER_ENCRYPTION_KEY`, `encrypted_dek`, çözülmüş key değeri hiçbir log satırına, API yanıtına veya cache'e yazılmaz.
- [ ] **Access token yalnızca bellekte tutulur**, `localStorage`'a asla yazılmaz. Refresh token yalnızca `httpOnly`/`secure`/`SameSite=Strict` cookie'de taşınır ve her kullanımda rotate edilir. `secure` bayrağının varsayılanı `true`'dur; yalnızca `COOKIE_SECURE=false` ile yerel geliştiricinin kendi `.env`'inde açıkça kapatılabilir (sistemin tek ortamı düz HTTP olduğu için — `docs/mimari-kararlar.md` SEC-007).
- [ ] **Transfer başlatma (`draft → pending_signature`) step-up authentication (şifre tekrarı) olmadan gerçekleşemez.**
- [ ] **Cross-network guard ve network/asset aktivasyon kontrolü yalnızca backend'de zorlanır**; frontend kontrolü tek başına yeterli sayılmaz.
- [ ] **Her state değiştiren endpoint bir rate limit eşiğine sahiptir**; login özelinde `IP + email` bileşik anahtarıyla brute-force koruması zorunludur.
- [ ] **Mainnet'e bağlanan hiçbir kod yolu yoktur.** `IChainProvider` başlatılırken chain ID allowlist kontrolü zorunludur; bu allowlist genişletilmez.

✓ Doğru: yeni bir transfer-ilişkili endpoint eklerken cross-network guard'ı backend'de tekrar çağırmak.
✗ Yanlış: "frontend zaten kontrol ediyor" gerekçesiyle backend kontrolünü atlamak.

Bu liste yalnızca burada tutulur; diğer kural/skill dosyaları bu maddeleri tekrar etmez, "güvenlik taban kontrollerine uy" der.

---
Detay: `docs/07_SECURITY_IMPLEMENTATION.md` §13 (tam checklist özeti, threat model detayı ayrı)
