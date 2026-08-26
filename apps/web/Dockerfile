# apps/web — Next.js. Build context repo köküdür (pnpm workspace bağımlılıkları için).
# Deploy edilmez (yalnızca lokal docker-compose); tek aşamalı, basit tutulur.
FROM node:22-slim

RUN corepack enable

WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@vault/web

WORKDIR /repo/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
