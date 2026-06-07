// Smoke test Fazy 1: potwierdza, że Vitest działa i alias `@/...` jest rozwiązywany.
// Decyzja F2: globale testowe przez jawny import z `vitest` (bez vitest/globals).
import { describe, expect, it } from "vitest";

import { AI_PROVIDER_NAME, BYOK_KEY_PREFIXES, DEFAULT_MASK_CONFIG } from "@/lib/config/byok";

describe("konfiguracja byok (smoke)", () => {
  it("eksportuje prefiks OpenAI i nazwę dostawcy", () => {
    expect(BYOK_KEY_PREFIXES).toContain("sk-");
    expect(AI_PROVIDER_NAME).toBe("OpenAI");
  });

  it("domyślna konfiguracja maskera jest spójna", () => {
    expect(DEFAULT_MASK_CONFIG.keyPrefixes).toBe(BYOK_KEY_PREFIXES);
    expect(DEFAULT_MASK_CONFIG.entropyMinLength).toBeGreaterThan(0);
  });
});
