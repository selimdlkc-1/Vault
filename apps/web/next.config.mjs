/** @type {import('next').NextConfig} */

// Tarayıcı yalnızca `apps/web` origin'iyle (http://localhost:3000) konuşur;
// `/api/v1/*` istekleri Next tarafından `apps/api`'ye proxy'lenir. Böylece
// refresh cookie'si (httpOnly, SameSite=Strict) birinci-taraf kalır ve
// backend'de ayrı bir CORS yapılandırması gerekmez (docs/05 §4, docs/03 §4).
// Docker Compose'da hedef `http://api:3001`, lokal `pnpm dev`'de `http://localhost:3001`.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3001";

const nextConfig = {
  transpilePackages: ["@vault/types"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
