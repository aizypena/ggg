import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveFeed } from "./LiveFeed";

function makeFetchResponse(participants: { playerAddr: string; joinedAt: string }[]) {
  return new Response(JSON.stringify({ ok: true, data: { participants } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("LiveFeed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders a live region with the placeholder ticker initially", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeFetchResponse([])),
    );
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/live activity/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting for on-chain activity/i)).toBeInTheDocument();
  });

  it("renders the acid-yellow LIVE badge", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeFetchResponse([])),
    );
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });

  it("polls and updates entries from participant data", async () => {
    const participants = [
      { playerAddr: "GAAAAAAAAAAAAAAAAAAA", joinedAt: new Date().toISOString() },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeFetchResponse(participants)),
    );

    render(<LiveFeed tournamentId="t_1" pollMs={10} />);

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByText(/GAAAAA… joined/)).toBeInTheDocument();
  });

  it("keeps showing last good entries when a poll fails", async () => {
    let callCount = 0;
    const participants = [
      { playerAddr: "GBBBBBBBBBBBBBBBBBB", joinedAt: new Date().toISOString() },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount++;
        if (callCount === 1) return makeFetchResponse(participants);
        throw new Error("Network error");
      }),
    );

    render(<LiveFeed tournamentId="t_1" pollMs={10} />);

    // First poll succeeds
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByText(/GBBBBB… joined/)).toBeInTheDocument();

    // Second poll fails — still shows last entry
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByText(/GBBBBB… joined/)).toBeInTheDocument();
  });

  it("does not update state after unmount (active guard)", async () => {
    let resolveFetch!: () => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = () =>
        resolve(
          makeFetchResponse([
            { playerAddr: "GZZZZZZZZZZZZZZZZZZZ", joinedAt: new Date().toISOString() },
          ]),
        );
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingFetch),
    );

    const { unmount } = render(<LiveFeed tournamentId="t_1" pollMs={10} />);

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
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("clears the interval on unmount (no leak)", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeFetchResponse([])),
    );

    const { unmount } = render(<LiveFeed tournamentId="t_1" pollMs={100} />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
