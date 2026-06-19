import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCreatePayload,
  defaultCreateType,
  nextFilterAfterCreate,
  readLastItemType,
  writeLastItemType,
} from "@/components/items/create-form";

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

describe("defaultCreateType (domyślny typ w dialogu)", () => {
  it("konkretny filtr → ten typ (niezależnie od ostatnio użytego)", () => {
    expect(defaultCreateType("note")).toBe("note");
    expect(defaultCreateType("decision")).toBe("decision");
    expect(defaultCreateType("task")).toBe("task");
  });

  it("filtr 'all' → ostatnio użyty typ (fallback 'task' przy braku)", () => {
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
    expect(defaultCreateType("all")).toBe("task"); // brak zapisanego → fallback
    localStorage.setItem("tl_lastitemtype", "idea");
    expect(defaultCreateType("all")).toBe("idea");
    vi.unstubAllGlobals();
  });
});

describe("nextFilterAfterCreate (przełączenie filtra po utworzeniu)", () => {
  it("filtr 'all' → bez zmian (item i tak widoczny; nie zawężamy do jednego typu)", () => {
    expect(nextFilterAfterCreate("all", "note")).toBe("all");
    expect(nextFilterAfterCreate("all", "task")).toBe("all");
  });

  it("filtr zgodny z typem itemu → bez zmian", () => {
    expect(nextFilterAfterCreate("task", "task")).toBe("task");
    expect(nextFilterAfterCreate("note", "note")).toBe("note");
  });

  it("konkretny filtr INNEGO typu → przełącz na typ itemu (item w swoim widoku)", () => {
    expect(nextFilterAfterCreate("task", "note")).toBe("note");
    expect(nextFilterAfterCreate("idea", "decision")).toBe("decision");
    expect(nextFilterAfterCreate("other", "task")).toBe("task");
  });
});
