import { afterEach, describe, expect, it, vi } from "vitest";

import { logger, reportError } from "@/lib/services/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Przechwytuje pojedynczy argument string przekazany do danej metody console. */
function captureConsole(method: "info" | "warn" | "error"): () => string {
  let captured = "";
  vi.spyOn(console, method).mockImplementation((arg: unknown) => {
    captured = typeof arg === "string" ? arg : "";
  });
  return () => captured;
}

describe("logger — maskowanie i odporność", () => {
  it("logger.error maskuje klucz sk- w wiadomości", () => {
    const read = captureConsole("error");
    logger.error("błąd z kluczem sk-abcdefghijklmnopqrstuvwxyz1234");
    expect(read()).toContain("[REDACTED]");
    expect(read()).not.toContain("abcdefghij");
  });

  it("nie rzuca przy strukturze cyklicznej i daje [unserializable]", () => {
    const read = captureConsole("info");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => {
      logger.info("cykl", cyclic);
    }).not.toThrow();
    expect(read()).toContain("[unserializable]");
  });

  it("nie rzuca przy polu BigInt", () => {
    const read = captureConsole("warn");
    expect(() => {
      logger.warn("bigint", { n: 1n });
    }).not.toThrow();
    expect(read()).toContain("[unserializable]");
  });

  it("reportError maskuje sekret w cause", () => {
    const read = captureConsole("error");
    const inner = new Error("klucz sk-abcdefghijklmnopqrstuvwxyz1234");
    reportError(new Error("zewnętrzny błąd", { cause: inner }));
    expect(read()).toContain("[REDACTED]");
    expect(read()).not.toContain("abcdefghij");
  });

  it("reportError maskuje sekret w polu zagnieżdżonym (config.headers.authorization)", () => {
    const read = captureConsole("error");
    const err = Object.assign(new Error("HTTP 401"), {
      config: { headers: { authorization: "sk-abcdefghijklmnopqrstuvwxyz1234" } },
    });
    reportError(err);
    expect(read()).toContain("[REDACTED]");
    expect(read()).not.toContain("abcdefghij");
  });
});
