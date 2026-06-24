import "dotenv/config";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set to seed the database");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set to seed the admin user");
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { username },
    update: { role: Role.ADMIN },
    create: { username, passwordHash, role: Role.ADMIN },
  });

  console.log(`Seeded admin user "${username}" (idempotent upsert).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
