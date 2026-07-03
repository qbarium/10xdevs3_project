import { describe, expect, it } from "vitest";

import { isMutatingMethod, isTrustedRequest } from "@/lib/security/csrf";

// UWAGA: `Origin`/`Sec-Fetch-Site` to forbidden headers — konstruktor `Request` (undici) je
// odfiltrowuje (guard "request"). Standalone `new Headers(...)` ma guard "none", więc je zachowuje.
// `isTrustedRequest` czyta wyłącznie `request.headers.get(...)`, więc lekki mock w zupełności starcza
// (wzorzec `as unknown as` jak w istniejących testach endpointów).
function req(headers: Record<string, string>): Request {
  return { headers: new Headers(headers) } as unknown as Request;
}

const APP = new URL("https://tasker-light.example");

describe("isMutatingMethod", () => {
  it("metody bezpieczne → false", () => {
    for (const m of ["GET", "HEAD", "OPTIONS", "get", "head"]) expect(isMutatingMethod(m)).toBe(false);
  });
  it("metody mutujące → true", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post", "delete"]) expect(isMutatingMethod(m)).toBe(true);
  });
});

describe("isTrustedRequest", () => {
  it("Origin same-origin → zaufane", () => {
    expect(isTrustedRequest(req({ origin: APP.origin }), APP)).toBe(true);
  });

  it("Origin cross-site → niezaufane", () => {
    expect(isTrustedRequest(req({ origin: "https://evil.example" }), APP)).toBe(false);
  });

  it("brak Origin + Sec-Fetch-Site: same-origin → zaufane", () => {
    expect(isTrustedRequest(req({ "sec-fetch-site": "same-origin" }), APP)).toBe(true);
  });

  it("brak Origin + Sec-Fetch-Site: cross-site → niezaufane", () => {
    expect(isTrustedRequest(req({ "sec-fetch-site": "cross-site" }), APP)).toBe(false);
  });

  it("brak obu nagłówków → niezaufane (fail-closed)", () => {
    expect(isTrustedRequest(req({}), APP)).toBe(false);
  });
});
