# 08. Test Stratejisi — Vault

## İçindekiler

1. Test Piramidi ve Katman Sorumlulukları
2. Coverage Hedefleri
3. Kritik Modül Tanımı
4. Zorunlu Negatif / Deny Senaryoları
5. Test Verisi ve Factory/Fixture Stratejisi
6. E2E Journey Listesi ve Risk Seviyeleri
7. CI Gate
8. Test Adlandırma ve Dosya Yerleşimi

---

## 1. Test Piramidi ve Katman Sorumlulukları

**Unit testler (ağırlıklı katman):** İş mantığının kendisini, dış bağımlılık olmadan test eder. Ağırlık merkezi `TransferStateMachine` servisi (her geçiş, her guard koşulu) ve `packages/chain-providers` (adres format doğrulama, tutar dönüşümü, `IChainProvider` implementasyonlarının kendi mantığı) üzerindedir. Veritabanı veya gerçek RPC çağrısı içermez; repository'ler ve zincir istemcileri mock'lanır.

**Integration testler:** NestJS test modülü + gerçek bir test veritabanı (Docker Compose ile ayağa kalkan izole Postgres instance'ı) kullanılarak, controller'dan repository'ye kadar tüm katmanın birlikte çalıştığı kritik akışlar doğrulanır. Kapsam: transfer state machine'in uçtan uca bir HTTP isteği üzerinden çalışması (draft oluşturma → confirm → worker tetikleme noktası), auth akışı (login → refresh → rotation → replay tespiti), yetkilendirme guard zinciri (rol + ownership).

**E2E testler (Playwright):** Yalnızca ana kullanıcı akışını tarayıcı üzerinden uçtan uca doğrular — gerçek frontend + gerçek backend + test veritabanı. 1-2 senaryo ile sınırlıdır (bkz. §6); geniş bir E2E test matrisi bu ölçekte gereksiz bakım yüküdür.

**Sorumluluk sınırı:** Bir davranış unit testte doğrulanabiliyorsa integration testte tekrar edilmez; bir akış integration testte doğrulanabiliyorsa E2E'de tekrar edilmez. Piramidin tepesine çıkıldıkça test sayısı azalır, kapsadığı yüzey genişler.

---

## 2. Coverage Hedefleri

| Modül | Hedef | Zorunluluk |
| --- | --- | --- |
| `packages/chain-providers` | ≥%80 unit coverage | Zorunlu — CI'da bu eşiğin altına düşen bir PR merge edilemez |
| `TransferStateMachine` servisi | ≥%80 unit coverage | Zorunlu — aynı gerekçeyle |
| Projenin geneli | Sert eşik yok | — |

**Gerekçe:** Bu iki modül, zincire geri alınamaz bir işlem gönderen ve farklı ağların birbirinden ayrı davranışını soyutlayan en yüksek riskli kod yüzeyidir; bir hata burada doğrudan yanlış zincire/yanlış tutarda transfer veya bozuk bir state geçişi anlamına gelir. Projenin geneline sert bir eşik konmaz — demo/portföy ölçeğinde her satıra %80 coverage dayatmak over-engineering'dir ve gerçek riski azaltmayan, yalnızca sayıyı tatmin eden test yazımını teşvik eder.

---

## 3. Kritik Modül Tanımı

Aşağıdaki modüller, yukarıdaki sert coverage eşiğine tabi olmasa bile (yalnızca ikisi zorunlu eşik taşır), test yazımında öncelikli kabul edilir çünkü hatası doğrudan finansal/güvenlik sonucu doğurur:

- **`TransferStateMachine`** — yanlış bir geçiş, zincire yanlış bir işlem gönderilmesi veya bir işlemin takipsiz kalması anlamına gelir.
- **`packages/chain-providers`** (`EvmProvider`, `TronProvider`) — adres format doğrulama hatası, yanlış ağa fon gönderilmesine yol açabilir.
- **Envelope encryption servisi** (DEK/master key şifreleme-çözme akışı) — hatası private key'in yanlış saklanması veya sızması anlamına gelir.
- **Cross-network guard** ve **network/asset aktivasyon kontrolü** — bu ikisi atlanırsa yanlış ağa transfer veya pasif bir varlıkla işlem mümkün hale gelir.
- **Auth/session servisleri** (login, refresh rotation, replay tespiti) — hatası oturum güvenliğinin tamamını zayıflatır.

Bu modüllerde yapılan her değişiklik, ilgili negatif senaryoların (bkz. §4) regresyon testiyle birlikte gelir; bu, kod inceleme sürecinde ayrıca kontrol edilir.

---

## 4. Zorunlu Negatif / Deny Senaryoları

Aşağıdaki senaryolar, ilgili modül değiştirildiğinde test setinde bulunması zorunlu olan "olumsuz yol" testleridir:

1. Gönderen cüzdanın ağı ile hedef adresin beklenen ağı uyuşmuyorsa transfer `draft`'tan ileri geçemez (cross-network guard).
2. Pasif bir `(network, asset)` çiftinde yeni cüzdan eklenemez ve yeni transfer başlatılamaz.
3. Terminal durumdaki (`confirmed`/`failed`/`dropped`) bir transfer üzerinde herhangi bir geçiş denemesi reddedilir.
4. Step-up authentication'da yanlış şifre girildiğinde transfer `pending_signature`'a geçemez.
5. Bir kullanıcı başka bir kullanıcının cüzdanına/transferine erişmeye çalıştığında `403` döner (resource ownership).
6. `User` rolü, `Admin`'e özel bir endpoint'e erişmeye çalıştığında `403` döner.
7. Watch-only bir cüzdandan transfer başlatma denemesi reddedilir.
8. Bakiye yetersizken transfer onaylanamaz.
9. Refresh token replay (kullanılmış bir refresh token'ın tekrar kullanılması) tespit edildiğinde kullanıcının tüm oturumları geçersiz kılınır.
10. Rate limit eşiği aşıldığında (özellikle login) istek `429` ile reddedilir.
11. Mainnet chain ID'sine bağlanma denemesi, allowlist tarafından reddedilir — `IChainProvider` bu bağlantıyı hiç kuramaz.
12. Geçersiz adres formatı (yanlış checksum/base58check) cüzdan ekleme veya transfer oluşturmada reddedilir.

---

## 5. Test Verisi ve Factory/Fixture Stratejisi

Seed script'i (`apps/api/prisma/seed.ts`) yalnızca lokal geliştirme/demo ortamı içindir; test veritabanı ayrı bir mekanizma kullanır. Her domain için bir **factory fonksiyonu** tanımlanır (ör. `createTestUser()`, `createTestWallet({ type: 'managed' })`, `createTestTransfer({ state: 'confirming' })`) — testler bu fabrikalarla ihtiyaç duyduğu minimal veriyi üretir, seed verisine bağımlı olmaz. Bu, testlerin birbirinden ve seed içeriğinin değişmesinden izole kalmasını sağlar.

**Chain provider testleri gerçek testnet'e karşı çalışmaz.** RPC/Alchemy/TronGrid çağrıları, sabit mock/stub yanıtlarla değiştirilir (ör. belirli bir adres için sabit bir bakiye döndüren bir mock `EvmProvider`). Bu, testleri hem deterministik hem hızlı tutar ve CI'ın harici bir servise (ve o servisin o anki durumuna) bağımlı olmasını engeller.

Her integration test, kendi test veritabanı transaction'ını açıp test sonunda geri alır (rollback) veya her test dosyası öncesi veritabanını sıfırlar — testler arasında veri sızıntısı olmaz, testlerin çalışma sırası sonucu etkilemez.

---

## 6. E2E Journey Listesi ve Risk Seviyeleri

| Senaryo | Adımlar | Risk seviyesi |
| --- | --- | --- |
| Ana kullanıcı akışı | Login → yönetilen cüzdan oluştur → transfer başlat → step-up onayla → transfer detay ekranında `pending_signature` durumunu gör | Yüksek — ürünün çekirdek değer önerisini uçtan uca doğrular |
| Watch-only cüzdan ekleme | Login → watch-only cüzdan ekle → dashboard'da bakiyeyi gör | Orta — ikincil ama sık kullanılan bir akış |

İki senaryo ile sınırlı tutulmasının gerekçesi: E2E testler en yavaş ve en kırılgan katmandır; demo/portföy ölçeğinde geniş bir E2E matrisi bakım maliyetini haklı çıkaracak bir risk azaltımı sağlamaz — asıl güvenlik ve doğruluk riski unit/integration katmanında (§1-4) karşılanır.

---

## 7. CI Gate

GitHub Actions üzerinde her PR'da şu adımlar sırayla çalışır; herhangi biri başarısız olursa merge engellenir:

1. **Lint** (ESLint, paylaşılan `packages/config` konfigürasyonuyla)
2. **Typecheck** (`tsc --noEmit`, tüm workspace paketleri için)
3. **Unit + integration testler** (test veritabanı Docker Compose ile CI runner'ında ayağa kaldırılır)
4. **Build** (`turbo build` — tüm `apps/*` ve `packages/*` paketlerinin başarıyla derlendiği doğrulanır)

**Deploy adımı yoktur** — sistem hiçbir ortama deploy edilmediğinden CI'ın son adımı build'dir, bir yayınlama/dağıtım adımı eklenmez. `packages/chain-providers` ve `TransferStateMachine` için %80 coverage eşiği, adım 3'ün bir parçası olarak coverage raporu üzerinden otomatik kontrol edilir; eşiğin altına düşen bir değişiklik CI'ı kırar.

---

## 8. Test Adlandırma ve Dosya Yerleşimi

- **Unit ve integration testler:** Test edilen dosyayla aynı klasörde, `*.spec.ts` uzantısıyla yaşar (ör. `transfer-state-machine.service.ts` yanında `transfer-state-machine.service.spec.ts`) — co-location, testi kodla birlikte bulmayı ve birlikte güncellemeyi kolaylaştırır.
- **E2E testler:** Ayrı bir `apps/web/e2e/` klasöründe, `*.e2e-spec.ts` uzantısıyla yaşar; bunlar herhangi bir tekil dosyayla değil bir kullanıcı akışıyla eşleştiğinden co-location kuralı onlara uygulanmaz.
- **Test dosyası adı, test ettiği birimin adını birebir yansıtır** — `wallets.service.spec.ts`, `wallets.service.ts`'i test eder; bu eşleşme bozulursa (ör. bir dosya yeniden adlandırılırsa) test dosyası da aynı adımda yeniden adlandırılır.
- **Describe/it adlandırması Türkçe değil İngilizcedir** (kod tanımlayıcıları İngilizce politikasıyla tutarlı) — `describe('TransferStateMachine')`, `it('rejects transition from confirmed to any state')`.