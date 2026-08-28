import type { Prisma } from "@prisma/client";
import type { AuditRepository } from "./audit.repository";
import { AuditService } from "./audit.service";

/**
 * `AuditService.record()` yalnızca çağıranın transaction client'ını repository'ye
 * devreder — kendi transaction'ını AÇMAZ (`docs/04_BACKEND_SPEC.md` §7). Bu, tüm
 * sonraki audit yazımlarının temel kalıbıdır; regresyon olarak burada sabitlenir.
 */
describe("AuditService", () => {
  let repository: jest.Mocked<Pick<AuditRepository, "create">>;
  let service: AuditService;

  beforeEach(() => {
    repository = { create: jest.fn().mockResolvedValue(undefined) };
    service = new AuditService(repository as unknown as AuditRepository);
  });

  it("record() aldığı tx client'ı ve girdiyi olduğu gibi repository.create'e geçirir", async () => {
    const tx = { marker: "tx-client" } as unknown as Prisma.TransactionClient;

    await service.record(tx, {
      actorType: "admin",
      actorId: "99999999-9999-4999-8999-999999999999",
      action: "NETWORK_ASSET_DEACTIVATED",
      entityType: "network_asset",
      entityId: null,
      metadata: { networkId: "n1", assetId: "a1" },
    });

    expect(repository.create).toHaveBeenCalledWith(tx, {
      actorType: "admin",
      actorId: "99999999-9999-4999-8999-999999999999",
      action: "NETWORK_ASSET_DEACTIVATED",
      entityType: "network_asset",
      entityId: null,
      metadata: { networkId: "n1", assetId: "a1" },
    });
  });

  it("kendi transaction'ını açmaz — repository dışında bir çağrı yapmaz", async () => {
    const tx = {} as unknown as Prisma.TransactionClient;

    await service.record(tx, {
      actorType: "user",
      actorId: null,
      action: "LOGIN_FAILED",
      entityType: "user",
      entityId: null,
      metadata: { email: "x@vault.local" },
    });

    expect(repository.create).toHaveBeenCalledTimes(1);
  });
});
