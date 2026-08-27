import { ConfigModule } from "@nestjs/config";
import { validEnvFixture } from "./env.fixture";
import { validateEnv } from "./env.schema";

/**
 * Testlerde `AppModule`'ün tamamını yüklemeden global `ConfigService`'i sağlayan
 * yardımcı. Gerçek `process.env`'e dokunmaz (CI'da JWT secret'ları tanımlı
 * olmadığından), `env.fixture.ts`'teki doğrulanmış placeholder'ları yükler.
 */
export function testConfigModule(): ReturnType<typeof ConfigModule.forRoot> {
  return ConfigModule.forRoot({
    isGlobal: true,
    ignoreEnvFile: true,
    load: [() => validateEnv(validEnvFixture)],
  });
}
