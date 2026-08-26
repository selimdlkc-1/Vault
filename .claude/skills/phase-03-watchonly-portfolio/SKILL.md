---
name: phase-03-watchonly-portfolio
description: '[Faz 3] Watch-only Cüzdan ve Salt-okunur Portföy — 9 iterasyon/chat (wallets şeması+watch-only oluşturma → balance-sync worker → price-sync worker → cüzdan okuma endpoint''leri → portföy özet/geçmiş endpoint''leri+snapshot worker → frontend dashboard+cüzdan listesi → frontend cüzdan detay+watch-only ekleme → movement-index backend → frontend S-MOVEMENTS). Use when the user says "Faz 3", "Faz 3 — İterasyon N", veya watch-only cüzdan, portföy özeti/geçmişi, balance-sync/price-sync/movement-index worker, dashboard veya cüzdan ekranlarından bahseder. Do NOT use for auth/roller (Faz 1), network/asset master data ve admin temeli (Faz 2), managed cüzdan/key storage/mint (Faz 4), transfer state machine (Faz 5), bildirim/audit okuma/admin kullanıcı detayı (Faz 6).'
---

# Faz 3: Watch-only Cüzdan ve Salt-okunur Portföy

## Goal

Kullanıcı harici bir Sepolia/BSC Testnet/Tron Shasta adresini watch-only cüzdan olarak ekleyebiliyor (`POST /wallets/watch-only`); `balance-sync` ve `price-sync` worker'ları (sistemin ilk BullMQ worker'ları) bu cüzdanın bakiyesini ve USDT karşılığını periyodik güncelliyor; `GET /wallets`, `GET /wallets/:id`, `GET /portfolio/summary`, `GET /portfolio/history` çalışıyor; `/dashboard`, `/wallets`, `/wallets/[id]`, `/movements` ekranları gerçek veriyle render ediliyor; `movement-index` worker'ı (Alchemy webhook + Tron polling) zincir hareketlerini `chain_movements`'e indexliyor ve `GET /movements` bunu listeliyor. `packages/chain-providers`'ın `getBalance()` implementasyonu ve adres format doğrulaması bu fazda ilk kez gerçek kod kazanıyor (`docs/10_IMPLEMENTATION_ROADMAP.md` Faz 3 İnsan onay noktası).

## Feature branch (zorunlu)

Her iterasyon kendi branch'ini `git-phase-branch` skill'i ile açar (bkz. her iterasyonun Uygulama planı adım 1). İterasyon 1 öncesi: Faz 2'nin tüm alt maddelerinin (`docs/10` §2.1–§2.5) tamamlanmış ve onaylanmış olduğu doğrulanır — bu fazın tüm iterasyonları `network_assets` aktivasyonuna, `AuditService`'e ve `IChainProvider`/`CHAIN_ID_ALLOWLIST`'e bağımlıdır.

## Bu fazın çalışma modeli

- Tek sohbet fazı bitirmez; her chat başında **「Faz 3 — İterasyon M」** belirt.
- Agent yalnızca o iterasyonun **Docs okuma sırasını** okur, tüm spec'i değil.
- `docs/10` §3.4 ve §3.5 ve §3.6, kapsamlarının genişliği nedeniyle her biri ikişer iterasyona bölünmüştür (§3.4a/b, §3.5a/b, §3.6a/b) — bu bölünme `docs/10`'da da not düşülmüştür, roadmap alt madde numaraları değişmedi.
- Backend tarafı `apps/api/src/wallets/`, `apps/api/src/portfolio/`, `apps/api/src/movements/` modüllerini açar; `apps/api/src/workers/` altına `balance-sync`, `price-sync`, `portfolio-snapshot`, `movement-index` processor'ları eklenir (`docs/04_BACKEND_SPEC.md` §2, §8).
- `packages/chain-providers`, `TransferStateMachine` kadar olmasa da kritik modül sayılır (`docs/08_TESTING_STRATEGY.md` §3); bu fazda eklenen `getBalance()` ve adres doğrulama kodu ≥%80 coverage hedefini gözetir (eşik CI gate'i olarak Faz 7'de zorunlu hale gelir).
- `GET /movements` bu fazda yalnızca zincir kaynağını (`source: 'chain'`) döner — `transfers` tablosu Faz 5'e kadar yoktur; sistem transferleriyle birleştirme İterasyon 8'de **yapılmaz**.

## İterasyon indeksi

| # | Teslim | §N.M | Dosya |
| - | ------ | ---- | ----- |
| 1 | Wallets şeması + watch-only oluşturma | §3.1 | `iterations/01-wallets-schema-watchonly.md` |
| 2 | Balance-sync worker + `getBalance()` implementasyonu | §3.2 | `iterations/02-balance-sync-worker.md` |
| 3 | Price-sync worker | §3.3 | `iterations/03-price-sync-worker.md` |
| 4 | Cüzdan okuma endpoint'leri | §3.4a | `iterations/04-wallet-read-endpoints.md` |
| 5 | Portföy özet/geçmiş endpoint'leri + portfolio-snapshot worker | §3.4b | `iterations/05-portfolio-endpoints-snapshot-worker.md` |
| 6 | Frontend: Dashboard + Cüzdan Listesi | §3.5a | `iterations/06-frontend-dashboard-wallet-list.md` |
| 7 | Frontend: Cüzdan Detay + Watch-only Ekleme | §3.5b | `iterations/07-frontend-wallet-detail-add-watchonly.md` |
| 8 | Movement-index backend (şema + webhook + Tron polling + `GET /movements`) | §3.6a | `iterations/08-movement-index-backend.md` |
| 9 | Frontend: S-MOVEMENTS | §3.6b | `iterations/09-frontend-movements.md` |

> Yalnızca çalıştığın iterasyonun dosyasını oku.

## Required Context

- `docs/10_IMPLEMENTATION_ROADMAP.md` §3 Faz 3 — tüm alt madde tanımları (§3.4/§3.5/§3.6'nın a/b bölünme notlarıyla birlikte)
- `docs/01_DOMAIN_MODEL.md` §2.4 Wallet, §2.5 BalanceCache, §2.8 ChainMovement, §2.12 PortfolioSnapshot, §4 iş kuralları (1, 2, 5, 9, 10)
- `docs/mimari-kararlar.md` P-011..P-017 (portföy/fiyat kararları), W-006/W-007 (hareket geçmişi), I-001..I-010 (chain provider + entegrasyon), SEC-005 (allowlist)
- `.claude/rules/00-*.md` … `04-*.md` — zaten yüklü, tekrar edilmez
- `.claude/skills/phase-02-master-data-admin/SKILL.md` — komşu faz formatı referansı; `AuditService`/`$transaction` kalıbının kaynağı (İterasyon 1, 5, 8 bu kalıbı tekrar kullanır); İterasyon 5'in `TestnetDisclaimer`'ı bu skill'in İterasyon 4'ünde erken oluşturuldu

## Done Definition

- [ ] Bir kullanıcı gerçek tarayıcıda `/wallets/add?type=watch-only` üzerinden gerçek bir Sepolia testnet adresini ekleyebiliyor; `audit_logs`'a `WALLET_CREATED` (`metadata: { type: 'watch_only' }`) düşüyor
- [ ] `/dashboard`'da toplam USDT değeri ve cüzdan bazlı varlık listesi `balance-sync`/`price-sync` worker'larının yazdığı gerçek veriyle görünüyor
- [ ] `/movements`'te eklenen cüzdanın gerçek zincir hareketleri (Alchemy webhook veya Tron polling ile indexlenmiş) listeleniyor — bu, Faz 3 İnsan onay noktasıdır
- [ ] Zorunlu negatif senaryo #12 (geçersiz adres formatı reddi) ve #2 (pasif `(network, asset)` çiftinde cüzdan eklenemez) testle kanıtlı
- [ ] `packages/chain-providers`'a eklenen `getBalance()` ve adres doğrulama kodu unit testle kapsanmış
- [ ] CI'ın 4 adımı (lint→typecheck→test→build) yeşil

## Explicit Don'ts

- `POST /wallets/managed`, HD wallet türetme, envelope encryption — Faz 4 §4.1/§4.2.
- `mint_operations`, `POST /admin/mint`, S-ADMIN-MINT — Faz 4 §4.4.
- `transfers`, `transfer_state_events`, `TransferStateMachine`, S-TRANSFER-* ekranları — Faz 5. İterasyon 8'in `GET /movements`'i bu yüzden yalnızca `source: 'chain'` döner.
- Bildirim tetikleme (`notifications` tablosu, `INCOMING_TRANSFER_DETECTED` vb.) — Faz 6 §6.1; İterasyon 8'in `movement-index` worker'ı yalnızca `chain_movements`'e yazar, bildirim çağrısı yapmaz.
- `GET /admin/audit-logs`, S-ADMIN-AUDIT-LOG, `GET /admin/users/:userId/wallets|transfers` — Faz 6 §6.3/§6.4.
- S-FORBIDDEN-403 sistem ekranı — Faz 7 §7.4.
- Coverage gate'inin CI'a eklenmesi — Faz 7 §7.1.

---
Faz bitti → `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 3 işaretlenir; kullanıcı onayı → Faz 4.
