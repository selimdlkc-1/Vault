/**
 * Token miktarı gösterimi (docs/05_FRONTEND_SPEC.md §7). Backend bakiyeyi her zaman
 * en küçük birimde (wei/sun) bir `BigInt` string'i olarak döner (`balanceRaw`);
 * insan-okur "miktar" gösterimi için varlığın `decimals` değeriyle ölçeklenir.
 *
 * Hesaplama tamamen `BigInt` üzerinden yapılır — `Number`'a hiç dönülmez, bu yüzden
 * hassasiyet kaybı yoktur. Sonuç TR sayı biçimindedir (nokta binlik, virgül ondalık),
 * `UsdtValue` ile aynı konvansiyon. Bu yalnızca token *miktarıdır*, parasal değer
 * değildir — parasal değer tek kaynak olarak `UsdtValue`'dan geçer.
 */
const trInteger = new Intl.NumberFormat("tr-TR");

export function formatTokenAmount(balanceRaw: string, decimals: number): string {
  let raw = balanceRaw.trim();
  let negative = false;
  if (raw.startsWith("-")) {
    negative = true;
    raw = raw.slice(1);
  }

  let intPart: string;
  let fracPart: string;
  try {
    // Yapısal doğrulama: geçerli bir tamsayı değilse ham değeri döndür.
    BigInt(raw);
    const padded = raw.padStart(decimals + 1, "0");
    const cut = padded.length - decimals;
    intPart = padded.slice(0, cut);
    fracPart = decimals > 0 ? padded.slice(cut).replace(/0+$/, "") : "";
  } catch {
    return balanceRaw;
  }

  const formatted = trInteger.format(BigInt(intPart));
  const withFrac = fracPart ? `${formatted},${fracPart}` : formatted;
  return negative && withFrac !== "0" ? `-${withFrac}` : withFrac;
}
