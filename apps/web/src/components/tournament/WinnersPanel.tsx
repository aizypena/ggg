type Winner = {
  rank: number;
  playerAddr: string;
  amount: string;
  txHash: string | null;
  explorerUrl: string | null;
};

/** Convert a stroop string to human-readable decimal (7 decimal places). */
function fmt(stroops: string): string {
  const n = BigInt(stroops);
  return `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0")}`;
}

const medalIcon = ["military_tech", "workspace_premium", "stars"] as const;

export function WinnersPanel({ winners, asset }: { winners: Winner[]; asset: "XLM" | "USDC" }) {
  return (
    <div className="brutalist-border brutalist-border-active rounded-none p-6">
      <p className="label-caps italic text-acid-yellow">Settlement Complete</p>
      <ul className="mt-4 flex flex-col gap-3" aria-label="Tournament winners">
        {winners.map((w) => (
          <li key={w.rank} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-3">
              <span
                className="material-symbols-outlined text-acid-yellow"
                aria-label={`Rank ${w.rank}`}
              >
                {medalIcon[w.rank - 1] ?? "emoji_events"}
              </span>
              <span className="data-mono text-on-surface">
                {w.playerAddr.slice(0, 6)}…{w.playerAddr.slice(-6)}
              </span>
            </span>
            <span className="flex items-center gap-4">
              <span className="data-mono text-acid-yellow">
                {fmt(w.amount)} {asset}
              </span>
              {w.explorerUrl && (
                <a
                  href={w.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="label-caps text-electric-violet underline"
                  aria-label={`View rank ${w.rank} transaction on explorer`}
                >
                  Explorer
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
