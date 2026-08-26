### İterasyon 1 — Envelope Encryption Servisi (§4.1)

**Hedef:** `EnvelopeEncryptionService`, bir private key'i iki katmanlı envelope encryption ile (özel DEK + master key) AES-256-GCM kullanarak şifreleyip çözebiliyor; ≥%80 unit coverage ile teslim ediliyor.

**Teslim çıktısı:**
- `apps/api/src/wallets/envelope-encryption.service.ts` (+ `.spec.ts`)

**Önkoşullar:**
- [ ] Faz 3 tüm alt maddeleri tamam (`wallets` tablosu, `wallets.module.ts` mevcut)
- [ ] `MASTER_ENCRYPTION_KEY` zaten Faz 0 §0.2'nin env şemasında tanımlı (`config/env.schema.ts`) — bu iterasyon yalnızca tüketir, şemaya eklemez

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §4.1 — kapsam
2. `docs/07_SECURITY_IMPLEMENTATION.md` §5 — envelope encryption tasarımı, decrypt akışının sınırları (yalnızca bellek-içi, hiçbir yere persist edilmez)
3. `docs/02_DATABASE_SCHEMA.md` §2.5, §6 — `encrypted_dek` + `encrypted_private_key` kolonları, her ikisinin de base64(IV+authTag+ciphertext) formatı
4. `docs/08_TESTING_STRATEGY.md` §2–3 — coverage hedefi (≥%80), kritik modül tanımı
5. `docs/mimari-kararlar.md` SEC-006 — iki katmanlı tasarımın karar metni

**Uygulama planı:**
1. `git-phase-branch` ile `feat/envelope-encryption-service` branch'i aç.
2. `envelope-encryption.service.ts` içinde iki özel yardımcı: `aesGcmEncrypt(plaintext: Buffer, key: Buffer): string` (node `crypto.createCipheriv('aes-256-gcm', key, randomBytes(12))`; dönüş `base64(iv || authTag || ciphertext)`) ve `aesGcmDecrypt(payload: string, key: Buffer): Buffer` (payload'ı üç parçaya ayırıp `createDecipheriv` ile çözer; `authTag` doğrulaması başarısız olursa node `crypto` otomatik hata fırlatır — bu davranışa müdahale edilmez, olduğu gibi yukarı fırlatılır).
3. `getMasterKey(): Buffer` — `ConfigService.get('MASTER_ENCRYPTION_KEY')`'i base64 decode eder; sonuç tam 32 byte değilse (AES-256 anahtar uzunluğu) uygulama başlangıcında zaten fail-fast olması gerekir (env şeması), burada yalnızca decode edilir, ayrıca bir uzunluk kontrolü tekrarlanmaz.
4. Public API: `encryptPrivateKey(privateKeyHex: string): { encryptedPrivateKey: string; encryptedDek: string }` — `crypto.randomBytes(32)` ile yeni bir DEK üretir, private key'i bu DEK ile (`aesGcmEncrypt`) şifreler, DEK'i master key ile (`aesGcmEncrypt`) ayrıca şifreler; DEK değişkeni fonksiyon dışına hiçbir şekilde taşınmaz.
5. Public API: `decryptPrivateKey(encryptedPrivateKey: string, encryptedDek: string): string` — önce DEK'i master key ile çözer, sonra private key'i bu DEK ile çözer, `string` olarak döner; bu metodun dönüş değerini çağıran kod (İterasyon 2, Faz 5 signing worker) hiçbir `logger.*` çağrısına argüman geçirmez — bu kısıt kod incelemesinde ayrıca kontrol edilir (`docs/04_BACKEND_SPEC.md` §9).
6. `wallets.module.ts`'e `EnvelopeEncryptionService`'i `providers` + `exports` olarak ekle (Faz 5'in `signing` worker'ı `WalletsModule`'ü import edip bu servisi kullanacak).
7. Unit testler (madde 5'te detaylandırılmış): round-trip, tamper detection, non-determinism.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `apps/api/src/wallets/envelope-encryption.service.ts`, `envelope-encryption.service.spec.ts` |
| Güncelle | `apps/api/src/wallets/wallets.module.ts` |
| Dokunma | `wallets.service.ts` (İterasyon 2'de bu servisi tüketecek), `config/env.schema.ts` (zaten var, değişmez) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Private key kendine özel DEK ile AES-256-GCM şifrelenir | `docs/07` §5, SEC-006 | `encryptPrivateKey()` → `encryptedPrivateKey` |
| DEK, master key ile ayrıca şifrelenir | `docs/07` §5, SEC-006 | `encryptPrivateKey()` → `encryptedDek` |
| Decrypt yalnızca bellek-içi akışta, persist edilmez | `docs/07` §5 sınırları | `decryptPrivateKey()` dönüşü servis içinde hiçbir yere yazılmaz, yalnızca döndürülür |
| ≥%80 coverage | `docs/08` §2 | Round-trip + tamper + non-determinism testleri |

**Kalite kapıları:**
- [ ] Unit: `encryptPrivateKey` → `decryptPrivateKey` round-trip orijinal değeri birebir verir
- [ ] Unit: `encryptedPrivateKey` veya `encryptedDek` içindeki tek bir byte değiştirildiğinde `decryptPrivateKey` hata fırlatır (GCM auth tag doğrulaması)
- [ ] Unit: aynı private key iki kez `encryptPrivateKey`'e verildiğinde farklı `encryptedPrivateKey`/`encryptedDek` üretir (random IV + random DEK)
- [ ] Coverage raporu `envelope-encryption.service.ts` için ≥%80
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** HD wallet türetme, `POST /wallets/managed` endpoint'i, `wallets` tablosuna yazım (İterasyon 2); Faz 5'in signing worker entegrasyonu.

**Risk / dikkat:** AES-GCM'de IV'nin **asla** yeniden kullanılmaması kritik bir güvenlik kuralıdır — `crypto.randomBytes(12)` her `aesGcmEncrypt` çağrısında yeniden üretilmeli, sabit/deterministik bir IV kullanma hatası tüm şemayı kırar. `MASTER_ENCRYPTION_KEY` gerçek değeri geliştirici tarafından üretilmelidir (ör. `openssl rand -base64 32`); `.env.example`'da yalnızca placeholder bulunur, gerçek değer commit edilmez.

**Stop:**
- [ ] `pnpm --filter api test -- envelope-encryption`
- [ ] Coverage raporu ≥%80 doğrulanır
- [ ] PR/onay → İterasyon 2
