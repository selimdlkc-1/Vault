---
paths:
  - "packages/chain-providers/**/*.ts"
  - "apps/api/src/transfers/**/*.ts"
---

# Kritik Modüller — Chain Providers ve Transfer State Machine

Bu iki modül, zincire geri alınamaz işlem gönderen ve en yüksek finansal/güvenlik riski taşıyan yüzeydir; CI'da **≥%80 unit coverage zorunludur** ve buradaki her değişiklik ilgili negatif senaryonun regresyon testiyle birlikte gelir.

## Chain providers (`packages/chain-providers`)

`IChainProvider` arayüzü arkasında `EvmProvider` (ethers v6 — Sepolia + BSC Testnet) ve `TronProvider` (tronweb) yaşar. Provider başlatılırken `CHAIN_ID_ALLOWLIST` kontrolü yapılır — allowlist dışı (mainnet dahil) bir chain ID ile başlatma denemesi reddedilir; bu allowlist **genişletilmez**. Adres format doğrulaması ağa özeldir: EVM `0x...` + EIP-55 checksum, Tron `T...` + base58check — tek bir ortak regex kullanılmaz.

✓ Doğru: yeni bir provider metodu eklerken mock/stub RPC yanıtıyla unit test yazmak.
✗ Yanlış: chain ID allowlist kontrolünü bypass eden bir "debug modu" eklemek.

## Transfer State Machine (`apps/api/src/transfers`)

Tüm state geçişleri yalnızca `TransferStateMachine` servisi üzerinden yapılır; whitelist geçiş tablosu her denemede kontrol edilir, tanımsız geçiş `InvalidTransitionError` fırlatıp audit'e yazılır. Terminal durumlardan (`confirmed`/`failed`/`dropped`) **hiçbir geçiş yapılamaz**; worker'lar `(chain, txHash)` veya `(transferId, targetState)` anahtarıyla idempotent çalışır.

**Cross-network guard:** gönderen cüzdanın `network_id`'si ile hedef adresin beklenen network'ü backend'de karşılaştırılır; uyuşmazlıkta transfer `draft`'tan ileri geçemez. Bu kontrol yalnızca backend'de zorlanır, UI kontrolü tek başına yeterli sayılmaz.

## Anti-pattern'ler

- `transfers` modülü dışında veya `TransferStateMachine` atlanarak `state` alanına `UPDATE` yazmak
- Bir worker'ın aynı job'u tekrar işlediğinde yan etkili davranması (idempotency ihlali)
- Zincir bakiyelerini/tutarlarını JS `number`'a çevirmek (`BigInt`/string + `DECIMAL(38,18)` disiplini korunur)

---
Detay: `docs/01_DOMAIN_MODEL.md` §5.2; `docs/08_TESTING_STRATEGY.md` §2–4; `docs/mimari-kararlar.md` AUTH-004, W-003, SEC-005
