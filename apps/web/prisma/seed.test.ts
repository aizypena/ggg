import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seeded admin", () => {
  it("exactly one ADMIN exists for the seeded username", async () => {
    const username = process.env.ADMIN_USERNAME ?? "admin";
    const admins = await prisma.user.findMany({ where: { role: Role.ADMIN } });
    expect(admins.length).toBeGreaterThanOrEqual(1);
    const seeded = admins.find((u) => u.username === username);
    expect(seeded).toBeDefined();
    expect(seeded?.passwordHash.startsWith("$argon2id$")).toBe(true);
  });
});
