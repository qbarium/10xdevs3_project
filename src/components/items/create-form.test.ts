import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCreatePayload,
  insertCreatedItem,
  readLastItemType,
  writeLastItemType,
} from "@/components/items/create-form";
import type { Item } from "@/types";

describe("buildCreatePayload", () => {
  it("trimuje title i przekazuje type", () => {
    const p = buildCreatePayload("  Nowy  ", "opis", "note");
    expect(p.title).toBe("Nowy");
    expect(p.description).toBe("opis");
    expect(p.type).toBe("note");
  });

  it("pusty / whitespace description → null", () => {
    expect(buildCreatePayload("T", "", "task").description).toBeNull();
    expect(buildCreatePayload("T", "   ", "task").description).toBeNull();
  });
});

describe("readLastItemType / writeLastItemType", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("brak zapisanej wartości → fallback 'task'", () => {
    expect(readLastItemType()).toBe("task");
  });

  it("zapisana poprawna wartość jest odczytywana z powrotem", () => {
    writeLastItemType("idea");
    expect(readLastItemType()).toBe("idea");
  });

  it("nieprawidłowa wartość w localStorage → fallback 'task'", () => {
    localStorage.setItem("tl_lastitemtype", "archived");
    expect(readLastItemType()).toBe("task");
  });
});

describe("readLastItemType bez dostępu do localStorage (SSR / tryb prywatny)", () => {
  it("brak localStorage → fallback 'task' (try/catch)", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readLastItemType()).toBe("task");
    vi.unstubAllGlobals();
  });
});

describe("insertCreatedItem (reducer insert+pin)", () => {
  const mk = (id: string, type: Item["type"] = "task"): Item => ({
    id,
    user_id: "u",
    import_session_id: null,
    type,
    title: "T",
    description: null,
    acceptance_status: "accepted",
    operational_status: "new",
    created_at: "2026-06-17T00:00:00Z",
    updated_at: "2026-06-17T00:00:00Z",
  });

  it("nowy item trafia NA POCZĄTEK listy, a jego id do pinnedIds (z zachowaniem wcześniejszych)", () => {
    const existing = [mk("a"), mk("b")];
    const fresh = mk("c", "note");
    const res = insertCreatedItem(existing, new Set(["x"]), fresh);
    expect(res.items.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(res.pinnedIds.has("c")).toBe(true);
    expect(res.pinnedIds.has("x")).toBe(true);
  });

  it("pin jest niezależny od typu — item innego typu i tak przypięty (widoczny mimo filtra)", () => {
    const res = insertCreatedItem([], new Set(), mk("c", "decision"));
    expect(res.items.map((i) => i.id)).toEqual(["c"]);
    expect(res.pinnedIds.has("c")).toBe(true);
  });

  it("nie mutuje wejścia (czysta funkcja)", () => {
    const existing = [mk("a")];
    const pinned = new Set<string>();
    insertCreatedItem(existing, pinned, mk("c"));
    expect(existing).toHaveLength(1);
    expect(pinned.size).toBe(0);
  });
});
