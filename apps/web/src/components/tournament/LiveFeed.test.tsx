import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LiveEvent } from "@/hooks/use-tournament-events";

const { useTournamentEvents } = vi.hoisted(() => ({
  useTournamentEvents: vi.fn<(id: string) => { events: LiveEvent[] }>(),
}));
vi.mock("@/hooks/use-tournament-events", () => ({ useTournamentEvents }));

import { LiveFeed } from "./LiveFeed";

beforeEach(() => {
  useTournamentEvents.mockReturnValue({ events: [] });
});

describe("LiveFeed", () => {
  it("renders a live region with the LIVE badge and empty placeholder", () => {
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText(/live activity/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting for on-chain activity/i)).toBeInTheDocument();
  });

  it("renders registration + finalisation rows with human-readable gloss", () => {
    useTournamentEvents.mockReturnValue({
      events: [
        {
          type: "REGISTERED",
          txHash: "tx1",
          data: { player: "GABCDEFGHIJKLMNOP", poolAfter: "20000000" },
        },
        {
          type: "FINALIZED",
          txHash: "tx2",
          data: { first: "GA", second: "GB", third: "GC", amounts: ["12", "6", "2"] },
        },
      ],
    });
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByText(/joined/i)).toBeInTheDocument();
    expect(screen.getByText(/Payouts sent/i)).toBeInTheDocument();
    expect(screen.getByText(/GABCDE…MNOP/)).toBeInTheDocument(); // truncated mono addr
  });

  it("glosses a cancellation with the refunded count", () => {
    useTournamentEvents.mockReturnValue({
      events: [{ type: "CANCELLED", txHash: "tx3", data: { refundedCount: 4 } }],
    });
    render(<LiveFeed tournamentId="t_1" />);
    expect(screen.getByText(/cancelled — 4 players refunded/i)).toBeInTheDocument();
  });
});
