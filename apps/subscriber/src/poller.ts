import { getEvents, decodeScVal } from "./stellar";
import { getCursor, setCursor } from "./cursor";
import { applyEvent, type DecodedEvent, type EventType, type Change } from "./reconcile";
import { reconcileSep7Deposits } from "./horizon-sep7";
import { publishChange } from "./publish";

const TOPIC_TO_TYPE: Record<string, EventType> = {
  registered: "REGISTERED",
  finalized: "FINALIZED",
  cancelled: "CANCELLED",
};

function decodeEvent(raw: {
  ledger: number;
  txHash: string;
  topic: string[];
  value: string;
}): DecodedEvent | null {
  const symbol = String(decodeScVal(raw.topic[0]!));
  const type = TOPIC_TO_TYPE[symbol];
  if (!type) return null;
  const value = decodeScVal(raw.value) as unknown;
  let data: Record<string, unknown>;
  if (type === "REGISTERED") {
    const [player, poolAfter] = value as [string, bigint];
    data = { player, poolAfter: poolAfter.toString() };
  } else if (type === "FINALIZED") {
    const [first, second, third, amounts] = value as [string, string, string, bigint[]];
    data = { first, second, third, amounts: amounts.map((a) => a.toString()) };
  } else {
    const refundedCount = Number(value as bigint | number);
    data = { refundedCount };
  }
  return { type, ledger: raw.ledger, txHash: raw.txHash, data };
}

/**
 * Poll one tournament: read its cursor, ingest new Soroban events and SEP-7
 * deposits idempotently, publish each confirmed change, then advance the
 * cursor. At-least-once: the cursor only moves after a successful ingest+publish
 * pass, so a crash mid-poll replays the ledger range without double-writing
 * (dedupe on txHash in `applyEvent`).
 */
export async function pollTournament(tournament: {
  id: string;
  contractId: string;
}): Promise<Change[]> {
  const cursor = await getCursor(tournament.contractId);
  const changes: Change[] = [];

  const res = await getEvents(tournament.contractId, cursor.ledger + 1);
  for (const raw of res.events) {
    const decoded = decodeEvent(raw);
    if (!decoded) continue;
    const change = await applyEvent(tournament, decoded);
    if (change) {
      await publishChange(tournament.id, change);
      changes.push(change);
    }
  }

  const sep7 = await reconcileSep7Deposits(tournament, cursor.hzCursor);
  for (const change of sep7.changes) {
    await publishChange(tournament.id, change);
    changes.push(change);
  }

  await setCursor(tournament.contractId, res.latestLedger + 1, sep7.nextCursor ?? undefined);
  return changes;
}
