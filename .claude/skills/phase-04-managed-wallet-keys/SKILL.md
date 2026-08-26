---
name: phase-04-managed-wallet-keys
description: '[Faz 4] Managed Cüzdan ve Key Storage — 6 iterasyon/chat (envelope encryption servisi → HD wallet türetme + managed cüzdan endpoint → frontend managed cüzdan ekleme → mock kontrat deploy altyapısı → admin mint endpoint''leri → frontend admin mint). Use when the user says "Faz 4", "Faz 4 — İterasyon N", veya managed cüzdan, private key şifreleme, envelope encryption, HD wallet türetme, mock kontrat deploy, admin mint'ten bahseder. Do NOT use for watch-only cüzdan/portföy (Faz 3), transfer state machine/signing worker (Faz 5), bildirim/audit okuma/admin kullanıcı transfer geçmişi (Faz 6).'
---

# Faz 4: Managed Cüzdan ve Key Storage

## Goal

Bir kullanıcı `POST /wallets/managed` ile seçtiği bir ağda yeni bir managed cüzdan oluşturabiliyor — private key hiçbir API yanıtında, log satırında veya cache'te düz metin olarak görünmüyor (`docs/10_IMPLEMENTATION_ROADMAP.md` Faz 4 İnsan onay noktası). Admin, `POST /admin/mint` ile seçtiği bir kullanıcının cüzdanına mock test bakiyesi dağıtabiliyor. Bu, watch-only'nin (Faz 3) üzerine private key şifreleme katmanını ekleyen, projenin **en hassas güvenlik kontrol noktası** olan fazdır — `TransferStateMachine`'den (Faz 5) önce private key altyapısının sağlam olduğu kanıtlanmalıdır.

## Feature branch (zorunlu)

Her iterasyon kendi branch'ini `git-phase-branch` skill'i ile açar. İterasyon 1 öncesi: Faz 3'ün tüm alt maddelerinin (`docs/10` §3.1–§3.6) tamamlanmış ve onaylanmış olduğu doğrulanır — bu fazın tüm iterasyonları `wallets` tablosuna (Faz 3 §3.1'de oluşturuldu) ve `AuditService`/`$transaction` kalıbına bağımlıdır. `wallets` tablosu bu fazda iki kez migration alır: İterasyon 2 (`encrypted_private_key` kolonu — Faz 3'te yalnızca `encrypted_dek` vardı, envelope encryption'ın ikinci katmanı için eksikti, bkz. `docs/mimari-kararlar.md` SEC-006 ve Versiyon Geçmişi 0.5) ve İterasyon 5 (`mint_operations` tablosu).

## Bu fazın çalışma modeli

- Tek sohbet fazı bitirmez; her chat başında **「Faz 4 — İterasyon M」** belirt.
- Agent yalnızca o iterasyonun **Docs okuma sırasını** okur, tüm spec'i değil.
- `docs/10` §4.4, kapsamının genişliği (yeni bir `packages/contracts` workspace'i + backend + frontend — üç farklı katman) nedeniyle üç iterasyona bölünmüştür (§4.4a/b/c) — bu bölünme `docs/10`'da da not düşülmüştür, roadmap alt madde numaraları değişmedi.
- **S-ADMIN-MINT'in kullanıcı/cüzdan seçim akışı yeni bir endpoint gerektirmez** — Faz 3 §3.4a'da zaten Admin-farkında (`?userId=`) teslim edilen `GET /wallets` (`docs/03_API_CONTRACTS.md` §5.2) doğrudan kullanılır. Faz 6 §6.4'ten hiçbir şey öne çekilmez; o fazın `GET /admin/users/:userId/wallets` path-param alias'ı, S-ADMIN-USER-DETAIL için ayrıca eklenir ama aynı alttaki servis mantığını kullanır.
- İterasyon 1'de yazılan `EnvelopeEncryptionService`, `wallets` modülü içinde yaşar (`apps/api/src/wallets/envelope-encryption.service.ts`) — ayrı bir `crypto`/`security` modülü açılmaz, Faz 5'in `signing` worker'ı bu servisi `WalletsModule`'den `exports` yoluyla alır.
- İterasyon 4'te eklenen `packages/contracts`, `apps/api`'nin **runtime bağımlılığı değildir** — yalnızca bir deploy aracıdır; `docs/mimari-kararlar.md` TS-008, `docs/adr/0001-mock-contract-tooling.md`.
- Bu fazda **hiçbir worker eklenmez** — `signing`/`broadcast`/`confirmation` kuyrukları Faz 5'e aittir; `EnvelopeEncryptionService` bu fazda yalnızca senkron olarak `POST /wallets/managed` içinde çağrılır.
- `EnvelopeEncryptionService`, %80 coverage hedefine tabi kritik modüllerden biridir (`docs/08_TESTING_STRATEGY.md` §2-3; eşik CI gate'i olarak Faz 7'de zorunlu hale gelir, ama İterasyon 1 kendi PR'ında bu hedefi zaten karşılamalıdır).

## İterasyon indeksi

| # | Teslim | §N.M | Dosya |
| - | ------ | ---- | ----- |
| 1 | Envelope encryption servisi | §4.1 | `iterations/01-envelope-encryption-service.md` |
| 2 | HD wallet türetme + `POST /wallets/managed` | §4.2 | `iterations/02-hd-wallet-derivation-managed-endpoint.md` |
| 3 | Frontend: S-WALLET-ADD-MANAGED | §4.3 | `iterations/03-frontend-add-managed-wallet.md` |
| 4 | Mock kontrat + deploy altyapısı (`packages/contracts`) | §4.4a | `iterations/04-mock-contract-deploy-infra.md` |
| 5 | `mint_operations` + `POST /admin/mint` + `GET /admin/users` (kullanıcı arama) | §4.4b | `iterations/05-admin-mint-endpoints.md` |
| 6 | Frontend: S-ADMIN-MINT | §4.4c | `iterations/06-frontend-admin-mint.md` |

> Yalnızca çalıştığın iterasyonun dosyasını oku.

## Required Context

- `docs/10_IMPLEMENTATION_ROADMAP.md` §4 Faz 4 — tüm alt madde tanımları (§4.4'ün a/b/c bölünme notuyla birlikte) ve Faz 4 İnsan onay noktası
- `docs/01_DOMAIN_MODEL.md` §2.4 Wallet, §2.10 MintOperation, §4 iş kuralları (1, 2, 4, 5, 6, 12), §5.1 Cüzdan ekleme akışı
- `docs/07_SECURITY_IMPLEMENTATION.md` §5 Veri Sınıflandırma ve Şifreleme (envelope encryption tasarımı, decrypt akışının sınırları), §9 Secrets Yönetimi (`MASTER_ENCRYPTION_KEY`, `HD_WALLET_MNEMONIC`)
- `docs/mimari-kararlar.md` SEC-006 (key storage), W-001 (cüzdan ekleme akışı), AP-002 (mock token), I-008 (mock token stratejisi), TS-008 (Hardhat tooling), CODE-004 (agent kısıtları — private key log/response yasağı)
- `.claude/rules/00-*.md` … `04-*.md` — zaten yüklü, tekrar edilmez; özellikle `03-security-baseline.md` madde 1 (private key sızıntısı) bu fazın her iterasyonunda geçerlidir
- `.claude/skills/phase-03-watchonly-portfolio/SKILL.md` — komşu faz formatı referansı; `wallets` tablosunun ve `AuditService`/`$transaction` kalıbının kaynağı

## Done Definition

- [ ] Bir kullanıcı gerçek tarayıcıda `/wallets/add?type=managed` üzerinden bir ağ seçip managed cüzdan oluşturabiliyor; `audit_logs`'a `WALLET_CREATED` (`metadata: { type: 'managed' }`) düşüyor
- [ ] Yanıtta, loglarda ve DB'de hiçbir yerde çözülmüş private key görünmüyor — bu hem otomatik testle (İterasyon 2) hem manuel bir kod incelemesiyle (Faz 4 İnsan onay noktası) doğrulanıyor
- [ ] `EnvelopeEncryptionService` ≥%80 unit coverage ile teslim edildi (`docs/08_TESTING_STRATEGY.md` §2)
- [ ] Üç ağda (Sepolia, BSC Testnet, Tron Shasta) mock kontratlar deploy edildi, adresleri `assets.contract_address`'te
- [ ] Admin, `/admin/mint` üzerinden bir kullanıcı seçip cüzdanına mint edebiliyor; `audit_logs`'a `MINT_EXECUTED` düşüyor
- [ ] CI'ın 4 adımı (lint→typecheck→test→build) yeşil

## Explicit Don'ts

- `TransferStateMachine`, `transfers`, `transfer_state_events`, `signing`/`broadcast`/`confirmation` worker'ları, S-TRANSFER-* ekranları — Faz 5.
- `GET /admin/users/:userId/wallets`, `GET /admin/users/:userId/transfers` (path-param alias'ları), S-ADMIN-USER-DETAIL ekranı — Faz 6 §6.4. Bu fazın S-ADMIN-MINT'i (İterasyon 6) `GET /wallets?userId=`'i kullanır, yeni bir endpoint oluşturmaz.
- `GET /admin/audit-logs`, S-ADMIN-AUDIT-LOG — Faz 6 §6.3.
- Bildirim tetikleme (`notifications` tablosu) — Faz 6 §6.1; bu fazın hiçbir işlemi (managed cüzdan oluşturma, mint) bildirim üretmez.
- Master-key otomatik rotasyonu — MVP dışı (`docs/mimari-kararlar.md` SEC-OPEN-6); rotasyon manuel bir prosedürdür, bu fazda bir rotasyon endpoint'i/script'i yazılmaz.
- Coverage gate'inin CI'a eklenmesi — Faz 7 §7.1 (İterasyon 1 kendi PR'ında %80'i karşılar ama CI'da otomatik reddeden bir gate henüz yok).

---
Faz bitti → `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 4 işaretlenir; kullanıcı onayı (özellikle private key sızıntısı doğrulaması) → Faz 5.
