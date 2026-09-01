import type { Transfer } from "@prisma/client";
import type { TransferWithOwner } from "../transfers.repository";

/**
 * Ortak transfer test factory'si (`docs/08_TESTING_STRATEGY.md` §5,
 * `.claude/rules/30-testing.md` — "her domain için bir factory fonksiyonu").
 * İterasyon 1-5'in spec dosyalarında ayrı ayrı tanımlanan `transferRow()` /
 * `transferWithOwner()` yardımcıları burada tek yerde toplanır; İterasyon 8'in
 * terminal-durum matrisi ve negatif senaryo regresyon paketi de bunu kullanır.
 *
 * Yalnızca testlerde kullanılır — `tsconfig.build.json` `testing/` klasörünü
 * derlemeden hariç tutar.
 */

export const TEST_OWNER_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_OTHER_USER_ID = "10101010-1010-4101-8101-101010101010";
export const TEST_TRANSFER_ID = "99999999-9999-4999-8999-999999999999";
export const TEST_WALLET_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_NETWORK_ID = "33333333-3333-4333-8333-333333333333";
export const TEST_ASSET_ID = "44444444-4444-4444-8444-444444444444";
export const TEST_IDEMPOTENCY_KEY = "idem-key-1";

/** Geçerli EIP-55 checksum'lı Sepolia (EVM) adresi — cross-network guard happy path. */
export const TEST_EVM_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
/** Geçerli base58check Tron Shasta adresi — EVM cüzdana verildiğinde cross-network mismatch. */
export const TEST_TRON_ADDRESS = "TQ5NqPY1Eqe4B4hV1hVFCJmZ9dRmM6C7Gr";

/**
 * Bir `Transfer` satırı üretir; `overrides` ile herhangi bir alan (özellikle
 * `state`) değiştirilebilir — `createTestTransfer({ state: "confirmed" })`.
 */
export function createTestTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: TEST_TRANSFER_ID,
    walletId: TEST_WALLET_ID,
    networkId: TEST_NETWORK_ID,
    assetId: TEST_ASSET_ID,
    toAddress: TEST_EVM_ADDRESS,
    amount: "1000",
    state: "draft",
    txHash: null,
    failureReason: null,
    idempotencyKey: TEST_IDEMPOTENCY_KEY,
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    ...overrides,
  };
}

/**
 * `Transfer` + sahiplik (`wallet.user_id`) — `TransfersService.confirm` /
 * `deleteDraft` gibi `findByIdWithOwner` tüketen yollar için.
 */
export function createTestTransferWithOwner(
  overrides: Partial<Transfer> = {},
  ownerId: string = TEST_OWNER_ID,
): TransferWithOwner {
  return { ...createTestTransfer(overrides), wallet: { userId: ownerId } };
}
