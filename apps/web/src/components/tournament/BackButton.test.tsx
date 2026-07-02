import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mockBack,
  }),
}));

import { BackButton } from "./BackButton";

describe("BackButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a button with 'Back' text", () => {
    render(<BackButton />);
    const button = screen.getByRole("button", { name: /back/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Back");
  });

  it("renders the ArrowLeft icon", () => {
    render(<BackButton />);
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("lucide-arrow-left");
  });

  it("calls router.back() when clicked", () => {
    render(<BackButton />);
    const button = screen.getByRole("button", { name: /back/i });
    fireEvent.click(button);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("has the correct styling classes", () => {
    render(<BackButton />);
    const button = screen.getByRole("button", { name: /back/i });
    expect(button).toHaveClass(
      "inline-flex",
      "items-center",
      "gap-2",
      "text-sm",
      "font-medium",
      "text-on-surface-variant",
      "hover:text-on-surface",
      "transition-colors",
    );
  });

  it("has an aria-label for accessibility", () => {
    render(<BackButton />);
    const button = screen.getByRole("button", { name: /back/i });
    expect(button).toHaveAttribute("aria-label", "Go back");
  });

  it("does not navigate when not clicked", () => {
    render(<BackButton />);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("handles multiple clicks correctly", () => {
    render(<BackButton />);
    const button = screen.getByRole("button", { name: /back/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mockBack).toHaveBeenCalledTimes(3);
  });
});
