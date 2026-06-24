import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TournamentListRow } from "./TournamentListRow";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("TournamentListRow", () => {
  it("shows name, status chip, mono pool and participant count, linking to detail", () => {
    render(
      <TournamentListRow
        t={{
          id: "t_1",
          name: "Cup",
          gameTitle: "SF6",
          status: "ACTIVE",
          asset: "XLM",
          entryFee: "10000000",
          pool: "30000000",
          participantCount: 3,
        }}
      />,
    );

    expect(screen.getByText("Cup")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    const pool = screen.getByText(/3\.0000000 XLM/);
    expect(pool).toHaveClass("data-mono");

    expect(screen.getByRole("link")).toHaveAttribute("href", "/tournaments/t_1");
  });

  it("formats pool correctly for zero amount", () => {
    render(
      <TournamentListRow
        t={{
          id: "t_2",
          name: "Empty Cup",
          gameTitle: "SF6",
          status: "DRAFT",
          asset: "USDC",
          entryFee: "0",
          pool: "0",
          participantCount: 0,
        }}
      />,
    );

    expect(screen.getByText(/0\.0000000 USDC/)).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("shows the game title with label-caps", () => {
    render(
      <TournamentListRow
        t={{
          id: "t_3",
          name: "Pro League",
          gameTitle: "Tekken 8",
          status: "FINISHED",
          asset: "XLM",
          entryFee: "5000000",
          pool: "50000000",
          participantCount: 10,
        }}
      />,
    );

    const gameTitle = screen.getByText("Tekken 8");
    expect(gameTitle).toHaveClass("label-caps");
  });
});
