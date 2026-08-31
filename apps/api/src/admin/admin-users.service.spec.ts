import { Test } from "@nestjs/testing";
import type { UserRole } from "@prisma/client";
import { AdminUsersRepository } from "./admin-users.repository";
import { AdminUsersService } from "./admin-users.service";

const ROWS = [
  {
    id: "u1",
    email: "demo@vault.local",
    role: "user" as UserRole,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  },
  {
    id: "u2",
    email: "admin@vault.local",
    role: "admin" as UserRole,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
  },
];

describe("AdminUsersService", () => {
  let service: AdminUsersService;
  let search: jest.Mock;

  beforeEach(async () => {
    search = jest
      .fn()
      .mockResolvedValue({ items: ROWS, totalItems: ROWS.length });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: AdminUsersRepository, useValue: { search } },
      ],
    }).compile();

    service = moduleRef.get(AdminUsersService);
  });

  it("email filtresi verilmezse repository'ye email: undefined geçer", async () => {
    await service.search({ page: 1, pageSize: 20 });

    expect(search).toHaveBeenCalledWith({
      email: undefined,
      page: 1,
      pageSize: 20,
    });
  });

  it("email filtresini repository'ye aynen geçirir (kısmi/case-insensitive eşleşme repository'de)", async () => {
    await service.search({ email: "demo", page: 2, pageSize: 10 });

    expect(search).toHaveBeenCalledWith({ email: "demo", page: 2, pageSize: 10 });
  });

  it("yanıt satırları yalnızca id/email/role/createdAt taşır — password_hash yok", async () => {
    const result = await service.search({ page: 1, pageSize: 20 });

    expect(result.data).toEqual([
      {
        id: "u1",
        email: "demo@vault.local",
        role: "user",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "u2",
        email: "admin@vault.local",
        role: "admin",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    for (const row of result.data) {
      expect(Object.keys(row).sort()).toEqual([
        "createdAt",
        "email",
        "id",
        "role",
      ]);
      expect(row).not.toHaveProperty("passwordHash");
    }
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 2,
      totalPages: 1,
    });
  });
});
