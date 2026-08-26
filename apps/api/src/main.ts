import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { validateEnv } from "./config/env.schema";

async function bootstrap() {
  // Fail-fast: env eksik/geçersizse Nest app hiç oluşturulmadan durur.
  validateEnv(process.env);

  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((error) => {
  console.error(
    "[bootstrap] Uygulama başlatılamadı:\n",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
