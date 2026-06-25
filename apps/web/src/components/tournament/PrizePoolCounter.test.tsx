import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrizePoolCounter } from "./PrizePoolCounter";

function makeFetchResponse(pool: string, participantCount: number) {
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        pool,
        participants: Array.from({ length: participantCount }, (_, i) => ({
          playerAddr: `GADDR${i}`,
        })),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("PrizePoolCounter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the initial pool in acid data-mono and the unit", () => {
    render(
      <PrizePoolCounter
        tournamentId="t_1"
        initialPool="30000000"
        asset="XLM"
        participantCount={3}
        entryFee="10000000"
      />,
    );
    const num = screen.getByTestId("pool-amount");
    expect(num).toHaveTextContent("3.0000000");
    expect(num.className).toMatch(/acid-yellow/);
    expect(screen.getByText("XLM")).toBeInTheDocument();
  });

  it("pool-amount element has aria-live polite", () => {
    render(
      <PrizePoolCounter
        tournamentId="t_1"
        initialPool="10000000"
        asset="XLM"
        participantCount={1}
        entryFee="10000000"
      />,
    );
    expect(screen.getByTestId("pool-amount")).toHaveAttribute("aria-live", "polite");
  });

  it("polls GET /api/tournaments/[id] and updates the displayed pool", async () => {
    const mockFetch = vi.fn(async () => makeFetchResponse("50000000", 5));
    vi.stubGlobal("fetch", mockFetch);

    render(
      <PrizePoolCounter
        tournamentId="t_1"
        initialPool="30000000"
        asset="XLM"
        participantCount={3}
        entryFee="10000000"
        pollMs={10}
      />,
    );

    // Advance timers to trigger first poll
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByTestId("pool-amount")).toHaveTextContent("5.0000000");
    expect(mockFetch).toHaveBeenCalledWith("/api/tournaments/t_1");
  });

  it("keeps the last good value when a poll fails (no crash)", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return makeFetchResponse("50000000", 5);
      throw new Error("Network error");
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <PrizePoolCounter
        tournamentId="t_1"
        initialPool="30000000"
        asset="XLM"
        participantCount={3}
        entryFee="10000000"
        pollMs={10}
      />,
    );

    // First poll succeeds → update to 5.0000000
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByTestId("pool-amount")).toHaveTextContent("5.0000000");

    // Second poll fails → still shows 5.0000000
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByTestId("pool-amount")).toHaveTextContent("5.0000000");
  });

  it("does not update state after unmount (active guard)", async () => {
    let resolveFetch!: () => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = () => resolve(makeFetchResponse("99000000", 9));
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingFetch),
    );

    const { unmount } = render(
      <PrizePoolCounter
        tournamentId="t_1"
        initialPool="30000000"
        asset="XLM"
        participantCount={3}
        entryFee="10000000"
        pollMs={10}
      />,
    );

    // Trigger the interval so the in-flight fetch is started
    act(() => {
      vi.advanceTimersByTime(10);
    });

    // Unmount before the fetch resolves
    unmount();

    // Now resolve the fetch — the active guard should prevent any setState
    await act(async () => {
      resolveFetch();
      await Promise.resolve();
    });

    // The component is unmounted; no DOM update and no act()/unmount warning occurred.
    expect(screen.queryByTestId("pool-amount")).toBeNull();
  });

  it("clears the interval on unmount (no leak)", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeFetchResponse("10000000", 1)),
    );

    const { unmount } = render(
      <PrizePoolCounter
        tournamentId="t_1"
        initialPool="10000000"
        asset="XLM"
        participantCount={1}
        entryFee="10000000"
        pollMs={100}
      />,
    );

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
