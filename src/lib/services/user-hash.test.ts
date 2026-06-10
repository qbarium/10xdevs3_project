import { describe, expect, it, vi } from "vitest";

// Statyczna sól testowa (faktoria mocka nie odwołuje się do zmiennych zewnętrznych — hoisting vi.mock).
vi.mock("astro:env/server", () => ({ CLASSIFICATION_HASH_SALT: "test-salt-1234567890" }));

import { hashUserId } from "@/lib/services/user-hash";

describe("hashUserId (FR-025)", () => {
  const userId = "11111111-2222-3333-4444-555555555555";

  it("jest stabilny — ten sam input daje ten sam hash", async () => {
    expect(await hashUserId(userId)).toBe(await hashUserId(userId));
  });

  it("zwraca 64-znakowy hex (HMAC-SHA256 = 32 bajty)", async () => {
    const hash = await hashUserId(userId);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("nie zawiera surowego identyfikatora", async () => {
    const hash = await hashUserId(userId);
    expect(hash).not.toContain(userId);
  });

  it("różne identyfikatory → różne hashe", async () => {
    expect(await hashUserId("user-a")).not.toBe(await hashUserId("user-b"));
  });
});
