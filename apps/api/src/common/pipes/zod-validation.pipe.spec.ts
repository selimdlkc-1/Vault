import { z } from "zod";
import { ValidationFailedException } from "../exceptions/domain.exception";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const schema = z
    .object({
      email: z.string().email("Geçerli bir e-posta adresi girin"),
      password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
    })
    .strict();
  const pipe = new ZodValidationPipe(schema);

  it("geçerli girdide parse edilmiş (transform uygulanmış) veriyi döner", () => {
    const withTrim = new ZodValidationPipe(
      z.object({ email: z.string().trim().toLowerCase() }),
    );

    expect(withTrim.transform({ email: "  USER@Vault.LOCAL " })).toEqual({
      email: "user@vault.local",
    });
  });

  it("geçersiz girdide ValidationFailedException fırlatır", () => {
    expect(() => pipe.transform({ email: "not-an-email", password: "short" })).toThrow(
      ValidationFailedException,
    );
  });

  it("details alanı her hatalı alan için { field, reason } taşır", () => {
    expect.assertions(2);
    try {
      pipe.transform({ email: "bad", password: "x" });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationFailedException);
      const details = (error as ValidationFailedException).details as Array<{
        field: string;
        reason: string;
      }>;
      expect(details).toEqual(
        expect.arrayContaining([
          { field: "email", reason: "Geçerli bir e-posta adresi girin" },
          { field: "password", reason: "Şifre en az 8 karakter olmalı" },
        ]),
      );
    }
  });

  it("şemada tanımlanmayan alan gönderilirse reddeder (.strict)", () => {
    expect(() =>
      pipe.transform({
        email: "user@vault.local",
        password: "password1",
        role: "admin",
      }),
    ).toThrow(ValidationFailedException);
  });
});
