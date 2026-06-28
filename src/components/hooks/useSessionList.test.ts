// Testujemy CZYSTĄ logikę wyniesioną z useSessionList (bez React — środowisko node, jak useItemList):
// budowa URL fetchu (pominięcie domyślnych), mapowanie odpowiedzi (rows + total) oraz fetchSessionList
// z mockiem global `fetch` — w tym ścieżka anulowania (rdzeń „najnowsze wygrywa"). Pełne zachowanie hooka
// (popstate/history/token) weryfikowane ręcznie na `npm run preview`.

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSessionListUrl, fetchSessionList, mapSessionResponse } from "@/components/hooks/useSessionList";
import { defaultSessionCriteria } from "@/lib/services/session-list-criteria";
import type { SessionListCriteria } from "@/lib/services/session-list-criteria";

function criteria(over: Partial<SessionListCriteria>): SessionListCriteria {
  return { ...defaultSessionCriteria(), ...over };
}

/** Minimalny stub Response: tylko `ok` + `json()` (fetchSessionList nie czyta nic więcej). */
function fakeResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

afterEach(() => vi.unstubAllGlobals());

describe("buildSessionListUrl — pomija domyślne", () => {
  it("same domyślne → goły endpoint (bez query)", () => {
    expect(buildSessionListUrl(defaultSessionCriteria())).toBe("/api/import-sessions");
  });

  it("pola różne od domyślnych dołączone jako query", () => {
    expect(buildSessionListUrl(criteria({ status: "failed", sort: "created_asc", page: 2 }))).toBe(
      "/api/import-sessions?status=failed&sort=created_asc&page=2",
    );
  });
});

describe("mapSessionResponse — sukces tylko przy ok+ok:true+tablica rows", () => {
  it("HTTP ok + ok:true + rows + total → sukces", () => {
    expect(mapSessionResponse(true, { ok: true, rows: [{ id: "a" } as never], total: 7 })).toEqual({
      ok: true,
      rows: [{ id: "a" }],
      total: 7,
    });
  });

  it("brak total → total = długość rows (fallback)", () => {
    expect(mapSessionResponse(true, { ok: true, rows: [{ id: "a" } as never, { id: "b" } as never] })).toEqual({
      ok: true,
      rows: [{ id: "a" }, { id: "b" }],
      total: 2,
    });
  });

  it("HTTP nie-ok → porażka (mimo ok:true w body)", () => {
    expect(mapSessionResponse(false, { ok: true, rows: [] })).toEqual({ ok: false });
  });

  it("ok:false → porażka", () => {
    expect(mapSessionResponse(true, { ok: false })).toEqual({ ok: false });
  });

  it("brak rows / rows nie-tablica → porażka", () => {
    expect(mapSessionResponse(true, { ok: true })).toEqual({ ok: false });
    expect(mapSessionResponse(true, { ok: true, rows: "x" as never })).toEqual({ ok: false });
  });
});

describe("fetchSessionList — fetch + mapowanie + anulowanie", () => {
  it("woła endpoint z URL z buildSessionListUrl i przekazuje signal", async () => {
    const f = vi.fn().mockResolvedValue(fakeResponse(true, { ok: true, rows: [], total: 0 }));
    vi.stubGlobal("fetch", f);
    await fetchSessionList(criteria({ status: "failed" }), new AbortController().signal);
    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/import-sessions?status=failed");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sukces → status ok z rows i total", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(true, { ok: true, rows: [{ id: "a" }], total: 3 })));
    const outcome = await fetchSessionList(defaultSessionCriteria(), new AbortController().signal);
    expect(outcome).toEqual({ status: "ok", rows: [{ id: "a" }], total: 3 });
  });

  it("odpowiedź nie-ok → status error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(false, { ok: false })));
    expect((await fetchSessionList(defaultSessionCriteria(), new AbortController().signal)).status).toBe("error");
  });

  it("błąd sieci (rzut nie-abort) → status error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await fetchSessionList(defaultSessionCriteria(), new AbortController().signal)).status).toBe("error");
  });

  it("AbortError → status aborted (połknięte, NIE błąd)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError()));
    expect((await fetchSessionList(defaultSessionCriteria(), new AbortController().signal)).status).toBe("aborted");
  });

  // Żądanie wiszące do przerwania signal → aborted; rdzeń „najnowsze wygrywa" (selekcję robi token w hooku,
  // ale anulowane pobranie MUSI zwrócić `aborted`, nie podmienić listy).
  it("przerwanie signal w locie → aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(abortError());
          });
        });
      }),
    );
    const controller = new AbortController();
    const pending = fetchSessionList(defaultSessionCriteria(), controller.signal);
    controller.abort();
    expect((await pending).status).toBe("aborted");
  });
});
