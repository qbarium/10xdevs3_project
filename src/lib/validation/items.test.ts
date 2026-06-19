import { describe, expect, it } from "vitest";

import {
  bulkActionSchema,
  createItemSchema,
  editItemBodySchema,
  editItemSchema,
  operationalActionSchema,
} from "@/lib/validation/items";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("bulkActionSchema", () => {
  it("akceptuje poprawny payload accept", () => {
    expect(bulkActionSchema.safeParse({ ids: [UUID], action: "accept" }).success).toBe(true);
  });

  it("akceptuje reject", () => {
    expect(bulkActionSchema.safeParse({ ids: [UUID], action: "reject" }).success).toBe(true);
  });

  it("odrzuca pustą listę ids", () => {
    expect(bulkActionSchema.safeParse({ ids: [], action: "accept" }).success).toBe(false);
  });

  it("odrzuca > 100 id (safety net)", () => {
    const ids = Array.from({ length: 101 }, () => UUID);
    expect(bulkActionSchema.safeParse({ ids, action: "accept" }).success).toBe(false);
  });

  it("akceptuje dokładnie 100 id", () => {
    const ids = Array.from({ length: 100 }, () => UUID);
    expect(bulkActionSchema.safeParse({ ids, action: "accept" }).success).toBe(true);
  });

  it("odrzuca nie-UUID w ids", () => {
    expect(bulkActionSchema.safeParse({ ids: ["nie-uuid"], action: "accept" }).success).toBe(false);
  });

  it("odrzuca nieznaną action", () => {
    expect(bulkActionSchema.safeParse({ ids: [UUID], action: "delete" }).success).toBe(false);
  });
});

describe("editItemSchema", () => {
  it("akceptuje pełny payload (z operationalStatus) i trimuje title", () => {
    const r = editItemSchema.safeParse({
      title: "  Tytuł  ",
      description: "opis",
      type: "task",
      operationalStatus: "in_progress",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("Tytuł");
      expect(r.data.description).toBe("opis");
      expect(r.data.type).toBe("task");
      expect(r.data.operationalStatus).toBe("in_progress");
    }
  });

  it("odrzuca pusty title (po trim)", () => {
    expect(
      editItemSchema.safeParse({ title: "   ", description: null, type: "note", operationalStatus: "new" }).success,
    ).toBe(false);
  });

  it("normalizuje pusty/whitespace description → null", () => {
    const r = editItemSchema.safeParse({ title: "T", description: "   ", type: "note", operationalStatus: "new" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeNull();
  });

  it("akceptuje description null", () => {
    const r = editItemSchema.safeParse({ title: "T", description: null, type: "idea", operationalStatus: "done" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeNull();
  });

  it("odrzuca nieznany type", () => {
    expect(
      editItemSchema.safeParse({ title: "T", description: null, type: "task2", operationalStatus: "new" }).success,
    ).toBe(false);
  });

  it("odrzuca brak operationalStatus", () => {
    expect(editItemSchema.safeParse({ title: "T", description: null, type: "note" }).success).toBe(false);
  });

  it("odrzuca nieznany operationalStatus", () => {
    expect(
      editItemSchema.safeParse({ title: "T", description: null, type: "note", operationalStatus: "archived" }).success,
    ).toBe(false);
  });
});

describe("editItemBodySchema", () => {
  const base = { title: "T", description: null, type: "note" as const, operationalStatus: "new" as const };

  it("akceptuje pełny payload z expectedUpdatedAt (Z)", () => {
    const r = editItemBodySchema.safeParse({ ...base, expectedUpdatedAt: "2026-01-01T00:00:00Z" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.expectedUpdatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("akceptuje expectedUpdatedAt z offsetem i ułamkiem sekund (kształt PostgREST)", () => {
    expect(
      editItemBodySchema.safeParse({ ...base, expectedUpdatedAt: "2026-06-15T20:11:08.123456+00:00" }).success,
    ).toBe(true);
  });

  it("odrzuca brak expectedUpdatedAt", () => {
    expect(editItemBodySchema.safeParse(base).success).toBe(false);
  });

  it("odrzuca expectedUpdatedAt, który nie jest datą ISO", () => {
    expect(editItemBodySchema.safeParse({ ...base, expectedUpdatedAt: "wczoraj" }).success).toBe(false);
  });

  it("dziedziczy walidację rdzenia (pusty title → odrzucony mimo poprawnego znacznika)", () => {
    expect(
      editItemBodySchema.safeParse({ ...base, title: "   ", expectedUpdatedAt: "2026-01-01T00:00:00Z" }).success,
    ).toBe(false);
  });
});

describe("createItemSchema", () => {
  it("akceptuje poprawny payload i trimuje title", () => {
    const r = createItemSchema.safeParse({ title: "  Nowy  ", description: "opis", type: "task" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("Nowy");
      expect(r.data.description).toBe("opis");
      expect(r.data.type).toBe("task");
    }
  });

  it("odrzuca pusty title (po trim)", () => {
    expect(createItemSchema.safeParse({ title: "   ", description: null, type: "note" }).success).toBe(false);
  });

  it("odrzuca nieznany type", () => {
    expect(createItemSchema.safeParse({ title: "T", description: null, type: "task2" }).success).toBe(false);
  });

  it("normalizuje pusty/whitespace description → null", () => {
    const r = createItemSchema.safeParse({ title: "T", description: "   ", type: "idea" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeNull();
  });

  it("akceptuje description null", () => {
    const r = createItemSchema.safeParse({ title: "T", description: null, type: "decision" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeNull();
  });

  // Inwariant fail-closed: niezmienniki ustala serwer, więc schemat MUSI usuwać przemycone pola stanu.
  it("ignoruje nadmiarowe pola stanu (acceptance_status / operational_status / import_session_id / user_id)", () => {
    const r = createItemSchema.safeParse({
      title: "T",
      description: null,
      type: "task",
      acceptance_status: "pending",
      operational_status: "done",
      import_session_id: "11111111-1111-4111-8111-111111111111",
      user_id: "haker",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("acceptance_status");
      expect(r.data).not.toHaveProperty("operational_status");
      expect(r.data).not.toHaveProperty("import_session_id");
      expect(r.data).not.toHaveProperty("user_id");
    }
  });
});

describe("operationalActionSchema", () => {
  it("akceptuje poprawny payload dla każdego z 4 stanów (przechodniość na danych)", () => {
    for (const status of ["new", "in_progress", "done", "cancelled"] as const) {
      expect(operationalActionSchema.safeParse({ ids: [UUID], status }).success).toBe(true);
    }
  });

  it("odrzuca pustą listę ids", () => {
    expect(operationalActionSchema.safeParse({ ids: [], status: "done" }).success).toBe(false);
  });

  it("odrzuca > 100 id (safety net)", () => {
    const ids = Array.from({ length: 101 }, () => UUID);
    expect(operationalActionSchema.safeParse({ ids, status: "done" }).success).toBe(false);
  });

  it("akceptuje dokładnie 100 id", () => {
    const ids = Array.from({ length: 100 }, () => UUID);
    expect(operationalActionSchema.safeParse({ ids, status: "cancelled" }).success).toBe(true);
  });

  it("odrzuca nie-UUID w ids", () => {
    expect(operationalActionSchema.safeParse({ ids: ["nie-uuid"], status: "new" }).success).toBe(false);
  });

  it("odrzuca nieznany status", () => {
    expect(operationalActionSchema.safeParse({ ids: [UUID], status: "archived" }).success).toBe(false);
  });
});
