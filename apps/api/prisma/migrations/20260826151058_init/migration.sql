-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "chain_type" AS ENUM ('evm', 'tron');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "networks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "chain_type" "chain_type" NOT NULL,
    "chain_id" TEXT NOT NULL,
    "confirmation_threshold" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "contract_address" TEXT,
    "coingecko_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_assets" (
    "network_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TIMESTAMPTZ,

    CONSTRAINT "network_assets_pkey" PRIMARY KEY ("network_id","asset_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "networks_chain_id_key" ON "networks"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_network_id_symbol_key" ON "assets"("network_id", "symbol");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_assets" ADD CONSTRAINT "network_assets_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_assets" ADD CONSTRAINT "network_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
