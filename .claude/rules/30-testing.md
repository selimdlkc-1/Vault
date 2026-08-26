---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "apps/web/e2e/**/*.e2e-spec.ts"
---

# Test Yazımı

Unit testler (ağırlıklı katman) iş mantığını dış bağımlılık olmadan test eder — repository ve zincir istemcileri mock'lanır. Integration testler NestJS test modülü + izole test Postgres'i ile kritik akışları (transfer state machine, auth, guard zinciri) uçtan uca doğrular. E2E (Playwright) yalnızca ana kullanıcı akışıyla sınırlıdır, geniş bir matris tutulmaz.

## Chain provider testleri

RPC/Alchemy/TronGrid çağrıları **gerçek testnet'e karşı çalışmaz** — sabit mock/stub yanıtlarla değiştirilir. Bu, testleri deterministik tutar ve CI'ı harici servis kesintisinden izole eder.

✓ Doğru: `EvmProvider` testinde sabit bir bakiye döndüren mock RPC client.
✗ Yanlış: unit testin gerçek bir Sepolia RPC endpoint'ine istek atması.

## Test verisi

Her domain için bir factory fonksiyonu kullanılır (`createTestUser()`, `createTestWallet({ type: 'managed' })`) — testler seed verisine bağımlı olmaz. Her integration test kendi transaction'ını rollback eder veya test öncesi veritabanını sıfırlar.

## Zorunlu negatif senaryolar

İlgili modül değiştiğinde, o modüle ait zorunlu negatif/deny senaryosu (12 maddelik liste) regresyon testi olarak bulunur/geçer — liste burada tekrar edilmez.

## Anti-pattern'ler

- Unit testte doğrulanabilecek bir davranışı integration testte tekrar etmek
- Test dosyasını test ettiği koddan ayrı bir klasöre koymak (co-location ihlali)

---
Detay: `docs/08_TESTING_STRATEGY.md` §1, §4–5, §8
