### İterasyon 5 — a11y Geçişi (§7.5)

**Hedef:** 21 ekranın tamamı (İterasyon 4'ün sistem ekranları dahil), `docs/05_FRONTEND_SPEC.md` §8'deki 6 WCAG 2.1 AA temel pratiğini karşılıyor; bulunan her eksiklik düzeltilmiş.

**Teslim çıktısı:**
- Ekran bazlı a11y denetim tablosu (hangi ekran, hangi pratik, durum) — PR açıklamasında veya kısa bir iç not olarak
- 6 pratikten herhangi birinde eksik bulunan bileşenlerde düzeltme commit'leri

**Önkoşullar:**
- [ ] İterasyon 4 Stop tamam (sistem ekranları dahil tüm 21 ekran artık mevcut)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §7.5 — iterasyon kapsamı ve gerekçe (neden bütünsel olarak en sonda yapılır)
2. `docs/05_FRONTEND_SPEC.md` §8 — 6 zorunlu pratik: semantic HTML, klavye navigasyonu, form etiketleme, odak yönetimi, renk-bağımsız durum, alt metin
3. `docs/06_SCREEN_CATALOG.md` — ekran listesi (21 ekranın tam envanteri için içindekiler/route tablosu)

**Uygulama planı:**
1. `docs/06_SCREEN_CATALOG.md`'deki 21 ekranın tam listesini çıkar (route tablosu); her biri için 6 pratiği tek tek klavye-only gezinerek (fare kullanmadan) ve ekran okuyucu/DOM inceleme ile manuel kontrol et — otomatik araç (axe/Lighthouse) kurulmaz (`docs/05` §8 bilinçli karar).
2. **Semantic HTML:** `div` yığını yerine `button`/`nav`/`main`/`form`/`table` kullanılıp kullanılmadığını denetle; shadcn/ui primitive'leri zaten bu temeli sağlar, öncelik özel/custom yazılmış bileşenlerdedir.
3. **Klavye navigasyonu:** Her interaktif öğenin (buton, link, form alanı, modal, dropdown) yalnızca `Tab`/`Enter`/`Escape` ile kullanılabildiğini doğrula; `onClick` taşıyan ama `<button>`/`<a>` olmayan bir `div` bulunursa düzelt.
4. **Form etiketleme:** Her form alanının `<label htmlFor>` ile eşleştiğini, yalnızca placeholder'a güvenen alan olmadığını kontrol et (özellikle S-AUTH-LOGIN, S-AUTH-REGISTER, S-WALLET-ADD-*, S-TRANSFER-NEW, S-TRANSFER-CONFIRM, S-ADMIN-MINT formları).
5. **Odak yönetimi:** shadcn/ui `Dialog` kullanılan her modalde focus trap'in varsayılan davrandığını doğrula (elle re-implement edilmiş bir modal varsa düzelt).
6. **Renk-bağımsız durum:** `TransferStateBadge` ve benzeri durum göstergelerinin (network/asset aktif-pasif toggle, transfer durumları) rengin yanında her zaman metin taşıdığını doğrula.
7. **Alt metin:** Anlam taşıyan görsellerde `alt` dolu, dekoratif görsellerde `alt=""` olduğunu kontrol et.
8. Bulunan her eksikliği ilgili bileşen dosyasında düzelt; denetim tablosunu PR açıklamasına ekle.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Güncelle | Denetimde eksik bulunan bileşen/ekran dosyaları (`apps/web/src/components/**`, `apps/web/src/app/**`) — kapsam denetim sonucuna göre belirlenir, önceden sabit değildir |
| Dokunma | Eksik bulunmayan ekranlar — gereksiz yeniden yazım yapılmaz |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Semantic HTML | `docs/05` §8 madde 1 | shadcn/ui primitive önceliği, custom `div` yığınları düzeltilir |
| Klavye navigasyonu | `docs/05` §8 madde 2 | `onClick`'li `div` interaktif kontrol yerine geçemez |
| Form etiketleme | `docs/05` §8 madde 3 | `htmlFor`/`id` eşleşmesi, placeholder-only yasak |
| Odak yönetimi | `docs/05` §8 madde 4 | shadcn/ui `Dialog` varsayılanı, elle re-implement yok |
| Renk-bağımsız durum | `docs/05` §8 madde 5 | `TransferStateBadge` ve toggle'larda metin + renk birlikte |
| Alt metin | `docs/05` §8 madde 6 | Anlamlı görsel `alt` dolu, dekoratif `alt=""` |

**Kalite kapıları:**
- [ ] 21 ekranın tamamı 6 pratiğe karşı manuel denetlenmiş (denetim tablosu PR'da)
- [ ] Bulunan her eksiklik düzeltilmiş, düzeltme sonrası aynı ekran yeniden denetlenmiş
- [ ] Lint + typecheck + test + build yeşil
- [ ] Otomatik a11y aracı (axe/Lighthouse) **eklenmemiş** — bilinçli sınır

**Bu iterasyonda yok:**
- Otomatik a11y denetim aracı kurmak veya sayısal a11y skoru hedefi koymak (`docs/05` §8 — over-engineering'den kaçınma)
- Ekranların işlevsel davranışını değiştirmek — yalnızca erişilebilirlik düzeltmeleri, yeni özellik yok
- Bundle/performans denetimi (`docs/05` §9 — kapsam dışı, ayrı bir konu)

**Risk / dikkat:**
- Odak yönetimini elle re-implement etmek (shadcn/ui `Dialog`'un sağladığı focus trap'i bypass edip özel bir çözüm yazmak) hem gereksiz karmaşıklık hem hatalı davranış riski taşır — mevcut bileşen davranışına güvenilmeli.
- Renk-bağımsız durum kontrolü yalnızca `TransferStateBadge` ile sınırlı değil — network/asset aktif-pasif toggle'ı, bildirim okunmuş/okunmamış göstergesi gibi diğer durum göstergeleri de gözden geçirilmeli.

**Stop:**
- [ ] Denetim tablosu (21 ekran × 6 pratik) tamamlanmış, tüm satırlar "geçti" veya "düzeltildi"
- [ ] `pnpm turbo lint typecheck test build` yeşil
- [ ] PR/onay → İterasyon 6
