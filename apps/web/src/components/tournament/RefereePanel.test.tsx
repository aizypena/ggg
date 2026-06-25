import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE"),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { RefereePanel } from "./RefereePanel";
import { ensureWallet } from "@/lib/wallet";

const REF = "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE";

describe("RefereePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ensureWallet as ReturnType<typeof vi.fn>).mockResolvedValue(REF);
  });

  it("shows verify button and no settle link initially", () => {
    render(<RefereePanel tournamentId="t_1" refereeAddr={REF} passphrase="P" />);
    expect(screen.getByRole("button", { name: /verify referee/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settlement console/i })).toBeNull();
  });

  it("reveals the settle link only when connected wallet matches refereeAddr", async () => {
    render(<RefereePanel tournamentId="t_1" refereeAddr={REF} passphrase="P" />);
    expect(screen.queryByRole("link", { name: /settlement console/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /verify referee/i }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /settlement console/i })).toHaveAttribute(
        "href",
        "/tournaments/t_1/settle",
      ),
    );
  });

  it("shows a mismatch message for a non-referee wallet", async () => {
    (ensureWallet as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      "GOTHEROTHEROTHEROTHEROTHEROTHEROTHEROTHEROTHEROTHEROTHER",
    );
    render(<RefereePanel tournamentId="t_1" refereeAddr={REF} passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /verify referee/i }));
    await waitFor(() => expect(screen.getByText(/not the referee/i)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /settlement console/i })).toBeNull();
  });

  it("mismatch message has role=alert for screen readers", async () => {
    (ensureWallet as ReturnType<typeof vi.fn>).mockResolvedValueOnce("GWRONG");
    render(<RefereePanel tournamentId="t_1" refereeAddr={REF} passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /verify referee/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("shows error message when ensureWallet throws", async () => {
    (ensureWallet as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Freighter not installed"),
    );
    render(<RefereePanel tournamentId="t_1" refereeAddr={REF} passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /verify referee/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/failed to connect wallet/i),
    );
  });

  it("does not reveal settle link for a near-miss address (case-sensitive)", async () => {
    // Lower-case version — Stellar addresses are always uppercase, but test the exact-match rule
    (ensureWallet as ReturnType<typeof vi.fn>).mockResolvedValueOnce(REF.toLowerCase());
    render(<RefereePanel tournamentId="t_1" refereeAddr={REF} passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /verify referee/i }));
    await waitFor(() => expect(screen.getByText(/not the referee/i)).toBeInTheDocument());
  });
});
