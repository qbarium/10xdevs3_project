import { describe, expect, it } from "vitest";

import { bulkActionSchema, editItemSchema, operationalActionSchema } from "@/lib/validation/items";

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
  it("akceptuje pełny payload i trimuje title", () => {
    const r = editItemSchema.safeParse({ title: "  Tytuł  ", description: "opis", type: "task" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("Tytuł");
      expect(r.data.description).toBe("opis");
      expect(r.data.type).toBe("task");
    }
  });

  it("odrzuca pusty title (po trim)", () => {
    expect(editItemSchema.safeParse({ title: "   ", description: null, type: "note" }).success).toBe(false);
  });

  it("normalizuje pusty/whitespace description → null", () => {
    const r = editItemSchema.safeParse({ title: "T", description: "   ", type: "note" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeNull();
  });

  it("akceptuje description null", () => {
    const r = editItemSchema.safeParse({ title: "T", description: null, type: "idea" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeNull();
  });

  it("odrzuca nieznany type", () => {
    expect(editItemSchema.safeParse({ title: "T", description: null, type: "task2" }).success).toBe(false);
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
