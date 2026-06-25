// SERVER COMPONENT — no "use client" directive.
// Pure server render from props; derives refund rows for a cancelled tournament.

type Participant = { playerAddr: string; joinedAt: string };

/** Convert a stroop string to a human-readable decimal (7 dp). */
function fmt(stroops: string): string {
  const n = BigInt(stroops);
  return `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0")}`;
}

function trunc(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

/**
 * RefundList — on `cancel_tournament` the contract refunds every joined player
 * their entry fee (SPEC §6). The `cancelled` event only carries a refund count,
 * so the per-player refund rows are derived from the known participants × the
 * entry fee — one `refund-row` per refunded player, each equal to the entry fee.
 */
export function RefundList({
  participants,
  entryFee,
  asset,
}: {
  participants: Participant[];
  entryFee: string;
  asset: "XLM" | "USDC";
}) {
  if (participants.length === 0) {
    return (
      <p className="mt-4 text-sm text-on-surface-variant">
        No players had joined, so no refunds were issued.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="label-caps text-error">Refunds issued ({participants.length})</p>
      <ul className="mt-3 flex flex-col gap-2" aria-label="Refunds">
        {participants.map((p) => (
          <li
            key={p.playerAddr}
            data-testid="refund-row"
            className="flex items-center justify-between gap-4"
          >
            <span className="data-mono text-on-surface">{trunc(p.playerAddr)}</span>
            <span className="data-mono text-error">
              {fmt(entryFee)} {asset}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
