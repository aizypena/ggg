"use client";
import { useEffect, useRef, useState } from "react";
import { useTournamentEvents } from "@/hooks/use-tournament-events";

/** Convert a stroop string to human-readable decimal (7 decimal places). */
function fmt(stroops: string) {
  const n = BigInt(stroops);
  return `${n / 10_000_000n}.${(n % 10_000_000n).toString().padStart(7, "0")}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Live prize-pool counter. Seeds from the server snapshot (initialPool /
 * participantCount) then ticks up off the SSE stream: every confirmed
 * REGISTERED event advances the pool to its `poolAfter` (or, for SEP-7 deposits
 * with no poolAfter, by one entry fee). On an increase it pops scale(1.05)
 * unless the viewer prefers reduced motion (BRAND §6).
 */
export function PrizePoolCounter({
  tournamentId,
  initialPool,
  asset,
  participantCount,
  entryFee,
}: {
  tournamentId: string;
  initialPool: string;
  asset: "XLM" | "USDC";
  participantCount: number;
  entryFee: string;
}) {
  const { events } = useTournamentEvents(tournamentId);
  const [pool, setPool] = useState<bigint>(BigInt(initialPool));
  const [count, setCount] = useState(participantCount);
  const [pop, setPop] = useState(false);
  const seen = useRef(0);

  useEffect(() => {
    let next = pool;
    let added = 0;
    for (let i = seen.current; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.type !== "REGISTERED") continue;
      added += 1;
      const after = ev.data.poolAfter;
      next = typeof after === "string" ? BigInt(after) : next + BigInt(entryFee);
    }
    seen.current = events.length;
    if (added > 0) setCount((c) => c + added);
    if (next > pool) {
      setPool(next);
      if (!prefersReducedMotion()) {
        setPop(true);
        setTimeout(() => setPop(false), 200);
      }
    }
  }, [events, entryFee, pool]);

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
          style={{ transform: pop ? "scale(1.05)" : "scale(1)" }}
        >
          {fmt(pool.toString())}
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
