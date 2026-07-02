// Testujemy CZYSTĄ logikę wyniesioną z useItemList (bez React — środowisko node, jak useSessionRetry):
// budowa URL fetchu (wstrzyknięcie view + pominięcie domyślnych, okno strony), mapowanie odpowiedzi
// (z `total` i bez), klasyfikację zmiany kryteriów (isSearchOnlyChange z resetem strony) oraz fetchList
// z mockiem global `fetch` — w tym ścieżkę anulowania (rdzeń „najnowsze wygrywa", F5). Pełne zachowanie
// hooka (debounce/popstate/history/token/auto-cofnięcie) weryfikowane ręcznie.

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildListUrl, fetchList, isSearchOnlyChange, mapListResponse } from "@/components/hooks/useItemList";
import { defaultCriteria } from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";

function criteria(over: Partial<ListCriteria> & { view: ListCriteria["view"] }): ListCriteria {
  return { ...defaultCriteria(over.view), ...over };
}

/** Minimalny stub Response: tylko `ok` + `json()` (fetchList nie czyta nic więcej). */
function fakeResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

afterEach(() => vi.unstubAllGlobals());

describe("buildListUrl — wstrzykuje view, pomija domyślne", () => {
  it("same domyślne → tylko view", () => {
    expect(buildListUrl(defaultCriteria("active"))).toBe("/api/items?view=active");
    expect(buildListUrl(defaultCriteria("pending"))).toBe("/api/items?view=pending");
  });

  it("pola różne od domyślnych dołączone po view", () => {
    expect(buildListUrl(criteria({ view: "active", type: "task", sort: "title", dir: "asc" }))).toBe(
      "/api/items?view=active&type=task&sort=title&dir=asc",
    );
  });

  it("opstatus tylko dla active (criteriaToQuery go pomija poza active)", () => {
    expect(buildListUrl(criteria({ view: "active", opstatus: "in_progress" }))).toBe(
      "/api/items?view=active&opstatus=in_progress",
    );
  });

  it("okno strony w adresie: page > 1 i size ≠ domyślny (S-13 F2)", () => {
    expect(buildListUrl(criteria({ view: "active", page: 3, size: 25 }))).toBe("/api/items?view=active&page=3&size=25");
    expect(buildListUrl(criteria({ view: "pending", page: 2 }))).toBe("/api/items?view=pending&page=2");
  });
});

describe("buildListUrl — gałąź trybu sesji (S-13 F4)", () => {
  it("session → endpoint sesyjny z oknem ZAWSZE jawnym, bez view", () => {
    const c = criteria({ view: "pending", session: "11111111-1111-4111-8111-111111111111" });
    expect(buildListUrl(c)).toBe("/api/import-sessions/11111111-1111-4111-8111-111111111111/items?page=1&size=10");
  });

  it("okno niedomyślne w adresie żądania", () => {
    expect(buildListUrl(criteria({ view: "pending", session: "s1", page: 3, size: 25 }))).toBe(
      "/api/import-sessions/s1/items?page=3&size=25",
    );
  });
});

describe("mapListResponse — sukces tylko przy ok+ok:true+tablica", () => {
  it("HTTP ok + ok:true + items + total → sukces z items i total", () => {
    expect(mapListResponse(true, { ok: true, items: [{ id: "a" } as never], total: 42 })).toEqual({
      ok: true,
      items: [{ id: "a" }],
      total: 42,
    });
  });

  it("brak liczbowego total → items.length (tolerancyjnie)", () => {
    expect(mapListResponse(true, { ok: true, items: [{ id: "a" } as never, { id: "b" } as never] })).toEqual({
      ok: true,
      items: [{ id: "a" }, { id: "b" }],
      total: 2,
    });
    expect(mapListResponse(true, { ok: true, items: [], total: "x" as never })).toEqual({
      ok: true,
      items: [],
      total: 0,
    });
  });

  it("HTTP nie-ok → porażka (mimo ok:true w body)", () => {
    expect(mapListResponse(false, { ok: true, items: [] })).toEqual({ ok: false });
  });

  it("ok:false → porażka", () => {
    expect(mapListResponse(true, { ok: false })).toEqual({ ok: false });
  });

  it("brak items / items nie-tablica → porażka", () => {
    expect(mapListResponse(true, { ok: true })).toEqual({ ok: false });
    expect(mapListResponse(true, { ok: true, items: "x" as never })).toEqual({ ok: false });
  });
});

describe("isSearchOnlyChange — klasyfikacja zmiany kryteriów (debounce + replaceState)", () => {
  const base = defaultCriteria("active");

  it("zmiana samej frazy q → true", () => {
    expect(isSearchOnlyChange(base, { ...base, q: "foo" })).toBe(true);
  });

  it("zmiana q z resetem strony (page ignorowane) → nadal true (S-13 F2)", () => {
    expect(isSearchOnlyChange({ ...base, page: 4 }, { ...base, q: "foo", page: 1 })).toBe(true);
  });

  it("zmiana q razem z filtrem/sortem/rozmiarem → false", () => {
    expect(isSearchOnlyChange(base, { ...base, q: "foo", type: "task" })).toBe(false);
    expect(isSearchOnlyChange(base, { ...base, q: "foo", sort: "title" })).toBe(false);
    expect(isSearchOnlyChange(base, { ...base, q: "foo", size: 25 })).toBe(false);
  });

  it("brak zmiany q → false (nawet gdy zmienia się strona)", () => {
    expect(isSearchOnlyChange(base, { ...base, page: 2 })).toBe(false);
    expect(isSearchOnlyChange(base, base)).toBe(false);
  });
});

describe("fetchList — fetch + mapowanie + anulowanie", () => {
  it("woła endpoint z URL z buildListUrl i przekazuje signal", async () => {
    const f = vi.fn().mockResolvedValue(fakeResponse(true, { ok: true, items: [] }));
    vi.stubGlobal("fetch", f);
    await fetchList(criteria({ view: "trash", type: "note" }), new AbortController().signal);
    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/items?view=trash&type=note");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sukces → status ok z items i total", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(true, { ok: true, items: [{ id: "a" }], total: 7 })));
    const outcome = await fetchList(defaultCriteria("active"), new AbortController().signal);
    expect(outcome).toEqual({ status: "ok", items: [{ id: "a" }], total: 7 });
  });

  it("odpowiedź nie-ok → status error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(false, { ok: false })));
    expect((await fetchList(defaultCriteria("active"), new AbortController().signal)).status).toBe("error");
  });

  it("błąd sieci (rzut nie-abort) → status error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await fetchList(defaultCriteria("active"), new AbortController().signal)).status).toBe("error");
  });

  it("AbortError → status aborted (połknięte, NIE błąd)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError()));
    expect((await fetchList(defaultCriteria("active"), new AbortController().signal)).status).toBe("aborted");
  });

  // F5: żądanie wiszące do przerwania signal → aborted; rdzeń „najnowsze wygrywa" (selekcję najnowszego
  // robi token w hooku, ale anulowane pobranie MUSI zwrócić `aborted`, nie podmienić listy).
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
    const pending = fetchList(defaultCriteria("active"), controller.signal);
    controller.abort();
    expect((await pending).status).toBe("aborted");
  });
});
