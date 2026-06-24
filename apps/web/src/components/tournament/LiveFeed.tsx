"use client";
import { useEffect, useState } from "react";

type FeedEntry = { id: string; text: string };

/**
 * Fetches recent participant activity from the REST endpoint.
 * POLLING PLACEHOLDER — Phase 5 swaps this seam for SSE GET /api/tournaments/[id]/events.
 * To migrate: remove the setInterval below and subscribe to the SSE stream instead.
 */
async function fetchActivity(tournamentId: string): Promise<FeedEntry[] | null> {
  const r = await fetch(`/api/tournaments/${tournamentId}`).then((x) => x.json());
  if (r.ok) {
    return (r.data.participants as { playerAddr: string }[]).map((p) => ({
      id: p.playerAddr,
      text: `${p.playerAddr.slice(0, 6)}… joined`,
    }));
  }
  return null;
}

export function LiveFeed({
  tournamentId,
  pollMs = 5000,
}: {
  tournamentId: string;
  pollMs?: number;
}) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);

  // POLLING PLACEHOLDER — Phase 5 replaces setInterval with SSE subscription.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const data = await fetchActivity(tournamentId);
        if (data) setEntries(data);
      } catch {
        // Keep showing the last good value on network failure.
      }
    }, pollMs);
    return () => clearInterval(id);
  }, [tournamentId, pollMs]);

  return (
    <section className="kinetic-glass rounded-2xl p-6">
      <div className="flex items-center gap-3">
        {/* acid-yellow LIVE badge */}
        <span
          className="label-caps rounded-sm bg-acid-yellow px-2 py-0.5 text-surface motion-safe:animate-pulse motion-reduce:animate-none"
          aria-label="Live"
        >
          LIVE
        </span>
        <p className="label-caps text-on-surface-variant">Live activity</p>
      </div>
      {/* aria-live="polite" + role="log" so assistive tech announces new entries */}
      <div
        role="log"
        aria-live="polite"
        aria-atomic="false"
        className="mt-4 max-h-80 overflow-hidden"
      >
        <ul className="motion-safe:animate-[ticker-scroll_30s_linear_infinite] motion-reduce:animate-none">
          {entries.length === 0 ? (
            <li className="data-mono text-on-surface-variant">Waiting for on-chain activity…</li>
          ) : (
            entries.map((e) => (
              <li key={e.id} className="data-mono py-1 text-on-surface">
                {e.text}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
