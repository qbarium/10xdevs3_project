import { describe, expect, it, vi } from "vitest";

import { decryptApiKey, encryptApiKey } from "@/lib/services/byok-crypto";
import { KekNotConfiguredError } from "@/types";

// Brak KEK w konfiguracji → otoczka musi być fail-closed (osobny plik = świeży moduł,
// więc memoizacja klucza nie przecieka z testu ze skonfigurowanym KEK).
vi.mock("astro:env/server", () => ({ BYOK_KEK: undefined }));

describe("byok-crypto — otoczka KEK (brak konfiguracji)", () => {
  it("encryptApiKey → KekNotConfiguredError", async () => {
    await expect(encryptApiKey("cokolwiek")).rejects.toBeInstanceOf(KekNotConfiguredError);
  });

  it("decryptApiKey → KekNotConfiguredError", async () => {
    await expect(decryptApiKey("v1.aaaa.bbbb")).rejects.toBeInstanceOf(KekNotConfiguredError);
  });
});
