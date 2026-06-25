import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PodiumSlot } from "./PodiumSlot";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("PodiumSlot", () => {
  it("uses role=group for the drop zone", () => {
    render(<PodiumSlot rank={1} addr={null} onAssign={() => {}} onClear={() => {}} />);
    expect(screen.getByRole("group")).toBeInTheDocument();
  });

  it("renders empty state for 1st place", () => {
    render(<PodiumSlot rank={1} addr={null} onAssign={() => {}} onClear={() => {}} />);
    expect(screen.getByText("1st")).toBeInTheDocument();
    expect(screen.getByText("drop a player")).toBeInTheDocument();
  });

  it("renders assigned address with remove button", () => {
    render(
      <PodiumSlot
        rank={2}
        addr="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        onAssign={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("2nd")).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === "GAAAAA…AAAWHF"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });
});
