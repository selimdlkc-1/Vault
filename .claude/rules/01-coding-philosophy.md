# Çalışma Disiplini

Geliştirme **faz → alt madde → iterasyon** hiyerarşisiyle ilerler. Bir alt madde (`§N.M`), tek bir agent oturumunun ürettiği, tek bir PR'a karşılık gelen en küçük teslim birimidir — **"1 chat ≈ 1 PR"**. Bir alt madde tamamlanmadan bir sonrakine geçilmez.

## Test-first ve doğrulama

Bir alt madde, ilgili unit/integration testleri olmadan tamamlanmış sayılmaz. `TransferStateMachine`, `packages/chain-providers`, envelope encryption ve cross-network guard içeren değişiklikler, ilgili negatif/deny senaryolarının regresyon olarak eklendiğinden veya hâlâ geçtiğinden ayrıca doğrulanır.

✓ Doğru: Cross-network guard'a dokunan bir PR, "gönderen ağ ≠ hedef ağ" negatif senaryosunu regresyon testine ekler.
✗ Yanlış: "Testler geçti" gerekçesiyle kritik modül testi eklemeden PR açmak.

## Self-review ve onay disiplini

Agent bir PR'ı kendi kendine onaylayıp `main`'e almaz. Değişiklik tamamlanır → branch'te commit'lenir → PR açılır ve özetlenir → kullanıcının **açık onayı** beklenir → CI yeşilse merge edilir. CI'ın geçmesi onayın yerine geçmez.

## Vibe coding disiplini

Küçük PR ilkesi: bir PR tek bir alt maddeyi (`§N.M`) karşılar, ilgisiz değişiklikler biriktirilmez. Bir agent oturumu, üzerinde çalıştığı alt maddenin tanımını ve bağımlı olduğu önceki çıktıyı bağlam alır — tüm roadmap'i yeniden okumaz. Over-engineering yapılmaz: proje ölçeği (birkaç manuel test kullanıcısı) gerektirmeyen karmaşıklık (mikroservis, çoklu bölge, gelişmiş güvenlik aracı) eklenmez.

---
Detay: `docs/10_IMPLEMENTATION_ROADMAP.md` §1, §4; `docs/09_DEV_WORKFLOW.md` §3–4
