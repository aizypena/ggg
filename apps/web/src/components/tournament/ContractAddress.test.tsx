import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContractAddress } from "./ContractAddress";

const FULL_ADDRESS = "CDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";
// truncate(FULL_ADDRESS) = "CDEEEE…EEEEEE" (slice(0,6)=CDEEEE, slice(-6)=EEEEEE)
const TRUNCATED = "CDEEEE…EEEEEE";

describe("ContractAddress", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
  });

  it("renders a copy button with data-mono class", () => {
    render(<ContractAddress value={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toMatch(/data-mono/);
  });

  it("truncates a long contract address", () => {
    render(<ContractAddress value={FULL_ADDRESS} />);
    // Full address should not be visible
    expect(screen.queryByText(FULL_ADDRESS)).not.toBeInTheDocument();
    // Shows truncated form: first 6 chars + ellipsis + last 6 chars
    expect(screen.getByText(TRUNCATED)).toBeInTheDocument();
  });

  it("does not truncate a short address", () => {
    render(<ContractAddress value="CDSHORT" />);
    expect(screen.getByText("CDSHORT")).toBeInTheDocument();
  });

  it("copies the full value to clipboard on click", async () => {
    render(<ContractAddress value={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(FULL_ADDRESS));
  });

  it("shows 'Copied!' feedback after successful copy", async () => {
    render(<ContractAddress value={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText("Copied!")).toBeInTheDocument());
  });

  it("sets aria-label with the full address for accessibility", () => {
    render(<ContractAddress value={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy address/i });
    expect(btn).toHaveAttribute("aria-label", `Copy address ${FULL_ADDRESS}`);
  });
});
