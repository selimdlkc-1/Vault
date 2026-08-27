import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hash() argon2id formatında bir hash üretir", async () => {
    const hash = await service.hash("correct horse battery staple");

    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("hash() aynı plaintext için her çağrıda farklı çıktı üretir (rastgele salt)", async () => {
    const plain = "correct horse battery staple";

    const [a, b] = await Promise.all([service.hash(plain), service.hash(plain)]);

    expect(a).not.toBe(b);
  });

  it("verify() doğru şifrede true döner", async () => {
    const plain = "correct horse battery staple";
    const hash = await service.hash(plain);

    await expect(service.verify(hash, plain)).resolves.toBe(true);
  });

  it("verify() yanlış şifrede false döner", async () => {
    const hash = await service.hash("correct horse battery staple");

    await expect(service.verify(hash, "wrong password")).resolves.toBe(false);
  });

  it("hash() güvenli argon2id maliyet parametrelerini korur (elle zayıflatılmaz)", async () => {
    const hash = await service.hash("correct horse battery staple");

    // $argon2id$v=19$m=65536,p=4,t=3$salt$hash
    expect(hash.startsWith("$argon2id$")).toBe(true);

    const memoryCost = Number(hash.match(/\bm=(\d+)/)?.[1]);
    const timeCost = Number(hash.match(/\bt=(\d+)/)?.[1]);
    // OWASP argon2id taban önerisi: m >= 19456 KiB, t >= 2
    expect(memoryCost).toBeGreaterThanOrEqual(19456);
    expect(timeCost).toBeGreaterThanOrEqual(2);
  });
});
