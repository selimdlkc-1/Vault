import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";
import { validateEnv } from "./config/env.schema";

async function bootstrap() {
  // Fail-fast: env eksik/geçersizse Nest app hiç oluşturulmadan durur.
  validateEnv(process.env);

  const app = await NestFactory.create(AppModule);

  // Tüm endpoint'ler `/api/v1` öneki altında (docs/03_API_CONTRACTS.md §1).
  app.setGlobalPrefix("api/v1");

  // Response envelope + domain exception eşlemesi (docs/03 §2, docs/04 §6).
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((error) => {
  console.error(
    "[bootstrap] Uygulama başlatılamadı:\n",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
