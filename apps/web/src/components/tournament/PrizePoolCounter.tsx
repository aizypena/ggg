"use client";
import { useEffect, useState } from "react";

/** Convert a stroop string to human-readable decimal (7 decimal places). */
function fmt(stroops: string) {
  const n = BigInt(stroops);
  return `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0")}`;
}

/**
 * Fetches the latest tournament detail from the REST endpoint.
 * POLLING FALLBACK — Phase 5 replaces this seam with an SSE source.
 * Isolate any data-source change here and in LiveFeed.
 */
async function fetchTournamentDetail(
  tournamentId: string,
): Promise<{ pool: string; participantCount: number } | null> {
  const r = await fetch(`/api/tournaments/${tournamentId}`).then((x) => x.json());
  if (r.ok) {
    return {
      pool: r.data.pool as string,
      participantCount: (r.data.participants as unknown[]).length,
    };
  }
  return null;
}

export function PrizePoolCounter({
  tournamentId,
  initialPool,
  asset,
  participantCount,
  entryFee,
  pollMs = 5000,
}: {
  tournamentId: string;
  initialPool: string;
  asset: "XLM" | "USDC";
  participantCount: number;
  entryFee: string;
  pollMs?: number;
}) {
  const [pool, setPool] = useState(initialPool);
  const [count, setCount] = useState(participantCount);

  // POLLING FALLBACK — Phase 5 swaps this setInterval for an SSE subscription.
  // To migrate: remove the useEffect below, subscribe to SSE events instead,
  // and call setPool / setCount from the event handler.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const data = await fetchTournamentDetail(tournamentId);
        if (data) {
          setPool(data.pool);
          setCount(data.participantCount);
        }
      } catch {
        // Keep showing the last good value on network failure.
      }
    }, pollMs);
    return () => clearInterval(id);
  }, [tournamentId, pollMs]);

  return (
    <div className="high-contrast-card acid-glow rounded-none p-8">
      <p className="label-caps text-on-surface-variant">Prize pool</p>
      <p className="mt-2 flex items-end gap-3">
        {/* aria-live="polite" so screen readers announce updates */}
        <span
          data-testid="pool-amount"
          aria-live="polite"
          aria-atomic="true"
          className="data-mono text-[96px] font-extrabold leading-none text-acid-yellow motion-safe:transition-transform"
        >
          {fmt(pool)}
        </span>
        <span className="label-caps mb-3 text-on-surface-variant">{asset}</span>
      </p>
      <div className="data-mono mt-4 flex gap-6 text-on-surface-variant">
        <span>{count} players</span>
        <span>
          entry {fmt(entryFee)} {asset}
        </span>
      </div>
    </div>
  );
}
