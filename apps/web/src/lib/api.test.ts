import { describe, it, expect } from "vitest";
import { ok, err } from "./api";

describe("api envelope", () => {
  it("ok() returns a 200 with { ok: true, data }", async () => {
    const res = ok({ hello: "world" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { hello: "world" } });
  });

  it("ok() accepts a custom status", async () => {
    const res = ok({ id: "1" }, 201);
    expect(res.status).toBe(201);
  });

  it("err() returns the given status with { ok: false, error }", async () => {
    const res = err("NOT_FOUND", "Tournament not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Tournament not found" },
    });
  });

  it("err() defaults to status 400", () => {
    const res = err("BAD_REQUEST", "Invalid input");
    expect(res.status).toBe(400);
  });
});
