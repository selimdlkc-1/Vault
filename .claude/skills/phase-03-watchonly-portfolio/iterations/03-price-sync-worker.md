### İterasyon 3 — Price-sync Worker (§3.3)

**Hedef:** `price-sync` worker'ı CoinGecko'dan testnet varlıklarının mainnet karşılığı fiyatları çekip 60 saniyelik Redis cache'e yazar; sonraki iterasyonların USDT hesaplaması (`ETH/USDT = (ETH/USD) ÷ (USDT/USD)`) bu cache'i okuyacak.

**Teslim çıktısı:**
- `packages/types/src/asset-price-map.ts` (mainnet sembolüne statik mapping tablosu)
- `apps/api/src/workers/price-sync/{price-sync.module.ts, price-sync.processor.ts, coingecko-client.ts}` (+ `.spec.ts`)
- `apps/api/src/common/price-cache.service.ts` (Redis okuma/yazma sarmalayıcısı)

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam (worker altyapı kalıbı — `BullModule.registerQueue` + processor modülü — kuruldu)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.3 — kapsam
2. `docs/mimari-kararlar.md` I-010 (fiyat kaynağı, symbol mapping, 60sn cache), P-014 (USDT peg'i sabit kabul edilmez, canlı fiyattan türetilir)
3. `docs/04_BACKEND_SPEC.md` §8 (worker kalıbı — İterasyon 2'de kurulan kalıp tekrar kullanılır), §10 (`COINGECKO_API_KEY`, `REDIS_URL` env değişkenleri)
4. `docs/mimari-kararlar.md` I-009 (rate limit stratejisi — CoinGecko çağrıları da bu kapsamdadır)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/price-sync-worker` branch'i aç.
2. `packages/types/src/asset-price-map.ts`: seed'deki asset sembollerini (`ETH`, `BNB`, `TRX`, `USDT`) CoinGecko id'lerine eşleyen sabit `Record<string, string>` (`{ ETH: 'ethereum', BNB: 'binancecoin', TRX: 'tron', USDT: 'tether' }`) — bu, `docs/02` §2.2 `assets.coingecko_id` kolonunun kod tarafındaki karşılığıdır (seed zaten bu kolonu dolduruyor, İterasyon 1'de dokunulmadı); `index.ts` barrel'ına ekle.
3. `workers/price-sync/coingecko-client.ts`: CoinGecko `simple/price` endpoint'ini çağıran ince bir HTTP istemcisi; `COINGECKO_API_KEY` varsa header'a eklenir, yoksa public tier ile devam eder (`docs/04` §10 notu).
4. `common/price-cache.service.ts`: `PriceCacheService.set(assetSymbol, usdPrice)` / `get(assetSymbol)` — Redis'te `TTL: 60` saniye ile string olarak saklar (fiyat da sayısal tip disiplinine tabidir, `number` olarak cache'lenmez, `string` decimal temsili kullanılır).
5. `workers/price-sync/price-sync.processor.ts`: periyodik (60sn) tetiklenir; `asset-price-map`'teki tüm sembolleri tek bir CoinGecko toplu çağrısıyla çeker, her sonucu `PriceCacheService.set()` ile yazar; CoinGecko hatasında (İterasyon 2'nin retry/backoff kalıbı tekrarlanır) eski cache değeri süresi dolana kadar geçerli kalır (fail-open, worker hatası dashboard'u kilitlemez).
6. `workers/price-sync/price-sync.module.ts`: `BullModule.registerQueue({ name: 'price-sync' })`.
7. Unit test (`coingecko-client`): mock HTTP yanıtıyla doğru parse. Unit test (`price-sync.processor`): mock client + mock `PriceCacheService` ile doğru sembollerin cache'lendiği doğrulanır; CoinGecko hatasında worker'ın eski cache'i bozmadığı (yeni `set` çağrısı yapılmadığı) doğrulanır.
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `types/src/asset-price-map.ts`, `workers/price-sync/{price-sync.module.ts, price-sync.processor.ts, coingecko-client.ts}` (+`.spec.ts`), `common/price-cache.service.ts` (+`.spec.ts`) |
| Güncelle | `packages/types/src/index.ts`, `apps/api/src/app.module.ts` |
| Dokunma | USDT hesaplama mantığının kendisi (İterasyon 4/5 — bu iterasyon yalnızca fiyatı cache'ler, portföy toplamını hesaplamaz) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Testnet varlığı mainnet sembolüne map'lenir | `mimari-kararlar` I-010 | `asset-price-map.ts`, statik `Record` |
| USDT peg'i sabit değil, canlı fiyattan türetilir | `mimari-kararlar` P-014 | Her iki taraf (ör. ETH ve USDT) da CoinGecko'dan ayrı ayrı çekilir |
| 60sn Redis cache | `mimari-kararlar` I-010 | `PriceCacheService`, Redis `TTL: 60` |
| Fiyat da string temsille tutulur | `CLAUDE.md` §02, sayısal tip disiplini | `PriceCacheService` `number` döndürmez |

**Kalite kapıları:**
- [ ] Unit test: `coingecko-client` parse + `price-sync.processor` başarı/hata senaryosu
- [ ] Fail-open davranışı testle kanıtlı (CoinGecko hatasında eski cache korunur)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `ETH/USDT = (ETH/USD) ÷ (USDT/USD)` formülünün uygulanması (bu, cache'i tüketen İterasyon 4/5'in işidir), portföy toplamı hesaplama, `GET /portfolio/summary`.

**Risk / dikkat:** CoinGecko'nun public/free tier'ında rate limit oldukça düşüktür — tüm sembollerin **tek bir toplu çağrıda** (`simple/price?ids=a,b,c`) çekilmesi, sembol başına ayrı çağrı yapmaktan kritik derecede önemlidir; ayrı çağrı yaklaşımı rate limit'e hızla takılır. Fail-open kararı (hata durumunda eski cache'in korunması) bilinçlidir — worker'ın kendisi asla bir exception'ı dashboard'a yansıtan bir hataya çevirmemelidir.

**Stop:**
- [ ] `pnpm --filter api test -- price-sync`
- [ ] PR/onay → İterasyon 4
