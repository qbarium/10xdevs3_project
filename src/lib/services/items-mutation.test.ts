import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  deriveOperationalStatus,
  editItem,
  ItemConflictError,
  ItemNotEditableError,
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
  for (const method of ["from", "update", "in", "eq", "select", "order", "overrideTypes", "maybeSingle"]) {
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

describe("setAcceptanceStatus", () => {
  it("buduje guarded UPDATE i zwraca tylko zmienione id", async () => {
    const { supabase, calls } = mockSupabase({ data: [{ id: "a" }, { id: "b" }], error: null });
    const res = await setAcceptanceStatus(supabase, ["a", "b", "c"], "accepted");

    expect(res.updatedIds).toEqual(["a", "b"]); // "c" pominięty (guard pending) — nie ma go w data
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
