import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-guards", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth-guards";
import { GET } from "./route";

const getCurrentUserMock = getCurrentUser as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getCurrentUserMock.mockReset();
});

describe("GET /api/auth/me", () => {
  it("returns the current user when authenticated", async () => {
    const user = { id: "u1", username: "alice", role: "ORGANIZER" };
    getCurrentUserMock.mockResolvedValue(user);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual(user);
  });

  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe("Not authenticated");
  });
});
