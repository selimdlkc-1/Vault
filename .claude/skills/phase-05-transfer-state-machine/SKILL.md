---
name: phase-05-transfer-state-machine
description: '[Faz 5] Transfer State Machine Uçtan Uca — 8 iterasyon/chat (transfer şeması + draft oluşturma → cross-network guard + step-up auth → signing worker → broadcast worker → confirmation worker → frontend transfer başlatma → frontend onay + izleme → terminal durum/idempotency negatif testleri). Use when the user says "Faz 5", "Faz 5 — İterasyon N", veya transfer state machine, cross-network guard, step-up auth, signing/broadcast/confirmation worker, S-TRANSFER-* ekranlarından bahseder. Do NOT use for managed cüzdan/key storage (Faz 4), bildirim/audit log okuma/admin kullanıcı transfer geçmişi (Faz 6).'
---

# Faz 5: Transfer State Machine Uçtan Uca

## Goal

Bir kullanıcı, managed cüzdanından `POST /transfers` ile bir draft transfer oluşturup `POST /transfers/:id/confirm` ile step-up authentication (şifre tekrarı) yaparak onaylayabiliyor; transfer merkezi `TransferStateMachine` servisi üzerinden `signing → broadcast → confirmation` worker zincirinden geçip gerçek bir testnet üzerinde `confirmed`/`failed`/`dropped` terminal durumlarından birine ulaşıyor, her geçiş `transfer_state_events`'te denetlenebilir durumda. Bu, **projenin en yüksek riskli fazıdır** (`docs/10_IMPLEMENTATION_ROADMAP.md` Faz 5 İnsan onay noktası) — Faz 4'ün (Managed Cüzdan ve Key Storage) private key altyapısı üzerine kurulur, cross-network guard ve terminal state disiplini hiçbir kod yolunda atlanamaz.

## Feature branch (zorunlu)

Her iterasyon kendi branch'ini `git-phase-branch` skill'i ile açar. İterasyon 1 öncesi: Faz 4'ün tüm alt maddelerinin (`docs/10` §4.1–§4.4c) tamamlanmış ve onaylanmış olduğu doğrulanır — bu fazın tüm iterasyonları `wallets.encrypted_private_key`/`encrypted_dek` (Faz 4 §4.2) ve `EnvelopeEncryptionService`'e (Faz 4 §4.1, `WalletsModule`'den `exports` edilir) bağımlıdır.

## Bu fazın çalışma modeli

- Tek sohbet fazı bitirmez; her chat başında **「Faz 5 — İterasyon M」** belirt.
- Agent yalnızca o iterasyonun **Docs okuma sırasını** okur, tüm spec'i değil.
- `docs/10` §5.6, kapsamının genişliği (3 ekran, farklı alan listesi ve UX state'leri) nedeniyle iki iterasyona bölünmüştür (§5.6a/§5.6b) — bu bölünme `docs/10`'da da not düşülmüştür, roadmap alt madde numaraları değişmedi.
- `Transfer.state` alanına yazan **tek** kod yolu `TransferStateMachine` servisidir; hiçbir controller, repository veya worker bu alana doğrudan `UPDATE` uygulamaz (`docs/04_BACKEND_SPEC.md` §1 kesin kural) — İterasyon 1'de kurulan bu servis, İterasyon 2-5'te her yeni geçiş eklendiğinde genişletilir, asla bypass edilmez.
- Worker'lar (`signing`, `broadcast`, `confirmation`) `apps/api/src/workers/` altında, her biri kendi `BullModule.registerQueue()` alt-modülünde yaşar ve `TransfersModule`'ü import ederek `TransferStateMachine`'e erişir — kendi repository'lerini tutmazlar (`docs/04` §2-3, §8).
- Terminal durum kuralı (`confirmed`/`failed`/`dropped`'tan hiçbir geçiş yapılamaz) ve worker idempotency'si (`(transferId, targetState)` veya `(chain, txHash)` bileşik anahtarı) İterasyon 1'in `TransferStateMachine` guard mantığında kurulur; İterasyon 3-5'teki her worker bu guard'a güvenir, kendi başına ayrı bir terminal-state kontrolü icat etmez.
- `TransferStateMachine` ve `packages/chain-providers`, %80 coverage hedefine tabi kritik modüllerdir (`docs/08_TESTING_STRATEGY.md` §2-3); İterasyon 1 ve İterasyon 8 bu hedefi kendi PR'larında karşılar, ama CI'da otomatik reddeden bir gate henüz yoktur (o, Faz 7 §7.1'dedir).
- Faz 3 İterasyon 7'de S-WALLET-DETAIL'e eklenmiş "Transfer Gönder" butonu bu fazdan önce bir route'a bağlı değildi (placeholder) — İterasyon 6 (§5.6a) bu butonu ilk kez `/transfers/new`'e bağlar.

## İterasyon indeksi

| # | Teslim | §N.M | Dosya |
| - | ------ | ---- | ----- |
| 1 | Transfer şeması + `TransferStateMachine` (yalnızca `draft` girişi) + `POST /transfers` | §5.1 | `iterations/01-transfer-schema-draft-creation.md` |
| 2 | Cross-network guard + step-up auth + `POST /transfers/:id/confirm` | §5.2 | `iterations/02-cross-network-guard-step-up-auth.md` |
| 3 | Signing worker | §5.3 | `iterations/03-signing-worker.md` |
| 4 | Broadcast worker | §5.4 | `iterations/04-broadcast-worker.md` |
| 5 | Confirmation worker | §5.5 | `iterations/05-confirmation-worker.md` |
| 6 | Frontend: S-TRANSFER-NEW | §5.6a | `iterations/06-frontend-transfer-new.md` |
| 7 | Frontend: S-TRANSFER-CONFIRM + S-TRANSFER-DETAIL | §5.6b | `iterations/07-frontend-transfer-confirm-detail.md` |
| 8 | Terminal durum + idempotency negatif regresyon testleri | §5.7 | `iterations/08-terminal-state-idempotency-tests.md` |

> Yalnızca çalıştığın iterasyonun dosyasını oku.

## Required Context

- `docs/10_IMPLEMENTATION_ROADMAP.md` §5 Faz 5 — tüm alt madde tanımları (§5.6'nın a/b bölünme notuyla birlikte) ve Faz 5 İnsan onay noktası
- `docs/01_DOMAIN_MODEL.md` §2.6 Transfer, §2.7 TransferStateEvent, §4 iş kuralları (3, 4, 5, 7, 8), §5.2 Transfer durum makinesi (8 durum, 4 katmanlı: anlamı/backend/data/UI)
- `docs/07_SECURITY_IMPLEMENTATION.md` §4 Yetkilendirme Uygulaması (step-up auth akış diyagramı, cross-network guard ilkesi), §5 decrypt akışının sınırları (signing worker'ın bellek-içi kullanımı)
- `docs/mimari-kararlar.md` W-001..W-007 (transfer state machine kararları), AUTH-004 (cross-network guard), SEC-008 (step-up auth), I-004/I-005/I-006/I-007 (confirmation eşiği, idempotency, retry, reorg)
- `.claude/rules/00-*.md` … `04-*.md` — zaten yüklü, tekrar edilmez; özellikle `03-security-baseline.md` madde 3-4 (step-up + cross-network) bu fazın her iterasyonunda geçerlidir
- `.claude/skills/phase-04-managed-wallet-keys/SKILL.md` — komşu faz formatı referansı; `EnvelopeEncryptionService`'in ve `AuditService`/`$transaction` kalıbının kaynağı

## Done Definition

- [ ] Bir kullanıcı gerçek tarayıcıda `/transfers/new` üzerinden bir managed cüzdandan draft transfer oluşturup step-up ile onaylayabiliyor; transfer gerçek bir testnet üzerinde `confirmed`/`failed`/`dropped`'a ulaşıyor
- [ ] Her state geçişi `transfer_state_events`'e yazılıyor; terminal durumdan hiçbir geçiş kabul edilmiyor (otomatik testle kanıtlı)
- [ ] Cross-network guard ve step-up auth yalnızca backend'de zorlanıyor (otomatik testle kanıtlı)
- [ ] `TransferStateMachine` ve `packages/chain-providers` ≥%80 unit coverage ile teslim edildi (`docs/08_TESTING_STRATEGY.md` §2)
- [ ] §5.7'deki 5 negatif senaryo (cross-network mismatch, terminal state geçiş denemesi, step-up başarısız, yetersiz bakiye, watch-only'den transfer denemesi) regresyon testinde mevcut ve geçiyor
- [ ] CI'ın 4 adımı (lint→typecheck→test→build) yeşil

## Explicit Don'ts

- `notifications` tablosu, bildirim tetikleme (`tx confirmed`/`tx failed`) — Faz 6 §6.1. Bu fazın confirmation worker'ı yalnızca state geçirir, bildirim yazmaz.
- `GET /admin/audit-logs`, S-ADMIN-AUDIT-LOG — Faz 6 §6.3.
- `GET /admin/users/:userId/transfers` path-param alias'ı, S-ADMIN-USER-DETAIL ekranı — Faz 6 §6.4. Admin'in transfer görünürlüğü bu fazda yalnızca `GET /transfers?userId=` ve `GET /transfers/:id` (Admin salt-okunur, sahiplik kontrolünden muaf) ile sınırlıdır — yeni bir path-param endpoint eklenmez.
- Gerçek 2FA (TOTP/SMS) — MVP dışı (`docs/mimari-kararlar.md` SEC-OPEN-1); step-up auth yalnızca şifre tekrarıdır.
- Coverage gate'inin CI'a eklenmesi — Faz 7 §7.1 (İterasyon 1/8 kendi PR'larında %80'i karşılar ama CI'da otomatik reddeden bir gate henüz yok).
- Kalan negatif senaryolar (yetkisiz erişim, rate limit aşımı, geçersiz adres formatı, refresh replay, mainnet allowlist) — bunlar ya önceki fazlarda zaten kapsandı ya da Faz 7 §7.2'nin kapsamındadır; İterasyon 8 yalnızca §5.7'de roadmap'in transfer'e özel olarak listelediği 5 senaryoyu ekler.

---
Faz bitti → `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 5 işaretlenir; kullanıcı onayı (özellikle gerçek testnet üzerinde uçtan uca transfer doğrulaması) → Faz 6.
