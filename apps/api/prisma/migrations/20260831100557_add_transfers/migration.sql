-- CreateEnum
CREATE TYPE "transfer_state" AS ENUM ('draft', 'pending_signature', 'signed', 'broadcast', 'confirming', 'confirmed', 'failed', 'dropped');

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "to_address" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "state" "transfer_state" NOT NULL DEFAULT 'draft',
    "tx_hash" TEXT,
    "failure_reason" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_state_events" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "from_state" "transfer_state",
    "to_state" "transfer_state" NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "transfer_state_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transfers_wallet_id_idx" ON "transfers"("wallet_id");

-- CreateIndex
CREATE INDEX "transfers_state_idx" ON "transfers"("state");

-- CreateIndex
CREATE INDEX "transfers_tx_hash_idx" ON "transfers"("tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_wallet_id_idempotency_key_key" ON "transfers"("wallet_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "transfer_state_events_transfer_id_idx" ON "transfer_state_events"("transfer_id");

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_state_events" ADD CONSTRAINT "transfer_state_events_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
