import { describe, expect, it, vi } from "vitest";

// Sól nieskonfigurowana → fail-closed (analogicznie do byok-crypto.no-kek.test.ts).
vi.mock("astro:env/server", () => ({ CLASSIFICATION_HASH_SALT: undefined }));

import { hashUserId } from "@/lib/services/user-hash";

describe("hashUserId — brak soli (fail-closed)", () => {
  it("rzuca błąd, gdy CLASSIFICATION_HASH_SALT nie jest ustawiony", async () => {
    await expect(hashUserId("dowolny-user")).rejects.toThrow(/CLASSIFICATION_HASH_SALT/);
  });
});
