// Testujemy CZYSTĄ logikę wyniesioną z useSessionItems (bez React — środowisko node, jak useItemList):
// budowa URL fetchu po sesji i mapowanie odpowiedzi. Pełne zachowanie hooka (AbortController / „ostatnie
// żądanie wygrywa") weryfikowane ręcznie w dev SSR (ryzyko dup-React na wyspie, lessons.md).

import { describe, expect, it } from "vitest";

import { buildSessionItemsUrl, mapSessionItemsResponse } from "@/components/hooks/useSessionItems";

describe("buildSessionItemsUrl — ścieżka endpointu po sesji (scope, bez parametrów filtra)", () => {
  it("wstrzykuje sessionId do ścieżki", () => {
    expect(buildSessionItemsUrl("abc-123")).toBe("/api/import-sessions/abc-123/items");
  });

  it("UUID przechodzi dosłownie", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(buildSessionItemsUrl(uuid)).toBe(`/api/import-sessions/${uuid}/items`);
  });
});

describe("mapSessionItemsResponse — sukces tylko przy ok+ok:true+tablica", () => {
  it("HTTP ok + ok:true + items → sukces z items", () => {
    expect(mapSessionItemsResponse(true, { ok: true, items: [{ id: "a" } as never] })).toEqual({
      ok: true,
      items: [{ id: "a" }],
    });
  });

  it("HTTP nie-ok → porażka (mimo ok:true w body)", () => {
    expect(mapSessionItemsResponse(false, { ok: true, items: [] })).toEqual({ ok: false });
  });

  it("ok:false → porażka", () => {
    expect(mapSessionItemsResponse(true, { ok: false })).toEqual({ ok: false });
  });

  it("brak items / items nie-tablica → porażka", () => {
    expect(mapSessionItemsResponse(true, { ok: true })).toEqual({ ok: false });
    expect(mapSessionItemsResponse(true, { ok: true, items: "x" as never })).toEqual({ ok: false });
  });
});
