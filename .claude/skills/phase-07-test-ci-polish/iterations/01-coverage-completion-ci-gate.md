### İterasyon 1 — Coverage Tamamlama + CI Gate (§7.1)

**Hedef:** `packages/chain-providers` ve `TransferStateMachine` servisi unit coverage'ı ≥%80'e tamamlanmış; CI, bu eşiğin altına düşen bir PR'ı otomatik reddediyor.

**Teslim çıktısı:**
- Eksik kalan dal/koşulları kapatan yeni/güncellenmiş `*.spec.ts` dosyaları (`EvmProvider`, `TronProvider`, `TransferStateMachine`)
- Jest coverage konfigürasyonuna `coverageThreshold` (bu iki modül için ayrı, proje geneli için yok)
- CI workflow'una (Faz 0 §0.4'te kurulan pipeline) coverage adımının eşik-altı durumda kırmızı dönmesi

**Önkoşullar:**
- [ ] Faz 0-6'nın tüm alt maddeleri tamamlanmış ve onaylanmış (bu iterasyonun test edeceği kod tabanı eksiksiz)
- [ ] CI pipeline (Faz 0 §0.4: lint→typecheck→test→build) çalışır durumda

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §7.1 — iterasyon kapsamı
2. `docs/08_TESTING_STRATEGY.md` §2 Coverage Hedefleri — hangi iki modül, neden sert eşik
3. `docs/08_TESTING_STRATEGY.md` §7 CI Gate — coverage kontrolünün pipeline'daki yeri (adım 3'ün parçası)
4. `.claude/rules/04-quality-gates.md` — eşik zaten proje talimatlarında yüklü, tekrar okunmaz ama referans doğrulaması için bak

**Uygulama planı:**
1. Mevcut coverage raporunu (`jest --coverage`) `packages/chain-providers` ve `TransferStateMachine` için ayrı ayrı çalıştır, %80 altındaki dosya/dalları listele.
2. Eksik yolları kapatan test case'leri ekle — özellikle `EvmProvider`/`TronProvider`'ın hata/edge-case dalları (RPC timeout, geçersiz response şekli) ve `TransferStateMachine`'in her guard koşulunun negatif dalı (`docs/08` §3 Kritik Modül Tanımı).
3. Jest config'e (`packages/chain-providers/jest.config.*`, `apps/api` transfer modülü için ilgili config) `coverageThreshold` ekle — yalnızca bu iki modülün path'i için, global threshold eklenmez.
4. CI workflow dosyasında (Faz 0 §0.4'ün ürettiği pipeline, adım 3 "test") coverage komutunun eşik-altı çıkışta non-zero exit code döndürdüğünü doğrula (Jest `coverageThreshold` zaten bunu native yapar — ek script gerekmez).
5. Bilinçli olarak eşiği altına düşürecek bir PR ile (lokal, merge edilmeyecek) gate'in kırmızı döndüğünü doğrula, sonra geri al.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Güncelle | `packages/chain-providers/**/*.spec.ts`, `apps/api/src/transfers/transfer-state-machine.service.spec.ts` (eksik dallar) |
| Güncelle | `packages/chain-providers/jest.config.*`, transfer modülünün jest config'i — `coverageThreshold` |
| Güncelle | `.github/workflows/*.yml` (Faz 0 §0.4'te oluşturulan CI dosyası) — coverage adımının gate olarak zorunlu kalması |
| Dokunma | Diğer modüllerin coverage'ı — `docs/08` §2 sert eşik yalnızca bu iki modülde |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `chain-providers` ≥%80 | `docs/08` §2 | `jest.config` `coverageThreshold.global` yalnızca bu paket kapsamında |
| `TransferStateMachine` ≥%80 | `docs/08` §2 | Eşik, servis dosyasına path-scoped `coverageThreshold` ile uygulanır |
| Eşik altına düşen PR reddedilir | `docs/08` §7 | Jest `coverageThreshold` aşılmazsa test adımı `exit 1` döner, CI kırmızı olur |
| Projenin geneline sert eşik yok | `docs/08` §2 | Diğer modüllere `coverageThreshold` eklenmez |

**Kalite kapıları:**
- [ ] `jest --coverage` çıktısında iki modül ≥%80
- [ ] Bilinçli düşürülmüş bir coverage ile CI'ın kırmızı döndüğü manuel doğrulanmış (sonra geri alınmış)
- [ ] Lint + typecheck + tüm test suite yeşil
- [ ] Coverage: `packages/chain-providers` ≥%80, `TransferStateMachine` ≥%80 (`.claude/rules/04-quality-gates.md`)

**Bu iterasyonda yok:**
- Yeni deny senaryosu eklemek (İterasyon 2'nin kapsamı) — bu iterasyon yalnızca mevcut davranışın test edilmemiş dallarını kapatır
- E2E testleri (İterasyon 3)
- Projenin geneline coverage eşiği eklemek

**Risk / dikkat:**
- Coverage yüzdesini yapay şekilde şişirmek için anlamsız/assertion'sız test eklemek yasak (`docs/01` felsefesi — over-engineering'in tersi ama aynı derecede zararlı bir "sayıyı tatmin etme" hatası, `docs/08` §2 gerekçesiyle çelişir); her yeni test gerçek bir davranışı doğrulamalı.
- `coverageThreshold`'u yanlışlıkla global scope'a eklemek projenin geneline sert eşik dayatır — path-scoped olduğundan emin ol.

**Stop:**
- [ ] `pnpm --filter @vault/chain-providers test -- --coverage` ve `TransferStateMachine` testi ayrı ayrı ≥%80 gösteriyor
- [ ] `pnpm turbo lint typecheck test build` yeşil
- [ ] PR/onay → İterasyon 2
