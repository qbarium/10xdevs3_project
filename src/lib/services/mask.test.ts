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

  it("maskuje token base64url i base64-standard bez prefiksu (regresja F1)", () => {
    // base64url z `-`/`_` — bez tej klasy znaki rozbijały token poniżej progu długości
    expect(maskSecrets("O89Bp7FsBvaQ_PQLLVAzaaXShoWRC1uh6YAekqU0_xY")).toBe("[REDACTED]");
    // base64-standard z `+`/`/`/`=`
    expect(maskSecrets("jE8kPq2mZ9Rf7nL0wXAcV1bN3sT4uY6dG+h/kQ==")).toBe("[REDACTED]");
  });

  it("maskuje sekret wewnątrz serializowanego obiektu", () => {
    const out = maskUnknown({ apiKey: "sk-abcdefghijklmnopqrstuvwxyz1234", note: "ok" });
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abcdefghij");
    expect(out).toContain("ok");
  });

  // --- Granica backstopu (ryzyko #1) ------------------------------------------------------------
  // Masker to BACKSTOP, nie obrona pierwszej linii. Walidacja wejścia klucza (byok-key.ts) to tylko
  // trim + niepusty, więc krótki lub nie-`sk-` klucz jest DOPUSZCZONY, ale NIE pasuje do wzorca maskera
  // (`sk-`+{20,} znaków albo ≥32-znakowa wysoka entropia) → przechodzi NIEzamaskowany. To znane,
  // świadome ograniczenie: pierwsza linia obrony to „klucz nigdy nie trafia do loggera" (ESLint
  // no-console + dyscyplina), a klucze OpenAI są zawsze `sk-`+długie. Poniższe testy CHARAKTERYZUJĄ
  // granicę (nie zgłaszają buga); jeśli kiedyś rozszerzymy masker/walidację, świadomie je zaktualizuj.
  it("NIE maskuje krótkiego klucza sk- poniżej progu długości (znana granica backstopu)", () => {
    expect(maskSecrets("sk-abc123")).toBe("sk-abc123");
  });

  it("NIE maskuje krótkiego klucza bez prefiksu sk- (znana granica backstopu)", () => {
    expect(maskSecrets("moj-tajny-klucz-42")).toBe("moj-tajny-klucz-42");
  });
});
