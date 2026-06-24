import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GABCDEFGHIJABCDEFGHIJ"),
}));

import { WalletButton } from "./WalletButton";
import { ensureWallet } from "@/lib/wallet";

const mockedEnsureWallet = ensureWallet as ReturnType<typeof vi.fn>;

describe("WalletButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnsureWallet.mockResolvedValue("GABCDEFGHIJABCDEFGHIJ");
  });

  it("renders 'Connect Wallet' button with label-caps class initially", () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    const btn = screen.getByRole("button", { name: /connect wallet/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass("label-caps");
  });

  it("calls ensureWallet with the provided expectedPassphrase on click", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="Test Network" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(mockedEnsureWallet).toHaveBeenCalledWith("Test Network"));
  });

  it("calls onConnected with the returned address on success", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith("GABCDEFGHIJABCDEFGHIJ"));
  });

  it("shows a truncated acid wallet chip after successful connection", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    // GABCDEFGHIJABCDEFGHIJ → slice(0,6)=GABCDE, slice(-5)=FGHIJ
    await waitFor(() => expect(screen.getByText(/GABCDE…FGHIJ/)).toBeInTheDocument());
  });

  it("shows an error message when ensureWallet throws", async () => {
    const onConnected = vi.fn();
    mockedEnsureWallet.mockRejectedValueOnce(new Error("Freighter not installed"));
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Freighter not installed"),
    );
    expect(onConnected).not.toHaveBeenCalled();
  });

  it("does not show connect button after address is set", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /connect wallet/i })).not.toBeInTheDocument(),
    );
  });
});
