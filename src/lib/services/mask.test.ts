import { describe, expect, it } from "vitest";

import { maskSecrets, maskUnknown } from "@/lib/services/mask";

describe("mask — maskowanie sekretów", () => {
  it("maskuje klucz z prefiksem sk-", () => {
    const out = maskSecrets("klucz: sk-abcdefghijklmnopqrstuvwxyz1234");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abcdefghij");
  });

  it("maskuje klucz projektowy sk-proj-", () => {
    const out = maskSecrets("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abcdefghij");
  });

  it("przepuszcza długie zdanie (niska entropia)", () => {
    const sentence = "To jest zupełnie zwyczajne zdanie bez żadnych sekretów w środku.";
    expect(maskSecrets(sentence)).toBe(sentence);
  });

  it("przepuszcza UUID (rozbity myślnikami poniżej progu długości)", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(maskSecrets(uuid)).toBe(uuid);
  });

  it("maskuje losowy token wysokiej entropii (fallback)", () => {
    expect(maskSecrets("Xq7Seph0Lm2VbN8kZr4TyWuI9oPaJdFgHcEx5")).toBe("[REDACTED]");
  });

  it("maskuje sekret wewnątrz serializowanego obiektu", () => {
    const out = maskUnknown({ apiKey: "sk-abcdefghijklmnopqrstuvwxyz1234", note: "ok" });
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abcdefghij");
    expect(out).toContain("ok");
  });
});
