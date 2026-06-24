import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/wallet", () => ({
  signAndSubmit: vi.fn(async () => ({ txHash: "TX", status: "CANCELLED" })),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CancelButton } from "./CancelButton";
import { signAndSubmit } from "@/lib/wallet";

const mockedSignAndSubmit = signAndSubmit as ReturnType<typeof vi.fn>;

describe("CancelButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSignAndSubmit.mockResolvedValue({ txHash: "TX", status: "CANCELLED" });
    refresh.mockReset();
  });

  it("shows the Cancel & Refund button initially", () => {
    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    expect(screen.getByRole("button", { name: /cancel & refund/i })).toBeInTheDocument();
  });

  it("shows a confirm step before cancelling (not irreversible by default)", () => {
    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel & refund/i }));
    // Confirm dialog appears
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/irreversible/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
    // signAndSubmit must NOT have been called yet
    expect(mockedSignAndSubmit).not.toHaveBeenCalled();
  });

  it("dismisses the confirm dialog on Go Back", () => {
    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel & refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: /cancel & refund/i })).toBeInTheDocument();
  });

  it("builds + signs + submits cancel then refreshes on confirm", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: true, data: { unsignedXdr: "CU", network: "testnet" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel & refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));

    await waitFor(() =>
      expect(mockedSignAndSubmit).toHaveBeenCalledWith(
        "CU",
        "cancel",
        "/api/tournaments/t_1/submit",
        "P",
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("POSTs to /api/tournaments/[id]/cancel with no body", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, data: { unsignedXdr: "CU", network: "testnet" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel & refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/tournaments/t_1/cancel");
    expect(init.method).toBe("POST");
    // No body required
    expect(init.body).toBeUndefined();
  });

  it("shows error and does not refresh on { ok: false } from /cancel (e.g. 403)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, error: "Not the organiser" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel & refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Not the organiser"));
    expect(mockedSignAndSubmit).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows error and does not refresh on { ok: false } 409 wrong state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, error: "Wrong tournament state" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel & refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Wrong tournament state"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("confirm buttons are disabled while pending", async () => {
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(<CancelButton tournamentId="t_1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /cancel & refund/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    // Resolve to clean up
    resolveFetch(
      new Response(JSON.stringify({ ok: false, error: "cancelled" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
  });
});
