# apps/api — NestJS. Build context repo köküdür (pnpm workspace bağımlılıkları için).
# Deploy edilmez (yalnızca lokal docker-compose); tek aşamalı, basit tutulur.
FROM node:22-slim

# Prisma'nın query engine binary'si libssl'e bağımlı; node:22-slim bunu içermez.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile
# node_modules .dockerignore'da hariç tutulur, bu yüzden client her image build'inde
# yeniden üretilmeli — aksi halde @prisma/client "generate" edilmemiş fallback'e düşer
# (bkz. .github/workflows/ci.yml aynı adım).
RUN pnpm --filter api exec prisma generate
RUN pnpm turbo run build --filter=@vault/api

WORKDIR /repo/apps/api

EXPOSE 3001

# Migration'lar deploy adımı olmadığı için burada, konteyner başlangıcında uygulanır
# (docs/09_DEV_WORKFLOW.md §6 adım 3 — geliştirici manuel migrate çalıştırmaz).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
