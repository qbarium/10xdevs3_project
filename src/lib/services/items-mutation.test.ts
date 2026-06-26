import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createManualItem,
  deriveOperationalStatus,
  editItem,
  ItemConflictError,
  ItemNotEditableError,
  restoreFromTrash,
  setAcceptanceStatus,
  setOperationalStatus,
} from "@/lib/services/items-mutation";

// Mock łańcucha query-buildera Supabase: każda metoda zwraca ten sam `builder` (i rejestruje
// argumenty), a `builder` jest thenable rozwiązywalny do skonfigurowanego wyniku. Pozwala zweryfikować,
// że serwis buduje guarded UPDATE i poprawnie mapuje wynik — bez realnej bazy (to pokrywają testy
// integracyjne). `result` może być POJEDYNCZY (reużyty na każdy await) albo LISTĄ konsumowaną
// sekwencyjnie — to drugie odwzorowuje dwukrokowy UPDATE→SELECT w `editItem` (różne wyniki per zapytanie).
interface Result {
  data: unknown;
  error: unknown;
}
type Call = [string, unknown[]];

function mockSupabase(result: Result | Result[]) {
  const queue = Array.isArray(result) ? [...result] : null;
  const fallback: Result = Array.isArray(result) ? result[result.length - 1] : result;
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      const r = queue && queue.length > 0 ? (queue.shift() ?? fallback) : fallback;
      return Promise.resolve(r).then(onFulfilled, onRejected);
    },
  };
  for (const method of [
    "from",
    "insert",
    "update",
    "in",
    "eq",
    "select",
    "order",
    "overrideTypes",
    "maybeSingle",
    "single",
  ]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    });
  }
  return { supabase: builder as unknown as SupabaseClient, calls };
}

function firstArgOf(calls: Call[], method: string): Record<string, unknown> {
  const call = calls.find(([m]) => m === method);
  if (!call) throw new Error(`brak wywołania ${method}`);
  return call[1][0] as Record<string, unknown>;
}

describe("deriveOperationalStatus", () => {
  it("task → new", () => {
    expect(deriveOperationalStatus("task")).toBe("new");
  });
  it("note/idea/decision/other → new (S-04: wszystkie typy mają stan operacyjny)", () => {
    expect(deriveOperationalStatus("note")).toBe("new");
    expect(deriveOperationalStatus("idea")).toBe("new");
    expect(deriveOperationalStatus("decision")).toBe("new");
    expect(deriveOperationalStatus("other")).toBe("new");
  });
});

describe("createManualItem", () => {
  it("buduje INSERT z niezmiennikami serwera (accepted / new / null session) + jawny updated_at", async () => {
    const row = {
      id: "x",
      type: "note",
      title: "T",
      description: "opis",
      acceptance_status: "accepted",
      operational_status: "new",
      import_session_id: null,
    };
    const { supabase, calls } = mockSupabase({ data: row, error: null });
    const res = await createManualItem(supabase, "user-1", { title: "T", description: "opis", type: "note" });

    expect(res).toBe(row);
    const payload = firstArgOf(calls, "insert");
    expect(payload.user_id).toBe("user-1");
    expect(payload.import_session_id).toBeNull();
    expect(payload.type).toBe("note");
    expect(payload.title).toBe("T");
    expect(payload.description).toBe("opis");
    expect(payload.acceptance_status).toBe("accepted");
    expect(payload.operational_status).toBe("new"); // deriveOperationalStatus(type)
    expect(typeof payload.updated_at).toBe("string"); // jawny updated_at (wzorzec mutacji S-04)
    // SELECT jawnych kolumn (stabilny kształt Item), NIE '*'
    expect(calls.filter(([m]) => m === "select").length).toBe(1);
  });

  it("niezmienniki są STAŁE — payload nie zależy od wejścia (każdy typ → accepted/new)", async () => {
    const { supabase, calls } = mockSupabase({ data: { id: "x" }, error: null });
    await createManualItem(supabase, "user-2", { title: "Idea", description: null, type: "idea" });
    const payload = firstArgOf(calls, "insert");
    expect(payload.acceptance_status).toBe("accepted");
    expect(payload.operational_status).toBe("new");
    expect(payload.import_session_id).toBeNull();
  });

  it("rzuca na błąd serwera", async () => {
    const { supabase } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(
      createManualItem(supabase, "user-1", { title: "T", description: null, type: "task" }),
    ).rejects.toThrow();
  });
});

describe("setAcceptanceStatus", () => {
  it("buduje guarded UPDATE i zwraca świeże wiersze (S-10: Item[], nie samo id)", async () => {
    const rows = [{ id: "a" }, { id: "b" }];
    const { supabase, calls } = mockSupabase({ data: rows, error: null });
    const res = await setAcceptanceStatus(supabase, ["a", "b", "c"], "accepted");

    expect(res).toEqual(rows); // "c" pominięty (guard pending) — nie ma go w data; zwracamy pełne wiersze
    expect(calls.filter(([m]) => m === "eq")).toContainEqual(["eq", ["acceptance_status", "pending"]]);
    expect(calls.filter(([m]) => m === "in")).toContainEqual(["in", ["id", ["a", "b", "c"]]]);
    expect(firstArgOf(calls, "update").acceptance_status).toBe("accepted");
  });

  it("rzuca na błąd serwera", async () => {
    const { supabase } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(setAcceptanceStatus(supabase, ["a"], "rejected")).rejects.toThrow();
  });
});

describe("setOperationalStatus", () => {
  it("buduje guarded UPDATE (accepted) i zwraca tylko zmienione id", async () => {
    const { supabase, calls } = mockSupabase({ data: [{ id: "a" }], error: null });
    const res = await setOperationalStatus(supabase, ["a", "b"], "done");

    expect(res.updatedIds).toEqual(["a"]); // "b" pominięty (guard accepted) — nie ma go w data
    expect(calls.filter(([m]) => m === "eq")).toContainEqual(["eq", ["acceptance_status", "accepted"]]);
    expect(calls.filter(([m]) => m === "in")).toContainEqual(["in", ["id", ["a", "b"]]]);
    expect(firstArgOf(calls, "update").operational_status).toBe("done");
  });

  it("rzuca na błąd serwera", async () => {
    const { supabase } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(setOperationalStatus(supabase, ["a"], "cancelled")).rejects.toThrow();
  });
});

describe("restoreFromTrash (S-10: zwraca świeże wiersze Item[])", () => {
  it("zwraca sumę obu guarded UPDATE (deleted→accepted, rejected→pending) jako Item[]", async () => {
    const rowA = { id: "a", acceptance_status: "accepted" };
    const rowB = { id: "b", acceptance_status: "pending" };
    const { supabase, calls } = mockSupabase([
      { data: [rowA], error: null }, // UPDATE deleted → accepted
      { data: [rowB], error: null }, // UPDATE rejected → pending
    ]);
    const res = await restoreFromTrash(supabase, ["a", "b", "c"]);

    expect(res).toEqual([rowA, rowB]); // pełne wiersze, nie { updatedIds }
    // Każdy UPDATE strzeżony statusem ŹRÓDŁOWYM (dwukierunkowy restore).
    expect(calls.filter(([m]) => m === "eq")).toContainEqual(["eq", ["acceptance_status", "deleted"]]);
    expect(calls.filter(([m]) => m === "eq")).toContainEqual(["eq", ["acceptance_status", "rejected"]]);
    // SELECT pełnych kolumn (ze świeżym updated_at dla panelu sesji), NIE samego "id".
    const selectArgs = calls.filter(([m]) => m === "select").map(([, a]) => a[0] as string);
    expect(selectArgs.length).toBe(2);
    expect(selectArgs.every((cols) => cols.includes("updated_at"))).toBe(true);
  });

  it("rzuca na błąd serwera (pierwszy UPDATE)", async () => {
    const { supabase } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(restoreFromTrash(supabase, ["a"])).rejects.toThrow();
  });
});

describe("editItem", () => {
  const STAMP = "2026-01-01T00:00:00Z";

  it("edycja accepted: guard IN pending|accepted + compare-and-swap, payload USTAWIA operational_status z wejścia", async () => {
    const row = { id: "x", type: "task", operational_status: "done", acceptance_status: "accepted", title: "T" };
    const { supabase, calls } = mockSupabase({ data: row, error: null });
    const res = await editItem(
      supabase,
      "x",
      { title: "T", description: null, type: "task", operationalStatus: "done" },
      STAMP,
    );

    expect(res).toBe(row);
    const payload = firstArgOf(calls, "update");
    expect(payload.title).toBe("T");
    expect(payload.type).toBe("task");
    expect(payload.operational_status).toBe("done"); // jawnie z wejścia (UI prefilluje bieżącą wartość)
    expect(calls.filter(([m]) => m === "in")).toContainEqual(["in", ["acceptance_status", ["pending", "accepted"]]]);
    expect(calls.filter(([m]) => m === "eq")).toContainEqual(["eq", ["updated_at", STAMP]]);
  });

  it("edycja niezmieniająca stanu wysyła bieżącą wartość (zachowanie postępu)", async () => {
    const { supabase, calls } = mockSupabase({ data: { id: "x" }, error: null });
    await editItem(
      supabase,
      "x",
      { title: "T", description: null, type: "note", operationalStatus: "in_progress" },
      STAMP,
    );
    expect(firstArgOf(calls, "update").operational_status).toBe("in_progress");
  });

  it("0 wierszy + follow-up SELECT zwraca edytowalny wiersz (rozjazd updated_at) → ItemConflictError", async () => {
    const { supabase } = mockSupabase([
      { data: null, error: null }, // UPDATE: compare-and-swap nie trafił
      { data: { acceptance_status: "accepted" }, error: null }, // SELECT: wiersz wciąż edytowalny
    ]);
    await expect(
      editItem(supabase, "x", { title: "T", description: null, type: "note", operationalStatus: "new" }, "STALE"),
    ).rejects.toBeInstanceOf(ItemConflictError);
  });

  it("0 wierszy + follow-up SELECT pusty (item zniknął/nie-własny) → ItemNotEditableError", async () => {
    const { supabase } = mockSupabase([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    await expect(
      editItem(supabase, "x", { title: "T", description: null, type: "note", operationalStatus: "new" }, STAMP),
    ).rejects.toBeInstanceOf(ItemNotEditableError);
  });

  it("0 wierszy + follow-up SELECT zwraca status nieedytowalny (rejected) → ItemNotEditableError", async () => {
    const { supabase } = mockSupabase([
      { data: null, error: null },
      { data: { acceptance_status: "rejected" }, error: null },
    ]);
    await expect(
      editItem(supabase, "x", { title: "T", description: null, type: "note", operationalStatus: "new" }, STAMP),
    ).rejects.toBeInstanceOf(ItemNotEditableError);
  });
});
