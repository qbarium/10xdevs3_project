import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  buildSearchOrFilter,
  getActiveItems,
  getPendingItems,
  getSessionItems,
  getTrashItems,
  listItems,
} from "@/lib/services/items";
import { defaultCriteria } from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";

// Mock łańcucha query-buildera Supabase: każda metoda rejestruje argumenty i zwraca ten sam `builder`
// (thenable rozwiązywalny do skonfigurowanego wyniku). Pozwala zweryfikować, że `listItems` składa właściwy
// predykat/filtr/sort — bez realnej bazy (to pokrywają testy integracyjne). Wzorzec z `items-mutation.test.ts`
// poszerzony o `.or()` (wyszukiwanie).
interface Result {
  data: unknown;
  error: unknown;
}
type Call = [string, unknown[]];

function mockSupabase(result: Result): { supabase: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  for (const method of ["from", "select", "eq", "in", "or", "order", "overrideTypes"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return { supabase: builder as unknown as SupabaseClient, calls };
}

const ROWS = [{ id: "a" }, { id: "b" }];

/** Kryteria widoku z domyślnych + nadpisania. */
function criteria(over: Partial<ListCriteria> & { view: ListCriteria["view"] }): ListCriteria {
  return { ...defaultCriteria(over.view), ...over };
}

function argsOf(calls: Call[], method: string): unknown[][] {
  return calls.filter(([m]) => m === method).map(([, args]) => args);
}

describe("listItems — predykat widoku", () => {
  it("pending → eq acceptance_status pending (+ jawny user_id)", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "pending" }));
    expect(argsOf(calls, "eq")).toContainEqual(["user_id", "u"]);
    expect(argsOf(calls, "eq")).toContainEqual(["acceptance_status", "pending"]);
  });

  it("active → eq accepted + in operational_status new/in_progress", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "active" }));
    expect(argsOf(calls, "eq")).toContainEqual(["acceptance_status", "accepted"]);
    expect(argsOf(calls, "in")).toContainEqual(["operational_status", ["new", "in_progress"]]);
  });

  it("done → eq accepted + eq operational_status done", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "done" }));
    expect(argsOf(calls, "eq")).toContainEqual(["acceptance_status", "accepted"]);
    expect(argsOf(calls, "eq")).toContainEqual(["operational_status", "done"]);
  });

  it("cancelled → eq operational_status cancelled", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "cancelled" }));
    expect(argsOf(calls, "eq")).toContainEqual(["operational_status", "cancelled"]);
  });

  it("trash → in acceptance_status rejected/deleted", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "trash" }));
    expect(argsOf(calls, "in")).toContainEqual(["acceptance_status", ["rejected", "deleted"]]);
  });
});

describe("listItems — filtr typu", () => {
  it("type !== all → eq type", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "active", type: "task" }));
    expect(argsOf(calls, "eq")).toContainEqual(["type", "task"]);
  });

  it("type all → brak eq type", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "active", type: "all" }));
    expect(argsOf(calls, "eq").some(([col]) => col === "type")).toBe(false);
  });
});

describe("listItems — podfiltr operacyjny (tylko active)", () => {
  it("active + opstatus → eq operational_status", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "active", opstatus: "in_progress" }));
    expect(argsOf(calls, "eq")).toContainEqual(["operational_status", "in_progress"]);
  });

  it("opstatus ignorowany poza active (nie dokłada eq z opstatus — zostaje tylko predykat widoku)", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", { ...defaultCriteria("done"), opstatus: "new" });
    expect(argsOf(calls, "eq")).not.toContainEqual(["operational_status", "new"]);
    expect(argsOf(calls, "eq")).toContainEqual(["operational_status", "done"]);
  });
});

describe("listItems — wyszukiwanie", () => {
  it("niepusta fraza → .or z ilike po title i description", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "active", q: "raport" }));
    const orArg = argsOf(calls, "or")[0]?.[0];
    expect(orArg).toContain("title.ilike.");
    expect(orArg).toContain("description.ilike.");
    expect(orArg).toContain("raport");
  });

  it("pusta / whitespace fraza → brak .or", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "active", q: "   " }));
    expect(argsOf(calls, "or")).toHaveLength(0);
  });
});

describe("buildSearchOrFilter — neutralizacja (F4)", () => {
  it("przecinek usera w cudzysłowach (nie rozbija dwóch warunków .or)", () => {
    expect(buildSearchOrFilter("foo,bar")).toBe('title.ilike."%foo,bar%",description.ilike."%foo,bar%"');
  });

  it("nawiasy frazy w cudzysłowach (nie rozbijają grupowania)", () => {
    expect(buildSearchOrFilter("f(x)")).toBe('title.ilike."%f(x)%",description.ilike."%f(x)%"');
  });

  it("wildcardy LIKE % i _ escapowane (potem podwojone przez quoting PostgREST)", () => {
    // % → \% , _ → \_ (warstwa LIKE); następnie warstwa quotingu podwaja backslashe → \\% \\_
    expect(buildSearchOrFilter("50%_")).toContain('"%50\\\\%\\\\_%"');
  });
});

describe("listItems — sort + łańcuch tie-break", () => {
  it("domyślny pending: created_at desc → id asc", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", defaultCriteria("pending"));
    expect(argsOf(calls, "order")).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("domyślny non-pending: updated_at desc → created_at desc → id asc", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", defaultCriteria("active"));
    expect(argsOf(calls, "order")).toEqual([
      ["updated_at", { ascending: false }],
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("sort title asc: title asc → created_at desc → id asc", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "active", sort: "title", dir: "asc" }));
    expect(argsOf(calls, "order")).toEqual([
      ["title", { ascending: true }],
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("sort created asc: created_at asc → id asc (bez dodatkowego created_at)", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await listItems(supabase, "u", criteria({ view: "pending", sort: "created", dir: "asc" }));
    expect(argsOf(calls, "order")).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });
});

describe("listItems — wynik / błąd", () => {
  it("zwraca data na sukces", async () => {
    const { supabase } = mockSupabase({ data: ROWS, error: null });
    expect(await listItems(supabase, "u", defaultCriteria("active"))).toBe(ROWS);
  });

  it("rzuca na błąd serwera", async () => {
    const { supabase } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(listItems(supabase, "u", defaultCriteria("active"))).rejects.toThrow();
  });
});

describe("getSessionItems (S-10: scope po sesji, wszystkie stany akceptacji)", () => {
  it("eq user_id + eq import_session_id, BEZ filtra acceptance_status, sort created_at asc → id asc", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    const res = await getSessionItems(supabase, "u", "sess-1");

    expect(res).toBe(ROWS);
    expect(argsOf(calls, "eq")).toContainEqual(["user_id", "u"]);
    expect(argsOf(calls, "eq")).toContainEqual(["import_session_id", "sess-1"]);
    // Scope, nie view — żaden predykat na stan akceptacji (panel pokazuje wszystkie 4 stany).
    expect(argsOf(calls, "eq").some(([col]) => col === "acceptance_status")).toBe(false);
    expect(argsOf(calls, "in")).toHaveLength(0);
    expect(argsOf(calls, "order")).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("rzuca na błąd serwera", async () => {
    const { supabase } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(getSessionItems(supabase, "u", "s")).rejects.toThrow();
  });
});

describe("nakładki widoków delegują do listItems z domyślnymi kryteriami", () => {
  it("getPendingItems → predykat pending + sort created_at desc/id asc", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await getPendingItems(supabase, "u");
    expect(argsOf(calls, "eq")).toContainEqual(["acceptance_status", "pending"]);
    expect(argsOf(calls, "order")).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("getActiveItems → accepted + in new/in_progress", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await getActiveItems(supabase, "u");
    expect(argsOf(calls, "eq")).toContainEqual(["acceptance_status", "accepted"]);
    expect(argsOf(calls, "in")).toContainEqual(["operational_status", ["new", "in_progress"]]);
  });

  it("getTrashItems → in rejected/deleted", async () => {
    const { supabase, calls } = mockSupabase({ data: ROWS, error: null });
    await getTrashItems(supabase, "u");
    expect(argsOf(calls, "in")).toContainEqual(["acceptance_status", ["rejected", "deleted"]]);
  });
});
