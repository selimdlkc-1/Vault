---
paths:
  - "apps/api/src/**/*.ts"
---

# Backend Katman Mimarisi

`apps/api/src` üç katmana ayrılır: controller (HTTP), service (iş mantığı), repository (Prisma erişimi). Bir katman altındakini atlayarak üsttekini çağırmaz.

## Katman sınırı

Controller yalnızca DTO doğrulanmış veriyi servise iletir, servisin sonucunu response envelope'una sarar — hiçbir iş kuralı, DB erişimi veya zincir çağrısı içermez. Service tüm iş mantığının, yetkilendirme sonrası kontrollerin (sahiplik, cross-network guard, aktivasyon), audit yazımının yaşadığı katmandır; başka bir modülün repository'sine doğrudan erişmez, DI ile ilgili modülü enjekte eder. Repository yalnızca sorgu/yazma yapar, hiçbir iş kuralı barındırmaz.

✓ Doğru: `TransfersService` içinde cross-network guard kontrolü, sonra `TransfersRepository.create()` çağrısı.
✗ Yanlış: controller içinde doğrudan Prisma client çağrısı veya `IChainProvider` erişimi.

## Modül yapısı

Her domain modülü (`wallets`, `transfers`, `networks`, ...) kendi klasöründe `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `dto/` taşır. `workers/` altındaki her BullMQ processor kendi dosyasında yaşar ve ilgili domain servisini DI ile enjekte eder — kendi repository'sini tutmaz.

## Kesin kural

`Transfer.state` alanına yazan tek kod yolu `TransferStateMachine` servisidir; hiçbir controller, repository veya worker bu alana doğrudan `UPDATE` uygulamaz (bkz. `13-critical-modules.md`).

## Anti-pattern'ler

- Controller'da try/catch dışında iş mantığı
- Bir modülün başka bir modülün repository'sini doğrudan import etmesi
- Worker'ın kendi Prisma sorgusunu yazması (domain repository'sini kullanmalı)

---
Detay: `docs/04_BACKEND_SPEC.md` §1–3, §8
