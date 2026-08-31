-- AlterTable
-- Additive: nullable kolon, mevcut watch-only satırları etkilenmez
-- (docs/02_DATABASE_SCHEMA.md §2.5, docs/mimari-kararlar.md SEC-006).
ALTER TABLE "wallets" ADD COLUMN "encrypted_private_key" TEXT;
