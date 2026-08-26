---
name: phase-06-notifications-audit
description: '[Faz 6] Bildirim, Audit ve Admin Görünürlüğü — 7 iterasyon/chat (bildirim şeması + worker tetikleyicileri → bildirim endpoint grubu → S-NOTIFICATIONS → audit log endpoint → S-ADMIN-AUDIT-LOG → admin kullanıcı detay endpoint grubu → S-ADMIN-USER-DETAIL). Use when the user says "Faz 6", "Faz 6 — İterasyon N", veya bildirim/notification, audit log okuma, S-ADMIN-AUDIT-LOG, S-ADMIN-USER-DETAIL, admin kullanıcı detay görünümünden bahseder. Do NOT use for transfer state machine/cross-network guard (Faz 5), audit_logs yazma servisi veya network/asset admin aktivasyonu (Faz 2), coverage/E2E sıkılaştırma (Faz 7).'
---

# Faz 6: Bildirim, Audit ve Admin Görünürlüğü

## Goal

Faz 5'in ürettiği transfer/movement olaylarına bağlı in-app bildirimler (`tx confirmed`, `tx failed`, `incoming transfer detected`) kullanıcıya `GET /notifications` polling'i üzerinden ulaşıyor; Admin, Faz 1-5'te üretilen tüm `audit_logs` izini filtrelenebilir bir ekrandan görüntüleyebiliyor ve herhangi bir kullanıcının cüzdan/transfer verisini (private key'e hiçbir yoldan erişmeden) salt-okunur inceleyebiliyor (`docs/10_IMPLEMENTATION_ROADMAP.md` Faz 6 İnsan onay noktası). Bu faz, Faz 5'in ürettiği worker olaylarına (confirmation, movement-index) bir yan etki (bildirim yazımı) ekler ve Faz 2'den beri var olan `audit_logs`/Faz 3-5'in wallet/transfer okuma servislerini yeni bir yüzeyden (Admin panel ekranları) açığa çıkarır — spec zaten tamdır, bu fazın işi mevcut sözleşmeyi uygulamaya bağlamaktır.

## Feature branch (zorunlu)

Her iterasyon kendi branch'ini `git-phase-branch` skill'i ile açar. İterasyon 1 öncesi: Faz 5'in tüm alt maddelerinin (`docs/10` §5.1–§5.7) tamamlanmış ve onaylanmış olduğu doğrulanır — İterasyon 1 `confirmation` worker'ının `confirmed`/`failed` durumlarına ulaştığına, İterasyon 1 ayrıca Faz 3 §3.6a'nın `movement-index` worker'ına (Alchemy webhook + Tron polling) bağımlıdır.

## Bu fazın çalışma modeli

- Tek sohbet fazı bitirmez; her chat başında **「Faz 6 — İterasyon M」** belirt.
- Agent yalnızca o iterasyonun **Docs okuma sırasını** okur, tüm spec'i değil.
- `docs/10` §6.2, §6.3, §6.4 — her biri backend+frontend iki katmanı kapsadığından a/b iterasyonlarına bölünmüştür (Faz 3 §3.4-3.6, Faz 5 §5.6 ile aynı örüntü); yalnızca §6.1 (şema + worker tetikleyicileri, backend-only) tek iterasyonda kalır.
- Bildirim yazımı (`NotificationsService.notify()`) bir state geçişi **değildir** — `docs/04_BACKEND_SPEC.md` §7'deki `$transaction` bloğuna (state + `transfer_state_events` + `audit_logs`) dahil edilmez; worker'ın kritik state geçişi bildirim yazım hatasına bağımlı kılınmaz (İterasyon 1 Risk notu).
- `GET /admin/users/:userId/{wallets,transfers}` **yeni bir servis mantığı yazmaz** — Faz 3 §3.4a'nın `GET /wallets?userId=` ve Faz 5'in `GET /transfers?userId=` metodlarını path-param'dan çağıran ince bir controller köprüsüdür (`docs/03_API_CONTRACTS.md` §5.8); İterasyon 6 bu disiplini bozmaz.
- `notifications`/`audit_logs` tabloları bu fazda **yeniden tasarlanmaz** — `audit_logs` Faz 2 §2.3'ten beri, `notifications` şeması `docs/02_DATABASE_SCHEMA.md` §2.10'da zaten tam tanımlı; İterasyon 1 yalnızca migration'ı uygular.

## İterasyon indeksi

| # | Teslim | §N.M | Dosya |
| - | ------ | ---- | ----- |
| 1 | Bildirim şeması + confirmation/movement-index worker tetikleyicileri | §6.1 | `iterations/01-notification-schema-triggers.md` |
| 2 | `GET/PATCH /notifications*` endpoint'leri | §6.2a | `iterations/02-notification-endpoints.md` |
| 3 | Frontend: S-NOTIFICATIONS + polling + nav rozeti | §6.2b | `iterations/03-frontend-notifications.md` |
| 4 | `GET /admin/audit-logs` (filtrelenebilir) | §6.3a | `iterations/04-audit-log-endpoint.md` |
| 5 | Frontend: S-ADMIN-AUDIT-LOG | §6.3b | `iterations/05-frontend-admin-audit-log.md` |
| 6 | `GET /admin/users/:userId/{wallets,transfers}` | §6.4a | `iterations/06-admin-user-detail-endpoints.md` |
| 7 | Frontend: S-ADMIN-USER-DETAIL | §6.4b | `iterations/07-frontend-admin-user-detail.md` |

> Yalnızca çalıştığın iterasyonun dosyasını oku.

## Required Context

- `docs/10_IMPLEMENTATION_ROADMAP.md` §6 Faz 6 — tüm alt madde tanımları (a/b bölünme notlarıyla birlikte) ve Faz 6 İnsan onay noktası
- `docs/01_DOMAIN_MODEL.md` §2.9 Notification, §2.11 AuditLog, §3 entity ilişkileri (`User 1─N Notification`, `AuditLog` zayıf referans)
- `docs/03_API_CONTRACTS.md` §5.7 Notifications, §5.8 Admin (audit-logs + users detail endpoint'leri)
- `docs/02_DATABASE_SCHEMA.md` §2.10 `notifications`, §2.12 `audit_logs` — kolon listesi, index'ler
- `docs/06_SCREEN_CATALOG.md` §5.2 Bildirim ve Admin — S-NOTIFICATIONS, S-ADMIN-AUDIT-LOG, S-ADMIN-USER-DETAIL
- `docs/mimari-kararlar.md` N-001..N-004 (bildirim kararları), AUD-001..003 (audit log kararları), AP-004 (admin audit görünürlüğü)
- `.claude/rules/00-*.md` … `04-*.md` — zaten yüklü, tekrar edilmez; özellikle `03-security-baseline.md` madde 1 (private key sızıntısı yok) bu fazın İterasyon 6-7'sinde geçerlidir
- `.claude/skills/phase-05-transfer-state-machine/SKILL.md` — komşu faz formatı referansı; worker kalıbının ve `AuditService`/`$transaction` disiplininin kaynağı

## Done Definition

- [ ] Bir kullanıcı, gerçek bir transfer `confirmed`/`failed`'e ulaştığında veya bir cüzdanına gelen transfer tespit edildiğinde `/notifications`'ta ve nav rozetinde bunu görüyor; bildirime tıklama ilgili transfer/cüzdana yönlendiriyor
- [ ] Admin, `/admin/audit-log`'da Faz 1-5'te üretilen tüm audit yazımlarını (login, wallet creation, network-asset activation, transfer geçişleri, mint) filtreleyerek görebiliyor
- [ ] Admin, `/admin/users/[id]`'de herhangi bir kullanıcının cüzdan/transfer verisini görüyor; private key'in hiçbir API yanıtında veya DOM'da yer almadığı testle ve manuel kontrolle doğrulanmış
- [ ] `GET/PATCH /notifications*`, `GET /admin/audit-logs`, `GET /admin/users/:userId/{wallets,transfers}` sahiplik/rol guard'larıyla korunuyor (otomatik testle kanıtlı)
- [ ] CI'ın 4 adımı (lint→typecheck→test→build) yeşil

## Explicit Don'ts

- Email/SMS bildirim kanalı — MVP dışı (`mimari-kararlar.md` N-001, yalnızca in-app).
- Websocket/SSE tabanlı gerçek-zamanlı bildirim — MVP dışı (N-003, polling yeterli).
- Audit log tamper-evidence / chain-hash zinciri — MVP dışı (`mimari-kararlar.md` AUD-OPEN-2).
- Yeni bir `GET /admin/users/:userId` (kullanıcı özet) endpoint'i icat etmek — roadmap'te tanımlı değil, `GET /admin/users` (Faz 4 §4.4c) zaten liste sağlıyor.
- `dropped` durumunda bildirim üretmek — roadmap §6.1 yalnızca `tx confirmed`/`tx failed`/`incoming transfer detected`'ı listeler, `dropped` kapsam dışı bırakılmıştır (bilinçli roadmap kararı).
- Yeni negatif senaryo icadı — `docs/08_TESTING_STRATEGY.md` §4'teki 12 zorunlu senaryodan hiçbiri Faz 6'ya ait değil; bu faz yalnızca mevcut ownership (madde 5) ve role-guard (madde 6) desenini yeni endpoint'lere uygular.
- Coverage gate'inin CI'a eklenmesi — Faz 7 §7.1.

---
Faz bitti → `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 6 işaretlenir; kullanıcı onayı → Faz 7.
