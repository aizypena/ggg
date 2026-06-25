import { prisma } from "./db";

export interface Cursor {
  ledger: number;
  hzCursor: string | null;
}

export async function getCursor(contractId: string): Promise<Cursor> {
  const row = await prisma.subscriberCursor.findUnique({ where: { contractId } });
  return row ? { ledger: row.ledger, hzCursor: row.hzCursor } : { ledger: 0, hzCursor: null };
}

export async function setCursor(
  contractId: string,
  ledger: number,
  hzCursor?: string,
): Promise<void> {
  // A bare `setCursor(id, ledger)` advances only the ledger and preserves the
  // stored Horizon paging token; passing `hzCursor` updates both.
  const update = hzCursor === undefined ? { ledger } : { ledger, hzCursor };
  await prisma.subscriberCursor.upsert({
    where: { contractId },
    create: { contractId, ledger, hzCursor: hzCursor ?? null },
    update,
  });
}
