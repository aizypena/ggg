"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface LiveEvent {
  type: "REGISTERED" | "FINALIZED" | "CANCELLED";
  txHash: string | null;
  data: Record<string, unknown>;
}

/**
 * Subscribe to the tournament SSE stream (GET /api/tournaments/[id]/events).
 * Surfaces every parsed event (replayed history first, then live) and
 * transparently reconnects with a fixed backoff on error. The stream emits only
 * confirmed, ContractEvent-backed payloads — never optimistic UI state.
 */
export function useTournamentEvents(tournamentId: string): { events: LiveEvent[] } {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const es = new EventSource(`/api/tournaments/${tournamentId}/events`);
    esRef.current = es;
    es.onmessage = (e: MessageEvent) => {
      try {
        setEvents((prev) => [...prev, JSON.parse(e.data) as LiveEvent]);
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      es.close();
      retry.current = setTimeout(connect, 3000);
    };
  }, [tournamentId]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (retry.current) clearTimeout(retry.current);
    };
  }, [connect]);

  return { events };
}
