import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/env", () => ({
  env: { SESSION_SECRET: "x".repeat(40), APP_URL: "http://localhost:3000" },
}));

const revokeSessionMock = vi.fn();
vi.mock("@/lib/session-store", () => ({
  createSession: vi.fn(),
  newSessionId: () => "sid-fixed",
  revokeSession: (...args: unknown[]) => revokeSessionMock(...args),
}));

import { onSignOutRevoke } from "./auth";

beforeEach(() => {
  revokeSessionMock.mockReset();
});

describe("onSignOutRevoke", () => {
  it("calls revokeSession when both id and sid are present", async () => {
    await onSignOutRevoke({ token: { id: "u1", sid: "sid-7" } });
    expect(revokeSessionMock).toHaveBeenCalledWith("u1", "sid-7");
  });

  it("no-ops when token is null", async () => {
    await onSignOutRevoke({ token: null });
    expect(revokeSessionMock).not.toHaveBeenCalled();
  });

  it("no-ops when token is undefined", async () => {
    await onSignOutRevoke({});
    expect(revokeSessionMock).not.toHaveBeenCalled();
  });

  it("no-ops when id is missing", async () => {
    await onSignOutRevoke({ token: { sid: "sid-7" } });
    expect(revokeSessionMock).not.toHaveBeenCalled();
  });

  it("no-ops when sid is missing", async () => {
    await onSignOutRevoke({ token: { id: "u1" } });
    expect(revokeSessionMock).not.toHaveBeenCalled();
  });
});
