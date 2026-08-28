/**
 * USDT değer yardımcıları (docs/05_FRONTEND_SPEC.md §7 para birimi kuralı).
 *
 * Backend her varlık bakiyesinin USDT karşılığını 18-ondalıklı sabit bir decimal
 * string olarak ya da fiyat cache'te yoksa `null` döner (`docs/mimari-kararlar.md`
 * P-014/P-015). Bu modül yalnızca **toplama** yapar — gösterim formatı tek kaynak
 * olarak `UsdtValue` bileşenindedir, burada string üretilmez.
 */

/**
 * Bir varlık listesinin USDT değerlerini toplar. Tüm değerler `null` ise (hiç
 * fiyat yok) sonuç `null` döner — `UsdtValue` bunu "—" olarak render eder.
 * Kısmi `null` durumunda yalnızca fiyatı bilinen varlıklar toplanır (backend
 * `portfolio/summary` toplamıyla aynı davranış).
 *
 * Not: demo ölçeğinde `Number` toplama yeterli hassasiyettedir; kritik toplam
 * (`totalValueUsdt`) zaten backend'de `BigInt` ile hesaplanıp string döner.
 */
export function sumUsdtValues(values: (string | null)[]): string | null {
  const known = values.filter((v): v is string => v !== null);
  if (known.length === 0) {
    return null;
  }
  const total = known.reduce((acc, v) => acc + Number(v), 0);
  return String(total);
}
