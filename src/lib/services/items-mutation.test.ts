import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  deriveOperationalStatus,
  editPendingItem,
  ItemNotEditableError,
  setAcceptanceStatus,
} from "@/lib/services/items-mutation";

// Mock łańcucha query-buildera Supabase: każda metoda zwraca ten sam `builder` (i rejestruje
// argumenty), a `builder` jest thenable rozwiązywalny do skonfigurowanego `{ data, error }`.
// Pozwala zweryfikować, że serwis buduje guarded UPDATE (`eq('acceptance_status','pending')`)
// i poprawnie mapuje wynik — bez realnej bazy (to pokrywają testy integracyjne).
type Call = [string, unknown[]];

function mockSupabase(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
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
  it("note/idea/decision/other → null", () => {
    expect(deriveOperationalStatus("note")).toBeNull();
    expect(deriveOperationalStatus("idea")).toBeNull();
    expect(deriveOperationalStatus("decision")).toBeNull();
    expect(deriveOperationalStatus("other")).toBeNull();
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

describe("editPendingItem", () => {
  it("derywuje operational_status=new dla task i zwraca wiersz", async () => {
    const row = { id: "x", type: "task", operational_status: "new", title: "T" };
    const { supabase, calls } = mockSupabase({ data: row, error: null });
    const res = await editPendingItem(supabase, "x", { title: "T", description: null, type: "task" });

    expect(res).toBe(row);
    expect(firstArgOf(calls, "update").operational_status).toBe("new");
    expect(firstArgOf(calls, "update").type).toBe("task");
    expect(calls.filter(([m]) => m === "eq")).toContainEqual(["eq", ["acceptance_status", "pending"]]);
  });

  it("derywuje operational_status=null dla note", async () => {
    const { supabase, calls } = mockSupabase({ data: { id: "x" }, error: null });
    await editPendingItem(supabase, "x", { title: "T", description: null, type: "note" });
    expect(firstArgOf(calls, "update").operational_status).toBeNull();
  });

  it("brak wiersza (maybeSingle → null) → ItemNotEditableError", async () => {
    const { supabase } = mockSupabase({ data: null, error: null });
    await expect(
      editPendingItem(supabase, "x", { title: "T", description: null, type: "note" }),
    ).rejects.toBeInstanceOf(ItemNotEditableError);
  });
});
