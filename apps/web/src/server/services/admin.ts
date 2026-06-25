import { prisma } from "@/lib/db";

export async function getAdminOverview() {
  const [userCount, grouped, users] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const byStatus: Record<string, number> = {
    DRAFT: 0,
    ACTIVE: 0,
    FINISHED: 0,
    CANCELLED: 0,
  };
  for (const g of grouped) byStatus[g.status] = g._count._all;

  return {
    userCount,
    byStatus,
    users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  };
}
