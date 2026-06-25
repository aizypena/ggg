import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "web/src/generated/prisma/client";
import { env } from "./env";

// The subscriber shares the Prisma schema/types with apps/web through the
// monorepo: the client is generated into apps/web (gitignored) by
// `pnpm --filter web prisma generate`. We reuse it via a relative import rather
// than regenerating a second client.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
