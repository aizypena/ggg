import { getContractPayments } from "./stellar";
import { applyEvent, type Change } from "./reconcile";

/**
 * Reconcile raw SEP-7 deposits to the contract address into registrations.
 * Deposits are untrusted until matched: only payments whose `memo` equals the
 * tournament id AND whose destination is the contract address become a
 * REGISTERED event. Idempotency is delegated to `applyEvent` (dedupe on the
 * payment's transaction hash), so a replay returns no new changes.
 */
export async function reconcileSep7Deposits(
  tournament: { id: string; contractId: string },
  hzCursor: string | null,
): Promise<{ changes: Change[]; nextCursor: string | null }> {
  const { payments, nextCursor } = await getContractPayments(tournament.contractId, hzCursor);
  const changes: Change[] = [];
  for (const p of payments) {
    if (p.memo !== tournament.id) continue;
    if (p.to !== tournament.contractId) continue;
    const change = await applyEvent(tournament, {
      type: "REGISTERED",
      ledger: 0,
      txHash: p.transaction_hash,
      data: { player: p.from, poolAfter: null, source: "sep7", amount: p.amount },
    });
    if (change) changes.push(change);
  }
  return { changes, nextCursor };
}
