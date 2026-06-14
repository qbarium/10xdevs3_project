import { describe, expect, it } from "vitest";

import {
  allIds,
  isAllSelected,
  removeByIds,
  requiresConfirmation,
  toggleSelection,
} from "@/components/items/selection";
import type { Item } from "@/types";

const item = (id: string): Item => ({
  id,
  user_id: "u",
  import_session_id: null,
  type: "note",
  title: id,
  description: null,
  acceptance_status: "pending",
  operational_status: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("toggleSelection", () => {
  it("dodaje brakujące id (nowy Set)", () => {
    const base = new Set<string>(["a"]);
    const next = toggleSelection(base, "b");
    expect([...next].sort()).toEqual(["a", "b"]);
    expect(base.has("b")).toBe(false); // immutable — bazowy Set nietknięty
  });

  it("usuwa istniejące id", () => {
    expect([...toggleSelection(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });
});

describe("allIds / isAllSelected", () => {
  it("allIds zwraca wszystkie widoczne id", () => {
    expect([...allIds([item("a"), item("b")])].sort()).toEqual(["a", "b"]);
  });

  it("isAllSelected: komplet zaznaczony", () => {
    expect(isAllSelected(2, 2)).toBe(true);
  });

  it("isAllSelected: pusta lista nie jest „wszystkie zaznaczone”", () => {
    expect(isAllSelected(0, 0)).toBe(false);
  });

  it("isAllSelected: podzbiór", () => {
    expect(isAllSelected(1, 3)).toBe(false);
  });
});

describe("requiresConfirmation", () => {
  it("zaznaczenie wszystkich wymaga potwierdzenia", () => {
    expect(requiresConfirmation(3, 3)).toBe(true);
  });

  it("ręczny podzbiór nie wymaga potwierdzenia", () => {
    expect(requiresConfirmation(2, 3)).toBe(false);
  });
});

describe("removeByIds (usuwanie po sukcesie serwera)", () => {
  it("usuwa potwierdzone id, nie mutując wejścia", () => {
    const input = [item("a"), item("b"), item("c")];
    const next = removeByIds(input, new Set(["a", "c"]));
    expect(next.map((i) => i.id)).toEqual(["b"]);
    // wejście nietknięte (czysta funkcja) → bezpieczne w setItems((prev) => removeByIds(prev, ...))
    expect(input.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("brak dopasowań → lista bez zmian", () => {
    const items = [item("a")];
    expect(removeByIds(items, new Set(["x"])).map((i) => i.id)).toEqual(["a"]);
  });
});
