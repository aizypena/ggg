import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

class FakeES {
  static instances: FakeES[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeES.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

afterEach(() => {
  vi.useRealTimers();
  FakeES.instances = [];
});

(globalThis as unknown as { EventSource: unknown }).EventSource = FakeES;

import { useTournamentEvents } from "./use-tournament-events";

describe("useTournamentEvents", () => {
  it("parses incoming SSE messages", () => {
    const { result } = renderHook(() => useTournamentEvents("t1"));
    act(() =>
      FakeES.instances[0]!.emit({ type: "REGISTERED", txHash: "tx1", data: { player: "GA" } }),
    );
    expect(result.current.events.at(-1)).toMatchObject({ type: "REGISTERED", txHash: "tx1" });
  });

  it("reconnects on error", () => {
    vi.useFakeTimers();
    renderHook(() => useTournamentEvents("t1"));
    act(() => {
      FakeES.instances[0]!.onerror?.(new Event("error"));
      vi.advanceTimersByTime(3000);
    });
    expect(FakeES.instances.length).toBe(2);
  });
});
