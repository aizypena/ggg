import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WinnersPanel } from "./WinnersPanel";

const winners = [
  {
    rank: 1,
    playerAddr: "GAAAAAAAAAAAAAAAAAAA",
    amount: "18000000",
    txHash: "P1",
    explorerUrl: "https://stellar.expert/tx/P1",
  },
  {
    rank: 2,
    playerAddr: "GBBBBBBBBBBBBBBBBBBB",
    amount: "9000000",
    txHash: "P2",
    explorerUrl: "https://stellar.expert/tx/P2",
  },
  {
    rank: 3,
    playerAddr: "GCCCCCCCCCCCCCCCCCCC",
    amount: "3000000",
    txHash: "P3",
    explorerUrl: null,
  },
];

describe("WinnersPanel", () => {
  it("renders three ranks with explorer links and mono amounts", () => {
    render(<WinnersPanel asset="XLM" winners={winners} />);
    // Three links — only winners with explorerUrl get them (ranks 1 & 2)
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("1.8000000 XLM")).toBeInTheDocument();
  });

  it("formats amounts as BigInt (no float rounding errors)", () => {
    render(<WinnersPanel asset="XLM" winners={winners} />);
    expect(screen.getByText("1.8000000 XLM")).toBeInTheDocument();
    expect(screen.getByText("0.9000000 XLM")).toBeInTheDocument();
    expect(screen.getByText("0.3000000 XLM")).toBeInTheDocument();
  });

  it("truncates addresses to first-6 ... last-6", () => {
    render(<WinnersPanel asset="XLM" winners={winners} />);
    // GAAAAAAAAAAAAAAAAAAA → GAAAAA…AAAAAA
    expect(screen.getByText("GAAAAA…AAAAAA")).toBeInTheDocument();
    expect(screen.getByText("GBBBBB…BBBBB" + "B")).toBeInTheDocument();
  });

  it("explorer links open in new tab with rel=noopener noreferrer", () => {
    render(<WinnersPanel asset="XLM" winners={winners} />);
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("explorer links point to the provided explorerUrl", () => {
    render(<WinnersPanel asset="XLM" winners={winners} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "https://stellar.expert/tx/P1");
    expect(links[1]).toHaveAttribute("href", "https://stellar.expert/tx/P2");
  });

  it("renders no link when explorerUrl is null", () => {
    const noLinkWinner = [
      {
        rank: 3,
        playerAddr: "GCCCCCCCCCCCCCCCCCCC",
        amount: "3000000",
        txHash: "P3",
        explorerUrl: null,
      },
    ];
    render(<WinnersPanel asset="XLM" winners={noLinkWinner} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders USDC asset label", () => {
    render(
      <WinnersPanel
        asset="USDC"
        winners={[
          {
            rank: 1,
            playerAddr: "GAAAAAAAAAAAAAAAAAAA",
            amount: "10000000",
            txHash: null,
            explorerUrl: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("1.0000000 USDC")).toBeInTheDocument();
  });

  it("explorer links have accessible names (not bare 'link')", () => {
    render(<WinnersPanel asset="XLM" winners={winners} />);
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      expect(link.getAttribute("aria-label")).toMatch(/rank \d+ transaction/i);
    });
  });
});
