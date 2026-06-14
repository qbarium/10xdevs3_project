// S-08 Faza 4 (4.2): test mapowania odpowiedzi endpointu retry na stan końcowy hooka.
// Testujemy czystą mapRetryResponse (wyniesioną z useSessionRetry) — bez React, w środowisku node,
// zgodnie z wzorcem ekstrakcji logiki w tym repo (selection.ts / edit-form.ts).

import { describe, expect, it } from "vitest";

import { mapRetryResponse } from "@/components/hooks/useSessionRetry";

describe("mapRetryResponse", () => {
  it("200 ok + completed_with_items → done z liczbą wpisów, bez błędu", () => {
    const o = mapRetryResponse(true, { ok: true, status: "completed_with_items", itemCount: 5 });
    expect(o.state).toBe("done");
    expect(o.result).toEqual({ status: "completed_with_items", itemCount: 5, code: null, message: null });
    expect(o.error).toBeNull();
  });

  it("200 ok + completed_no_items → done z itemCount 0", () => {
    const o = mapRetryResponse(true, { ok: true, status: "completed_no_items" });
    expect(o.state).toBe("done");
    expect(o.result.status).toBe("completed_no_items");
    expect(o.result.itemCount).toBe(0);
  });

  it("200 ok + failed (ponowna porażka klasyfikacji) → done ze stanem failed + kodem", () => {
    // `failed` jest rozstrzygniętym stanem sesji (200 ok:true) — wiersz pokaże nowy błąd, nie gałąź error.
    const o = mapRetryResponse(true, { ok: true, status: "failed", code: "invalid_key" });
    expect(o.state).toBe("done");
    expect(o.result.status).toBe("failed");
    expect(o.result.code).toBe("invalid_key");
  });

  it("422 too_many_items (ok:false) → error, NIE done", () => {
    const o = mapRetryResponse(false, { ok: false, status: "failed", code: "too_many_items" });
    expect(o.state).toBe("error");
    expect(o.result.code).toBe("too_many_items");
  });

  it("409 missing_key → error z komunikatem i kodem", () => {
    const o = mapRetryResponse(false, { ok: false, code: "missing_key", error: "Klucz usunięty z profilu." });
    expect(o.state).toBe("error");
    expect(o.error).toBe("Klucz usunięty z profilu.");
    expect(o.result.code).toBe("missing_key");
  });

  it("409 not_retryable → error", () => {
    const o = mapRetryResponse(false, { ok: false, code: "not_retryable" });
    expect(o.state).toBe("error");
    expect(o.result.code).toBe("not_retryable");
  });

  it("brak status / pusta odpowiedź → error z fallback code 'request' i error null", () => {
    const o = mapRetryResponse(false, {});
    expect(o.state).toBe("error");
    expect(o.result.code).toBe("request");
    expect(o.error).toBeNull();
  });

  it("ok:true ale status spoza SESSION_STATES → error (guard rozstrzygniętego stanu)", () => {
    const o = mapRetryResponse(true, { status: "weird" });
    expect(o.state).toBe("error");
    expect(o.result.code).toBe("request");
  });
});
