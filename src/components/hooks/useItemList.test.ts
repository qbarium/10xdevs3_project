// Testujemy CZYSTĄ logikę wyniesioną z useItemList (bez React — środowisko node, jak useSessionRetry):
// budowa URL fetchu (wstrzyknięcie view + pominięcie domyślnych), mapowanie odpowiedzi oraz fetchList
// z mockiem global `fetch` — w tym ścieżka anulowania (rdzeń „najnowsze wygrywa", F5). Pełne zachowanie
// hooka (debounce/popstate/history/token) weryfikowane ręcznie w Fazach 4-5.

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildListUrl, fetchList, mapListResponse } from "@/components/hooks/useItemList";
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
});

describe("mapListResponse — sukces tylko przy ok+ok:true+tablica", () => {
  it("HTTP ok + ok:true + items → sukces z items", () => {
    expect(mapListResponse(true, { ok: true, items: [{ id: "a" } as never] })).toEqual({
      ok: true,
      items: [{ id: "a" }],
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

  it("sukces → status ok z items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(true, { ok: true, items: [{ id: "a" }] })));
    const outcome = await fetchList(defaultCriteria("active"), new AbortController().signal);
    expect(outcome).toEqual({ status: "ok", items: [{ id: "a" }] });
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
