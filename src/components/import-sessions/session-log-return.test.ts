import { afterEach, describe, expect, it, vi } from "vitest";

import { rememberSessionLogReturn, sessionLogReturnHref } from "@/components/import-sessions/session-log-return";

/** Minimalny in-memory sessionStorage (środowisko node nie ma window) — wzorzec page-size-pref.test.ts. */
function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) ?? null) : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("session-log-return — adres powrotny dziennika (S-13)", () => {
  it("zapamiętuje query dziennika i buduje z niego adres powrotu", () => {
    vi.stubGlobal("window", {
      sessionStorage: memoryStorage(),
      location: { search: "?page=4&status=failed" },
    });
    rememberSessionLogReturn();
    expect(sessionLogReturnHref()).toBe("/import-sessions?page=4&status=failed");
  });

  it("puste query (dziennik na domyślnych) → goły /import-sessions", () => {
    vi.stubGlobal("window", { sessionStorage: memoryStorage(), location: { search: "" } });
    rememberSessionLogReturn();
    expect(sessionLogReturnHref()).toBe("/import-sessions");
  });

  it("brak zapisu (deep-link do trybu sesji) → goły /import-sessions", () => {
    vi.stubGlobal("window", { sessionStorage: memoryStorage(), location: { search: "" } });
    expect(sessionLogReturnHref()).toBe("/import-sessions");
  });

  it("brak window / storage (SSR) → goły adres, bez rzutu", () => {
    vi.stubGlobal("window", undefined);
    expect(() => {
      rememberSessionLogReturn();
    }).not.toThrow();
    expect(sessionLogReturnHref()).toBe("/import-sessions");
  });
});
